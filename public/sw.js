/* eslint-disable no-restricted-globals */
/**
 * Service worker بسيط ومقصود البساطة.
 *
 * قاعدة مهمة: لا نخزّن أي استجابة من /api أبدًا. بيانات الأوردرات والصلاحيات
 * تتغير باستمرار، وتقديم نسخة قديمة منها قد يُظهر لموظف بيانات لم يعد مصرحًا
 * له برؤيتها. التخزين هنا للأصول الساكنة فقط، ولصفحة عدم الاتصال.
 */

const VERSION = 'najd-v1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// ──────────────────────────────── الإشعارات ────────────────────────────────

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'مطبعة نجد';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // إشعارات بنفس الوسم يحلّ أحدثها محل أقدمها بدل تكديسها
      tag: payload.tag || 'najd',
      renotify: Boolean(payload.tag),
      dir: 'rtl',
      lang: 'ar',
      data: { url: payload.url || '/board' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || '/board';

  // لو التطبيق مفتوح بالفعل نركّز نافذته وننقلها للمسار بدل فتح نسخة جديدة
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          return client.focus().then((focused) =>
            focused && 'navigate' in focused ? focused.navigate(target) : focused,
          );
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // لا تخزين للـ API ولا للملفات المرفوعة
  if (url.pathname.startsWith('/api/')) return;

  // التنقل: الشبكة أولًا، وصفحة عدم الاتصال عند الفشل
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // الأصول الساكنة: من الكاش أولًا ثم الشبكة
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);

  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

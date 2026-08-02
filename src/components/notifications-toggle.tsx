'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import toast from 'react-hot-toast';

import { api, apiGet, apiPost } from '@/lib/client';
import { cn } from '@/lib/utils';

/** مفتاح VAPID يصل كنص base64url ويحتاجه المتصفح كمصفوفة بايتات. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

type State = 'loading' | 'unsupported' | 'disabled' | 'off' | 'on' | 'blocked';

/**
 * زر تفعيل إشعارات الجهاز الحالي.
 *
 * الاشتراك مرتبط بالمتصفح لا بالحساب فقط، فالموظف الذي يعمل من الموبايل
 * والديسكتوب يفعّله مرة على كل جهاز.
 *
 * على iPhone لا تعمل إشعارات الويب إلا للتطبيق المثبَّت على الشاشة الرئيسية
 * (iOS 16.4 فأحدث)، ولذلك نوجّه المستخدم للتثبيت أولًا بدل إظهار خطأ مبهم.
 */
export function NotificationsToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }

    try {
      const { enabled } = await apiGet<{ enabled: boolean; publicKey: string | null }>(
        '/api/push/subscribe',
      );
      if (!enabled) {
        setState('disabled');
        return;
      }

      if (Notification.permission === 'denied') {
        setState('blocked');
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      setState(existing ? 'on' : 'off');
    } catch {
      setState('disabled');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    try {
      if (isIosDevice() && !isStandalone()) {
        toast.error('على الآيفون: ثبّت التطبيق على الشاشة الرئيسية أولًا ثم افتحه من أيقونته');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('لم تسمح بالإشعارات. فعّلها من إعدادات المتصفح لهذا الموقع.');
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }

      const { publicKey } = await apiGet<{ enabled: boolean; publicKey: string | null }>(
        '/api/push/subscribe',
      );
      if (!publicKey) {
        toast.error('الإشعارات غير مهيّأة على السيرفر');
        setState('disabled');
        return;
      }

      // ready ينتظر تفعيل الـ service worker — بدونه قد يكون التسجيل موجودًا وغير جاهز
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // مطلوب: كل دفعة يجب أن تُظهر إشعارًا مرئيًا للمستخدم
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      await apiPost('/api/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });

      setState('on');
      toast.success('تم تفعيل الإشعارات على هذا الجهاز');
    } catch (error) {
      toast.error((error as Error).message || 'تعذّر تفعيل الإشعارات');
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        // apiDelete لا يحمل جسمًا، ونحتاج تحديد اشتراك هذا الجهاز بالذات
        await api('/api/push/subscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState('off');
      toast.success('تم إيقاف الإشعارات على هذا الجهاز');
    } catch (error) {
      toast.error((error as Error).message || 'تعذّر إيقاف الإشعارات');
    } finally {
      setBusy(false);
    }
  }

  // لا نعرض الزر أصلًا حيث لا معنى له
  if (state === 'loading' || state === 'unsupported' || state === 'disabled') return null;

  if (state === 'blocked') {
    return (
      <button
        type="button"
        className="btn-ghost h-9 w-9 !px-0 text-slate-400"
        title="الإشعارات محظورة لهذا الموقع — فعّلها من إعدادات المتصفح"
        onClick={() =>
          toast.error('الإشعارات محظورة لهذا الموقع. اسمح بها من إعدادات المتصفح ثم أعد المحاولة.')
        }
        aria-label="الإشعارات محظورة"
      >
        <BellOff className="h-4 w-4" />
      </button>
    );
  }

  const on = state === 'on';

  return (
    <button
      type="button"
      disabled={busy}
      onClick={on ? disable : enable}
      className={cn(
        'btn-ghost h-9 w-9 !px-0 disabled:opacity-50',
        on ? 'text-brand-600 hover:text-brand-700' : 'text-slate-500 hover:text-slate-700',
      )}
      aria-pressed={on}
      title={on ? 'الإشعارات مفعّلة على هذا الجهاز — اضغط للإيقاف' : 'فعّل الإشعارات على هذا الجهاز'}
      aria-label={on ? 'إيقاف الإشعارات' : 'تفعيل الإشعارات'}
    >
      {on ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
    </button>
  );
}

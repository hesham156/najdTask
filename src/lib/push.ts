import 'server-only';

import webpush from 'web-push';

import { prisma } from './prisma';

/**
 * إرسال إشعارات Web Push.
 *
 * المفاتيح تُقرأ من البيئة وقت التشغيل لا وقت البناء، حتى نتمكّن من ضبطها على
 * Railway دون إعادة بناء. لو لم تُضبط فالإشعارات تُتجاهَل بصمت ولا تُعطّل
 * أي عملية أخرى: إرسال إشعار يجب ألا يفشل بسببه حفظ أوردر.
 *
 * لتوليد زوج مفاتيح جديد:  node scripts/generate-vapid-keys.mjs
 */

export type PushPayload = {
  title: string;
  body: string;
  /** المسار الذي يُفتح عند الضغط على الإشعار */
  url?: string;
  /** إشعارات بنفس الوسم يحلّ أحدثها محل أقدمها بدل تكديسها */
  tag?: string;
};

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();

  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }

  // mailto: مطلوب من مواصفة VAPID كوسيلة تواصل مع مشغّل الخدمة
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@najd.local';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function pushEnabled(): boolean {
  return ensureConfigured();
}

/**
 * يرسل إشعارًا لكل أجهزة هؤلاء المستخدمين.
 *
 * لا يرمي أبدًا: أي فشل يُسجَّل ويُبتلع. الاشتراكات التي يرفضها خادم الدفع
 * نهائيًا (410 Gone / 404) تُحذف لأنها لن تعمل مرة أخرى.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;
  if (!ensureConfigured()) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: unique } },
  });
  if (subscriptions.length === 0) return 0;

  const body = JSON.stringify(payload);
  const stale: string[] = [];
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        delivered += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale.push(sub.id);
        } else {
          console.error('[push] فشل إرسال إشعار', status, (error as Error).message);
        }
      }
    }),
  );

  if (stale.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { id: { in: stale } } })
      .catch(() => undefined);
  }

  if (delivered > 0) {
    await prisma.pushSubscription
      .updateMany({
        where: { userId: { in: unique } },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
  }

  return delivered;
}

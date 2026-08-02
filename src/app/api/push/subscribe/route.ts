import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ok, requireUser, route } from '@/lib/api';
import { pushEnabled, pushPublicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';

const schema = z.object({
  endpoint: z.string().trim().url().max(1000),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
  }),
});

/** المفتاح العام لـ VAPID — يحتاجه المتصفح ليشترك. يُقرأ وقت التشغيل. */
export const GET = route(async () => {
  await requireUser();
  return ok({ enabled: pushEnabled(), publicKey: pushPublicKey() });
});

/**
 * تسجيل اشتراك جهاز.
 *
 * الـ endpoint فريد عالميًا، فلو أعاد نفس المتصفح الاشتراك (أو انتقل الجهاز
 * لمستخدم آخر على نفس المتصفح) نُحدّث الصف بدل إنشاء صف مكرر.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = schema.parse(await request.json());

  const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? null;

  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userId: user.id,
      userAgent,
    },
    update: {
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userId: user.id,
      userAgent,
    },
  });

  return ok({ subscribed: true });
});

/** إلغاء اشتراك هذا الجهاز. */
export const DELETE = route(async (request: Request) => {
  const user = await requireUser();
  const { endpoint } = z
    .object({ endpoint: z.string().trim().url().max(1000) })
    .parse(await request.json());

  // نقيّد بالمستخدم حتى لا يلغي أحد اشتراك غيره بمعرفة الـ endpoint
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });

  return ok({ subscribed: false });
});

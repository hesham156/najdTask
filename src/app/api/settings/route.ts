import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, ok, requireUser, route } from '@/lib/api';
import { can } from '@/lib/permissions';
import { getSettings } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireUser();
  const settings = await getSettings();
  const lastOrder = await prisma.order.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  return ok({
    settings,
    lastOrderNumber: lastOrder?.number ?? null,
  });
});

const schema = z.object({
  companyName: z.string().trim().min(1).max(120).optional(),
  companyPhone: z.string().trim().max(40).nullable().optional(),
  companyAddress: z.string().trim().max(300).nullable().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  orderNumberPrefix: z.string().trim().max(10).optional(),
  orderNumberStart: z.coerce.number().int().min(1).max(9_000_000).optional(),
});

export const PATCH = route(async (request: Request) => {
  const user = await requireUser();
  if (!can(user, 'settings.manage')) throw forbidden('تعديل الإعدادات');

  const body = schema.parse(await request.json());
  const current = await getSettings();

  const data: Record<string, unknown> = {
    ...(body.companyName !== undefined ? { companyName: body.companyName } : {}),
    ...(body.companyPhone !== undefined ? { companyPhone: body.companyPhone } : {}),
    ...(body.companyAddress !== undefined ? { companyAddress: body.companyAddress } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.orderNumberPrefix !== undefined
      ? { orderNumberPrefix: body.orderNumberPrefix }
      : {}),
  };

  // تغيير رقم البداية يعني: الأوردر القادم يأخذ هذا الرقم.
  // نمنع اختيار رقم مستخدم بالفعل حتى لا يفشل الحفظ لاحقًا بسبب تكرار الرقم.
  if (body.orderNumberStart !== undefined && body.orderNumberStart !== current.orderNumberStart) {
    const lastOrder = await prisma.order.findFirst({
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    if (lastOrder && body.orderNumberStart <= lastOrder.number) {
      throw badRequest(
        `آخر أوردر رقمه ${lastOrder.number}، فرقم البداية لازم يكون ${lastOrder.number + 1} أو أكبر`,
      );
    }

    data.orderNumberStart = body.orderNumberStart;
    data.nextOrderNumber = body.orderNumberStart;
  }

  const settings = await prisma.settings.update({ where: { id: 'settings' }, data });

  return ok({ settings });
});

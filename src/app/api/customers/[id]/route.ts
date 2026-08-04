import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { forbidden, notFound, ok, requireUser, route } from '@/lib/api';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

async function findCustomerOrThrow(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });
  if (!customer) throw notFound('العميل');
  return customer;
}

// ─────────────────────────────── تعديل عميل ───────────────────────────────

const updateSchema = z.object({
  name: z.string().trim().min(1, 'اكتب اسم العميل').max(160).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  company: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  if (!can(user, 'customers.manage')) throw forbidden('تعديل العملاء');

  const body = updateSchema.parse(await request.json());
  await findCustomerOrThrow(params.id);

  const customer = await prisma.customer.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
      ...(body.company !== undefined ? { company: body.company || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
    },
  });

  return ok({ customer });
});

// ─────────────────────────────── حذف عميل ───────────────────────────────

/**
 * حذف العميل لا يحذف أوردراته: العلاقة onDelete: SetNull، واسم العميل مخزَّن
 * نسخةً ثابتة داخل كل أوردر. ما يضيع هو الربط بين الأوردر وسجل العميل، فتختفي
 * أوردراته من تقرير "أوردرات العميل". لذلك ترجع الاستجابة عدد الأوردرات
 * المتأثرة، والواجهة تذكره في تأكيد الحذف قبل التنفيذ.
 */
export const DELETE = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  if (!can(user, 'customers.manage')) throw forbidden('حذف العملاء');

  const customer = await findCustomerOrThrow(params.id);
  await prisma.customer.delete({ where: { id: customer.id } });

  return ok({ success: true, unlinkedOrders: customer._count.orders });
});

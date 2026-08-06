import { z } from 'zod';

import { insensitive, prisma } from '@/lib/prisma';
import { forbidden, ok, requireUser, route } from '@/lib/api';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const user = await requireUser();
  // من يقدر ينشئ أوردرًا أو يعدّله يحتاج قائمة العملاء ليختار منها عند الربط
  if (!can(user, 'customers.view') && !can(user, 'orders.create') && !can(user, 'orders.edit')) {
    throw forbidden('عرض العملاء');
  }

  const q = new URL(request.url).searchParams.get('q')?.trim();

  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, ...insensitive } },
            { phone: { contains: q } },
            { company: { contains: q, ...insensitive } },
          ],
        }
      : undefined,
    orderBy: { name: 'asc' },
    take: 50,
    include: { _count: { select: { orders: true } } },
  });

  return ok({ customers });
});

const createSchema = z.object({
  name: z.string().trim().min(1, 'اكتب اسم العميل').max(160),
  phone: z.string().trim().max(40).optional().nullable(),
  company: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  if (!can(user, 'customers.manage')) throw forbidden('إضافة العملاء');

  const body = createSchema.parse(await request.json());

  const customer = await prisma.customer.create({
    data: {
      name: body.name,
      phone: body.phone || null,
      company: body.company || null,
      notes: body.notes || null,
    },
  });

  return ok({ customer }, 201);
});

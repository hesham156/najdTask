import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { forbidden, ok, requireUser, route } from '@/lib/api';
import { can } from '@/lib/permissions';
import { assertCanTouchProductionType, findOrderOrThrow, logActivity, syncOrderStageWithItems } from '@/lib/orders';
import { PRODUCTION_TYPES, PRODUCTION_TYPE_LABELS, sanitizeItemOptions } from '@/lib/stages';
import { serializeList } from '@/lib/serialize';
import { notifyItemAssigned } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const schema = z.object({
  productionType: z.enum(PRODUCTION_TYPES),
  title: z.string().trim().min(1, 'اكتب اسم بند الشغل').max(200),
  quantity: z.coerce.number().int().min(1, 'الكمية لا تقل عن 1').default(1),
  specs: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  assigneeId: z.string().trim().optional().nullable(),
  options: z.array(z.string().trim()).max(50).optional(),
});

/** إضافة بند شغل جديد إلى أوردر قائم. */
export const POST = route(async (request: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  if (!can(user, 'items.create')) throw forbidden('إضافة بنود شغل');

  const body = schema.parse(await request.json());
  assertCanTouchProductionType(user, body.productionType);

  if (body.assigneeId && !can(user, 'items.assign')) throw forbidden('إسناد البنود');

  const order = await findOrderOrThrow(params.id);

  const last = await prisma.orderItem.findFirst({
    where: { orderId: order.id, productionType: body.productionType },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const item = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productionType: body.productionType,
      title: body.title,
      quantity: body.quantity,
      specs: body.specs || null,
      notes: body.notes || null,
      options: serializeList(sanitizeItemOptions(body.productionType, body.options ?? [])),
      assigneeId: body.assigneeId || null,
      position: (last?.position ?? -1) + 1,
    },
    include: { assignee: { select: { id: true, name: true } } },
  });

  await logActivity({
    orderId: order.id,
    orderItemId: item.id,
    userId: user.id,
    action: 'item_created',
    details: `أضاف بند ${PRODUCTION_TYPE_LABELS[body.productionType]}: ${item.title}`,
  });

  if (item.assigneeId) {
    await notifyItemAssigned({
      orderId: order.id,
      orderNumber: order.number,
      itemTitle: item.title,
      productionType: item.productionType,
      assigneeId: item.assigneeId,
      actorId: user.id,
    });
  }

  // إضافة بند جديد لأوردر مكتمل تعيده إلى الإنتاج
  await syncOrderStageWithItems(order.id, user.id);

  return ok({ item }, 201);
});

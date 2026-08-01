import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, ok, requireUser, route } from '@/lib/api';
import { can } from '@/lib/permissions';
import { assertCanTouchProductionType, findOrderOrThrow } from '@/lib/orders';

export const dynamic = 'force-dynamic';

const schema = z.object({
  body: z.string().trim().min(1, 'اكتب التعليق').max(2000),
  orderItemId: z.string().trim().optional().nullable(),
});

export const POST = route(async (request: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  if (!can(user, 'comments.create')) throw forbidden('كتابة التعليقات');

  const payload = schema.parse(await request.json());
  const order = await findOrderOrThrow(params.id);

  if (payload.orderItemId) {
    const item = await prisma.orderItem.findUnique({
      where: { id: payload.orderItemId },
      select: { orderId: true, productionType: true },
    });
    if (!item || item.orderId !== order.id) throw badRequest('بند الشغل غير تابع لهذا الأوردر');
    assertCanTouchProductionType(user, item.productionType);
  }

  const comment = await prisma.comment.create({
    data: {
      orderId: order.id,
      orderItemId: payload.orderItemId || null,
      userId: user.id,
      body: payload.body,
    },
    include: { user: { select: { id: true, name: true } } },
  });

  return ok({ comment }, 201);
});

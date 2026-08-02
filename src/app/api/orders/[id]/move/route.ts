import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError, badRequest, forbidden, ok, requireUser, route } from '@/lib/api';
import { can, canSeeColumn } from '@/lib/permissions';
import { assertOrderReadyForProduction, findOrderOrThrow, logActivity, reposition } from '@/lib/orders';
import { ORDER_STAGE_LABELS, canTransition, getColumn, type OrderStage } from '@/lib/stages';
import { notifyOrderEnteredProduction, notifyOrderStageChanged } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const schema = z.object({
  toColumn: z.string().trim().min(1),
  position: z.coerce.number().int().min(0).optional(),
});

/**
 * ينقل كارت الأوردر إلى عمود آخر.
 *
 * إفلات الأوردر على أي عمود إنتاج (ديجيتال/أوفست/اندور) معناه "ابدأ الإنتاج"،
 * فينتقل الأوردر إلى مرحلة production وتظهر بنوده ككروت مستقلة كل واحد في
 * ممرّه. الانتقال إلى الاكتمال لا يتم يدويًا بل تلقائيًا بعد انتهاء كل البنود.
 */
export const POST = route(async (request: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  if (!can(user, 'orders.move')) throw forbidden('نقل الأوردرات');

  const { toColumn, position } = schema.parse(await request.json());
  const column = getColumn(toColumn);
  if (!column) throw badRequest('عمود غير معروف');
  if (!canSeeColumn(user, toColumn)) throw forbidden(`النقل إلى عمود ${column.label}`);

  const order = await findOrderOrThrow(params.id);
  const from = order.stage as OrderStage;

  // الإفلات على ممر إنتاج = إرسال الأوردر كله للإنتاج
  const to: OrderStage = column.kind === 'item' ? 'production' : (column.stage as OrderStage);

  if (from === to) {
    await reposition('order', order.id, position);
    return ok({ order: { id: order.id, stage: order.stage }, moved: false });
  }

  if (to === 'completed' && from === 'production') {
    throw new ApiError(
      400,
      'الأوردر ينتقل إلى الاكتمال تلقائيًا بعد انتهاء كل بنوده. أنهِ البنود المتبقية أولًا.',
    );
  }

  if (!canTransition(from, to)) {
    throw new ApiError(
      400,
      `لا يمكن نقل الأوردر من "${ORDER_STAGE_LABELS[from]}" إلى "${ORDER_STAGE_LABELS[to]}" مباشرة`,
    );
  }

  if (to === 'production') {
    await assertOrderReadyForProduction(order.id);
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      stage: to,
      ...(typeof position === 'number' ? { position: Math.max(0, position) } : {}),
      ...(to === 'delivered' ? { deliveredAt: new Date() } : {}),
    },
  });

  await logActivity({
    orderId: order.id,
    userId: user.id,
    action: 'moved',
    fromStage: from,
    toStage: to,
    details: `نقل الأوردر من "${ORDER_STAGE_LABELS[from]}" إلى "${ORDER_STAGE_LABELS[to]}"`,
  });

  // الدخول للإنتاج يُشعِر كل عامل ببنود ممرّه هو فقط، وبقية المراحل تُشعِر
  // من يتابع عمودها في اللوحة
  if (to === 'production') {
    await notifyOrderEnteredProduction({
      orderId: order.id,
      number: order.number,
      title: order.title,
      actorId: user.id,
    });
  } else {
    await notifyOrderStageChanged({
      orderId: order.id,
      number: order.number,
      title: order.title,
      toStage: to,
      actorId: user.id,
    });
  }

  return ok({ order: { id: updated.id, stage: updated.stage }, moved: true });
});

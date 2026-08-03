import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError, badRequest, forbidden, ok, requireUser, route } from '@/lib/api';
import { can, canSeeColumn, canSeeProductionType } from '@/lib/permissions';
import {
  assertCanTouchProductionType,
  findItemOrThrow,
  logActivity,
  syncOrderStageWithItems,
} from '@/lib/orders';
import {
  ITEMS_DONE_STAGE,
  ORDER_STAGE_LABELS,
  PRODUCTION_TYPE_LABELS,
  getColumn,
  type ProductionType,
} from '@/lib/stages';

export const dynamic = 'force-dynamic';

const schema = z.object({
  toColumn: z.string().trim().min(1),
  position: z.coerce.number().int().min(0).optional(),
});

/**
 * ينقل كارت بند الشغل.
 *
 * الحالات الممكنة:
 *  - إفلات على عمود ITEMS_DONE_STAGE → البند خلص (status = done)
 *  - إفلات على نفس عموده             → إعادة ترتيب، ولو كان منتهيًا يُعاد فتحه
 *  - إفلات على عمود إنتاج آخر        → تحويل نوع الشغل (يحتاج صلاحية تعديل البنود)
 *
 * عمود الإنهاء هو العمود التالي مباشرةً لممرات الإنتاج، وهو نفسه الذي ينتقل
 * إليه الأوردر تلقائيًا حين تنتهي كل بنوده.
 */
export const POST = route(async (request: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  if (!can(user, 'items.move')) throw forbidden('تحريك بنود الشغل');

  const { toColumn, position } = schema.parse(await request.json());
  const column = getColumn(toColumn);
  if (!column) throw badRequest('عمود غير معروف');
  if (!canSeeColumn(user, toColumn)) throw forbidden(`النقل إلى عمود ${column.label}`);

  const item = await findItemOrThrow(params.id);
  assertCanTouchProductionType(user, item.productionType);

  if (item.order.stage !== 'production') {
    throw new ApiError(400, 'لا يمكن تحريك البنود إلا بعد إرسال الأوردر للإنتاج');
  }

  // ── إنهاء البند ──
  if (column.kind === 'order' && column.stage === ITEMS_DONE_STAGE) {
    if (item.status === 'done') return ok({ item, moved: false });

    const updated = await prisma.orderItem.update({
      where: { id: item.id },
      data: { status: 'done', completedAt: new Date() },
    });
    await logActivity({
      orderId: item.orderId,
      orderItemId: item.id,
      userId: user.id,
      action: 'item_done',
      details: `أنهى بند "${item.title}"`,
    });
    const orderStage = await syncOrderStageWithItems(item.orderId, user.id);
    return ok({ item: updated, moved: true, orderStage });
  }

  if (column.kind !== 'item' || !column.productionType) {
    throw new ApiError(
      400,
      `بنود الشغل تتحرك بين أعمدة الإنتاج أو إلى عمود "${ORDER_STAGE_LABELS[ITEMS_DONE_STAGE]}" فقط`,
    );
  }

  const targetType = column.productionType as ProductionType;

  // ── نفس العمود: إعادة ترتيب أو إعادة فتح ──
  if (targetType === item.productionType) {
    const reopening = item.status === 'done';
    const updated = await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        ...(typeof position === 'number' ? { position: Math.max(0, position) } : {}),
        ...(reopening ? { status: 'in_progress', completedAt: null } : {}),
      },
    });

    if (reopening) {
      await logActivity({
        orderId: item.orderId,
        orderItemId: item.id,
        userId: user.id,
        action: 'item_reopened',
        details: `أعاد فتح بند "${item.title}"`,
      });
      await syncOrderStageWithItems(item.orderId, user.id);
    }

    return ok({ item: updated, moved: reopening });
  }

  // ── تحويل نوع الشغل ──
  if (!can(user, 'items.edit')) throw forbidden('تحويل البند لنوع شغل آخر');
  if (!canSeeProductionType(user, targetType)) {
    throw forbidden(`تحويل البند إلى ${PRODUCTION_TYPE_LABELS[targetType]}`);
  }

  const updated = await prisma.orderItem.update({
    where: { id: item.id },
    data: {
      productionType: targetType,
      ...(typeof position === 'number' ? { position: Math.max(0, position) } : {}),
    },
  });

  await logActivity({
    orderId: item.orderId,
    orderItemId: item.id,
    userId: user.id,
    action: 'item_type',
    details: `حوّل "${item.title}" من ${PRODUCTION_TYPE_LABELS[item.productionType as ProductionType]} إلى ${PRODUCTION_TYPE_LABELS[targetType]}`,
  });

  return ok({ item: updated, moved: true });
});

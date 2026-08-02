import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { forbidden, ok, requireUser, route } from '@/lib/api';
import { can, canSeeProductionType } from '@/lib/permissions';
import {
  assertCanTouchProductionType,
  findItemOrThrow,
  logActivity,
  syncOrderStageWithItems,
} from '@/lib/orders';
import {
  ITEM_STATUSES,
  ITEM_STATUS_LABELS,
  PRODUCTION_TYPES,
  PRODUCTION_TYPE_LABELS,
  sanitizeItemOptions,
} from '@/lib/stages';
import { parseList, serializeList } from '@/lib/serialize';
import { deleteStoredFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  specs: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  assigneeId: z.string().trim().nullable().optional(),
  productionType: z.enum(PRODUCTION_TYPES).optional(),
  options: z.array(z.string().trim()).max(50).optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const body = updateSchema.parse(await request.json());
  const item = await findItemOrThrow(params.id);

  // لا يلمس البند إلا من يرى نوع إنتاجه
  assertCanTouchProductionType(user, item.productionType);

  const changingStatus = body.status !== undefined && body.status !== item.status;
  const changingAssignee = body.assigneeId !== undefined && body.assigneeId !== item.assigneeId;
  const changingType =
    body.productionType !== undefined && body.productionType !== item.productionType;
  const changingFields = ['title', 'quantity', 'specs', 'notes', 'options'].some((k) => k in body);

  if (changingStatus && !can(user, 'items.move')) throw forbidden('تغيير حالة البند');
  if (changingAssignee && !can(user, 'items.assign')) throw forbidden('إسناد البند');
  if ((changingFields || changingType) && !can(user, 'items.edit')) {
    throw forbidden('تعديل بنود الشغل');
  }
  if (changingType && !canSeeProductionType(user, body.productionType!)) {
    throw forbidden(`تحويل البند إلى ${PRODUCTION_TYPE_LABELS[body.productionType!]}`);
  }

  // الخيارات مرتبطة بنوع الإنتاج، فنصفّيها دائمًا على النوع الجديد: تحويل بند
  // من ديجيتال إلى اندور يُسقط خيارات التشطيب التي لم تعد تنطبق عليه.
  const effectiveType = body.productionType ?? item.productionType;
  const nextOptions =
    body.options !== undefined
      ? sanitizeItemOptions(effectiveType, body.options)
      : changingType
        ? sanitizeItemOptions(effectiveType, parseList(item.options))
        : undefined;

  const updated = await prisma.orderItem.update({
    where: { id: item.id },
    data: {
      ...(nextOptions !== undefined ? { options: serializeList(nextOptions) } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
      ...(body.specs !== undefined ? { specs: body.specs } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.productionType !== undefined ? { productionType: body.productionType } : {}),
      ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId || null } : {}),
      ...(body.status !== undefined
        ? {
            status: body.status,
            startedAt:
              body.status === 'in_progress' && !item.startedAt ? new Date() : item.startedAt,
            completedAt: body.status === 'done' ? new Date() : null,
          }
        : {}),
    },
    include: { assignee: { select: { id: true, name: true } } },
  });

  if (changingStatus) {
    await logActivity({
      orderId: item.orderId,
      orderItemId: item.id,
      userId: user.id,
      action: 'item_status',
      details: `${item.title}: ${ITEM_STATUS_LABELS[item.status as never]} ← ${ITEM_STATUS_LABELS[body.status!]}`,
    });
  } else if (changingType) {
    await logActivity({
      orderId: item.orderId,
      orderItemId: item.id,
      userId: user.id,
      action: 'item_type',
      details: `حوّل "${item.title}" من ${PRODUCTION_TYPE_LABELS[item.productionType as never]} إلى ${PRODUCTION_TYPE_LABELS[body.productionType!]}`,
    });
  } else {
    await logActivity({
      orderId: item.orderId,
      orderItemId: item.id,
      userId: user.id,
      action: 'item_updated',
      details: `عدّل بند "${item.title}"`,
    });
  }

  const newStage = await syncOrderStageWithItems(item.orderId, user.id);

  return ok({ item: updated, orderStage: newStage });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  if (!can(user, 'items.delete')) throw forbidden('حذف بنود الشغل');

  const item = await findItemOrThrow(params.id);
  assertCanTouchProductionType(user, item.productionType);

  const attachments = await prisma.attachment.findMany({
    where: { orderItemId: item.id },
    select: { fileName: true },
  });
  await Promise.all(attachments.map((a) => deleteStoredFile(a.fileName)));

  await prisma.orderItem.delete({ where: { id: item.id } });

  await logActivity({
    orderId: item.orderId,
    userId: user.id,
    action: 'item_deleted',
    details: `حذف بند "${item.title}"`,
  });

  await syncOrderStageWithItems(item.orderId, user.id);

  return ok({ success: true });
});

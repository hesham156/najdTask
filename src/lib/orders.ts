import 'server-only';

import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from './prisma';
import { ApiError, badRequest, notFound } from './api';
import { allowedProductionTypes, type SessionUser } from './permissions';

type Tx = Prisma.TransactionClient | PrismaClient;

// ─────────────────────────── الترقيم التسلسلي للأوردرات ───────────────────────────

/**
 * يحجز رقم الأوردر التالي بشكل ذرّي.
 *
 * الزيادة تتم عبر عملية `increment` واحدة تترجم إلى `UPDATE ... SET n = n + 1`
 * في قاعدة البيانات، فلا يمكن لطلبين متزامنين أن يحصلا على نفس الرقم حتى لو
 * ضغط موظفان "حفظ" في نفس اللحظة.
 */
export async function allocateOrderNumber(tx: Tx): Promise<number> {
  const updated = await tx.settings.update({
    where: { id: 'settings' },
    data: { nextOrderNumber: { increment: 1 } },
  });
  return updated.nextOrderNumber - 1;
}

export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: 'settings' },
    update: {},
    create: { id: 'settings' },
  });
}

// ──────────────────────── تصفية البنود حسب صلاحية المستخدم ────────────────────────

/**
 * فلتر Prisma يقصر البنود على أنواع الإنتاج المسموح بها للمستخدم.
 * هذا هو جوهر المطلوب: عامل الأوفست لا يرى بند الديجيتال في نفس الأوردر.
 */
export function itemVisibilityFilter(user: SessionUser): Prisma.OrderItemWhereInput {
  if (user.role.isAdmin) return {};
  return { productionType: { in: allowedProductionTypes(user) } };
}

/** هل يُسمح لهذا المستخدم بالتعامل مع بند من هذا النوع؟ */
export function assertCanTouchProductionType(user: SessionUser, productionType: string) {
  if (user.role.isAdmin) return;
  if (!allowedProductionTypes(user).includes(productionType as never)) {
    throw new ApiError(403, 'هذا البند ليس ضمن نوع الشغل المسموح لك');
  }
}

// ─────────────────────── مزامنة مرحلة الأوردر مع حالة بنوده ───────────────────────

/**
 * ينقل الأوردر تلقائيًا إلى "الاكتمال" عندما تنتهي كل بنوده، ويعيده إلى
 * "تحت الإنتاج" لو أُعيد فتح أحد البنود. هذا هو ما يجعل كارت الأوردر يظهر في
 * عمود الاكتمال دون أن يسحبه أحد يدويًا.
 *
 * ملاحظة: الحساب يتم على كل البنود وليس فقط ما يراه المستخدم الحالي، وإلا
 * لاعتبر عامل الأوفست الأوردر مكتملًا بمجرد انتهاء بنده.
 */
export async function syncOrderStageWithItems(
  orderId: string,
  actorId: string,
): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { status: true } } },
  });

  if (!order || order.items.length === 0) return null;
  if (order.stage !== 'production' && order.stage !== 'completed') return null;

  const allDone = order.items.every((item) => item.status === 'done');

  if (allDone && order.stage === 'production') {
    await prisma.order.update({ where: { id: orderId }, data: { stage: 'completed' } });
    await logActivity({
      orderId,
      userId: actorId,
      action: 'auto_completed',
      fromStage: 'production',
      toStage: 'completed',
      details: 'اكتملت جميع بنود الأوردر فانتقل تلقائيًا إلى عمود الاكتمال',
    });
    return 'completed';
  }

  if (!allDone && order.stage === 'completed') {
    await prisma.order.update({ where: { id: orderId }, data: { stage: 'production' } });
    await logActivity({
      orderId,
      userId: actorId,
      action: 'auto_reopened',
      fromStage: 'completed',
      toStage: 'production',
      details: 'أُعيد فتح أحد البنود فرجع الأوردر إلى الإنتاج',
    });
    return 'production';
  }

  return null;
}

// ──────────────────────────────── سجل النشاط ────────────────────────────────

export async function logActivity(entry: {
  orderId: string;
  userId: string;
  action: string;
  orderItemId?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  details?: string | null;
}) {
  await prisma.activityLog.create({
    data: {
      orderId: entry.orderId,
      userId: entry.userId,
      action: entry.action,
      orderItemId: entry.orderItemId ?? null,
      fromStage: entry.fromStage ?? null,
      toStage: entry.toStage ?? null,
      details: entry.details ?? null,
    },
  });
}

// ───────────────────────────── جلب أوردر مع التحقق ─────────────────────────────

export async function findOrderOrThrow(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('الأوردر');
  return order;
}

export async function findItemOrThrow(itemId: string) {
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: { order: { select: { id: true, number: true, stage: true, title: true } } },
  });
  if (!item) throw notFound('بند الشغل');
  return item;
}

// ────────────────────────────── ترتيب الكروت ──────────────────────────────

/** يعيد ترتيب موضع الكارت داخل العمود بعد الإفلات. */
export async function reposition(
  model: 'order' | 'item',
  id: string,
  position: number | undefined,
) {
  if (typeof position !== 'number' || Number.isNaN(position)) return;
  const clamped = Math.max(0, Math.min(position, 100000));
  if (model === 'order') {
    await prisma.order.update({ where: { id }, data: { position: clamped } });
  } else {
    await prisma.orderItem.update({ where: { id }, data: { position: clamped } });
  }
}

// ───────────────────────── التحقق من إمكانية بدء الإنتاج ─────────────────────────

export async function assertOrderReadyForProduction(orderId: string) {
  const count = await prisma.orderItem.count({ where: { orderId } });
  if (count === 0) {
    throw badRequest('أضف بنود شغل للأوردر أولًا (أوفست / ديجيتال / اندور) قبل إرساله للإنتاج');
  }
}

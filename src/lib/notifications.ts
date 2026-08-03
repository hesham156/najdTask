import 'server-only';

import { prisma } from './prisma';
import { parseList } from './serialize';
import { sendPushToUsers, type PushPayload } from './push';
import {
  ORDER_STAGE_LABELS,
  PRODUCTION_TYPE_LABELS,
  getColumn,
  type OrderStage,
  type ProductionType,
} from './stages';

/**
 * من يستحق أي إشعار.
 *
 * الأدوار تخزّن قوائمها (الصلاحيات، الأعمدة المرئية، أنواع الإنتاج) كنص JSON
 * حتى يعمل نفس المخطط على SQLite و PostgreSQL، فلا يمكن ترشيحها داخل SQL.
 * نجلب المستخدمين النشطين مع أدوارهم ونرشّح في الذاكرة — العدد في مطبعة
 * بالعشرات لا بالآلاف، فالتكلفة لا تُذكر.
 *
 * كل دوال الإرسال هنا لا ترمي استثناءات: فشل الإشعار يجب ألا يُفشل حفظ أوردر.
 */

type Candidate = {
  id: string;
  isAdmin: boolean;
  permissions: string[];
  visibleStages: string[];
  productionTypes: string[];
};

async function activeUsers(): Promise<Candidate[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      role: {
        select: {
          isAdmin: true,
          permissions: true,
          visibleStages: true,
          productionTypes: true,
        },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    isAdmin: user.role.isAdmin,
    permissions: parseList(user.role.permissions),
    visibleStages: parseList(user.role.visibleStages),
    productionTypes: parseList(user.role.productionTypes),
  }));
}

const holds = (candidate: Candidate, permission: string) =>
  candidate.isAdmin || candidate.permissions.includes(permission);

const seesColumn = (candidate: Candidate, columnKey: string) =>
  candidate.isAdmin || candidate.visibleStages.includes(columnKey);

const seesType = (candidate: Candidate, type: string) =>
  candidate.isAdmin || candidate.productionTypes.includes(type);

/** إرسال آمن — يبتلع أي خطأ حتى لا يُفشل العملية التي استدعته. */
async function dispatch(userIds: string[], payload: PushPayload) {
  try {
    await sendPushToUsers(userIds, payload);
  } catch (error) {
    console.error('[notifications] تعذّر الإرسال:', (error as Error).message);
  }
}

const orderUrl = (orderId: string) => `/orders/${orderId}`;

// ───────────────────────────── 1) أوردر جديد اتسجّل ─────────────────────────────

export async function notifyOrderCreated(input: {
  orderId: string;
  number: number;
  customerName: string;
  actorId: string;
}) {
  try {
    const users = await activeUsers();
    const recipients = users
      .filter((u) => u.id !== input.actorId)
      .filter((u) => holds(u, 'orders.view') && seesColumn(u, 'orders'))
      .map((u) => u.id);

    await dispatch(recipients, {
      title: `أوردر جديد #${input.number}`,
      body: `العميل: ${input.customerName}`,
      url: orderUrl(input.orderId),
      tag: `order-created-${input.orderId}`,
    });
  } catch (error) {
    console.error('[notifications] notifyOrderCreated:', (error as Error).message);
  }
}

// ──────────────────── 2) الأوردر دخل الإنتاج: كل عامل وممرّه ────────────────────

export async function notifyOrderEnteredProduction(input: {
  orderId: string;
  number: number;
  customerName: string;
  actorId: string;
}) {
  try {
    const items = await prisma.orderItem.findMany({
      where: { orderId: input.orderId },
      select: { productionType: true },
    });
    if (items.length === 0) return;

    const users = await activeUsers();
    const types = [...new Set(items.map((i) => i.productionType))];

    // إشعار منفصل لكل نوع إنتاج، فلا يصل عامل الأوفست خبر بند الديجيتال
    for (const type of types) {
      const count = items.filter((i) => i.productionType === type).length;
      const label = PRODUCTION_TYPE_LABELS[type as ProductionType] ?? type;

      const recipients = users
        .filter((u) => u.id !== input.actorId)
        .filter((u) => seesType(u, type) && seesColumn(u, type))
        .map((u) => u.id);

      await dispatch(recipients, {
        title: `شغل ${label} جديد`,
        body: `أوردر #${input.number} — ${input.customerName} (${count} بند)`,
        url: orderUrl(input.orderId),
        tag: `production-${input.orderId}-${type}`,
      });
    }
  } catch (error) {
    console.error('[notifications] notifyOrderEnteredProduction:', (error as Error).message);
  }
}

// ─────────────────────── 3) الأوردر وصل عمودًا يتابعه ناس ───────────────────────

export async function notifyOrderStageChanged(input: {
  orderId: string;
  number: number;
  customerName: string;
  toStage: OrderStage;
  actorId: string;
}) {
  try {
    const column = getColumn(input.toStage);
    // مرحلة بلا عمود في اللوحة (مثل delivered) لا أحد يتابعها هناك
    if (!column) return;

    const users = await activeUsers();
    const recipients = users
      .filter((u) => u.id !== input.actorId)
      .filter((u) => holds(u, 'orders.view') && seesColumn(u, column.key))
      .map((u) => u.id);

    await dispatch(recipients, {
      title: `أوردر في ${ORDER_STAGE_LABELS[input.toStage]}`,
      body: `#${input.number} — ${input.customerName}`,
      url: orderUrl(input.orderId),
      tag: `stage-${input.orderId}`,
    });
  } catch (error) {
    console.error('[notifications] notifyOrderStageChanged:', (error as Error).message);
  }
}

// ───────────────────────────── 4) بند اتسند لموظف ─────────────────────────────

export async function notifyItemAssigned(input: {
  orderId: string;
  orderNumber: number;
  itemTitle: string;
  productionType: string;
  assigneeId: string;
  actorId: string;
}) {
  try {
    // إسناد البند لنفسك لا يستحق إشعارًا
    if (input.assigneeId === input.actorId) return;

    const label = PRODUCTION_TYPE_LABELS[input.productionType as ProductionType] ?? input.productionType;

    await dispatch([input.assigneeId], {
      title: 'اتسند لك بند شغل',
      body: `${input.itemTitle} (${label}) — أوردر #${input.orderNumber}`,
      url: orderUrl(input.orderId),
      tag: `assigned-${input.orderId}`,
    });
  } catch (error) {
    console.error('[notifications] notifyItemAssigned:', (error as Error).message);
  }
}

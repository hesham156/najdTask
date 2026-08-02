import { prisma } from '@/lib/prisma';
import { forbidden, ok, requireUser, route } from '@/lib/api';
import { allowedProductionTypes, can } from '@/lib/permissions';
import {
  ORDER_STAGE_LABELS,
  PRODUCTION_TYPE_LABELS,
  consumptionShortLabel,
  type OrderStage,
  type ProductionType,
} from '@/lib/stages';

export const dynamic = 'force-dynamic';

/** الفترات المتاحة — الاستهلاك بلا فترة رقم يكبر للأبد ولا يُقارَن به شيء. */
const PERIODS = [
  { days: 30, label: 'آخر ٣٠ يوم' },
  { days: 90, label: 'آخر ٣ شهور' },
  { days: 365, label: 'آخر سنة' },
  { days: 0, label: 'كل الوقت' },
] as const;

export const GET = route(async (request: Request) => {
  const user = await requireUser();
  if (!can(user, 'reports.view')) throw forbidden('عرض التقارير');

  const requested = Number(new URL(request.url).searchParams.get('days') ?? 30);
  const period = PERIODS.find((p) => p.days === requested) ?? PERIODS[0];
  const since = period.days > 0 ? new Date(Date.now() - period.days * 86_400_000) : null;

  // نفس مبدأ اللوحة: لا يستقبل المستخدم أرقام أنواع إنتاج لا يراها أصلًا
  const visibleTypes = allowedProductionTypes(user);

  const orderWhere = {
    isArchived: false,
    ...(since ? { createdAt: { gte: since } } : {}),
  };

  // بنود الفترة = بنود أوردرات الفترة، حتى تتسق كل الأرقام على مرجع واحد
  const itemWhere = {
    productionType: { in: visibleTypes },
    order: orderWhere,
  };

  const [byStage, byType, totals, lateOrders, topCustomers, byConsumption] = await Promise.all([
    prisma.order.groupBy({
      by: ['stage'],
      where: orderWhere,
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productionType', 'status'],
      where: itemWhere,
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: orderWhere,
      _count: { _all: true },
      _sum: { invoiceAmount: true },
    }),
    prisma.order.count({
      where: {
        ...orderWhere,
        dueDate: { lt: new Date() },
        stage: { notIn: ['delivered'] },
      },
    }),
    prisma.order.groupBy({
      by: ['customerName'],
      where: orderWhere,
      _count: { _all: true },
      orderBy: { _count: { customerName: 'desc' } },
      take: 8,
    }),
    // الوحدة مأخوذة من العمود المخزَّن لا من نوع البند الحالي: بند سُجِّل
    // بالأمتار ثم تحوّل لأوفست يجب أن يظل محسوبًا ضمن الأمتار
    prisma.orderItem.groupBy({
      by: ['productionType', 'consumedUnit'],
      where: { ...itemWhere, consumedQty: { not: null } },
      _sum: { consumedQty: true },
      _count: { _all: true },
    }),
  ]);

  const stageCounts = Object.keys(ORDER_STAGE_LABELS).map((stage) => ({
    stage,
    label: ORDER_STAGE_LABELS[stage as OrderStage],
    count: byStage.find((s) => s.stage === stage)?._count._all ?? 0,
  }));

  const typeCounts = visibleTypes.map((type) => {
    const rows = byType.filter((r) => r.productionType === type);
    const sum = (status: string) => rows.find((r) => r.status === status)?._count._all ?? 0;
    return {
      type,
      label: PRODUCTION_TYPE_LABELS[type],
      pending: sum('pending'),
      inProgress: sum('in_progress'),
      done: sum('done'),
      total: rows.reduce((acc, r) => acc + r._count._all, 0),
    };
  });

  // إجماليات الاستهلاك حسب الوحدة المخزَّنة
  const unitTotal = (unit: 'sheet' | 'meter') =>
    byConsumption
      .filter((r) => r.consumedUnit === unit)
      .reduce((acc, r) => acc + (r._sum.consumedQty ?? 0), 0);

  const consumptionByType = visibleTypes
    .map((type) => {
      const rows = byConsumption.filter((r) => r.productionType === type);
      const recordedItems = rows.reduce((acc, r) => acc + r._count._all, 0);
      // نوع واحد قد يحمل وحدتين لو حُوِّلت بنود بينه وبين نوع آخر
      const units = rows.map((r) => ({
        unit: consumptionShortLabel(type, r.consumedUnit),
        total: Math.round((r._sum.consumedQty ?? 0) * 100) / 100,
        count: r._count._all,
      }));
      return {
        type,
        label: PRODUCTION_TYPE_LABELS[type as ProductionType],
        recordedItems,
        units,
      };
    })
    .filter((row) => row.recordedItems > 0);

  const itemsWithConsumption = byConsumption.reduce((acc, r) => acc + r._count._all, 0);
  const totalItems = byType.reduce((acc, r) => acc + r._count._all, 0);

  return ok({
    period: { days: period.days, label: period.label },
    periods: PERIODS.map((p) => ({ days: p.days, label: p.label })),
    totalOrders: totals._count._all,
    totalInvoiced: totals._sum.invoiceAmount ?? 0,
    lateOrders,
    stageCounts,
    typeCounts,
    consumption: {
      totalSheets: Math.round(unitTotal('sheet') * 100) / 100,
      totalMeters: Math.round(unitTotal('meter') * 100) / 100,
      /** كم بندًا سُجِّل له استهلاك من إجمالي بنود الفترة — يكشف التقصير في التسجيل */
      recordedItems: itemsWithConsumption,
      totalItems,
      byType: consumptionByType,
    },
    topCustomers: topCustomers.map((c) => ({
      name: c.customerName,
      count: c._count._all,
    })),
  });
});

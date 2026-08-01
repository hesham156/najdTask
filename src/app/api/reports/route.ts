import { prisma } from '@/lib/prisma';
import { forbidden, ok, requireUser, route } from '@/lib/api';
import { can } from '@/lib/permissions';
import { ORDER_STAGE_LABELS, PRODUCTION_TYPES, PRODUCTION_TYPE_LABELS, type OrderStage } from '@/lib/stages';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  if (!can(user, 'reports.view')) throw forbidden('عرض التقارير');

  const [byStage, byType, totals, lateOrders, topCustomers] = await Promise.all([
    prisma.order.groupBy({
      by: ['stage'],
      where: { isArchived: false },
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productionType', 'status'],
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { isArchived: false },
      _count: { _all: true },
      _sum: { invoiceAmount: true },
    }),
    prisma.order.count({
      where: {
        isArchived: false,
        dueDate: { lt: new Date() },
        stage: { notIn: ['delivered'] },
      },
    }),
    prisma.order.groupBy({
      by: ['customerName'],
      where: { isArchived: false },
      _count: { _all: true },
      orderBy: { _count: { customerName: 'desc' } },
      take: 8,
    }),
  ]);

  const stageCounts = Object.keys(ORDER_STAGE_LABELS).map((stage) => ({
    stage,
    label: ORDER_STAGE_LABELS[stage as OrderStage],
    count: byStage.find((s) => s.stage === stage)?._count._all ?? 0,
  }));

  const typeCounts = PRODUCTION_TYPES.map((type) => {
    const rows = byType.filter((r) => r.productionType === type);
    const sum = (status: string) =>
      rows.find((r) => r.status === status)?._count._all ?? 0;
    return {
      type,
      label: PRODUCTION_TYPE_LABELS[type],
      pending: sum('pending'),
      inProgress: sum('in_progress'),
      done: sum('done'),
      total: rows.reduce((acc, r) => acc + r._count._all, 0),
    };
  });

  return ok({
    totalOrders: totals._count._all,
    totalInvoiced: totals._sum.invoiceAmount ?? 0,
    lateOrders,
    stageCounts,
    typeCounts,
    topCustomers: topCustomers.map((c) => ({
      name: c.customerName,
      count: c._count._all,
    })),
  });
});

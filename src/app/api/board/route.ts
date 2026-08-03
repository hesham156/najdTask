import { prisma } from '@/lib/prisma';
import { ok, requireUser, route, forbidden } from '@/lib/api';
import { allowedProductionTypes, can, visibleColumns } from '@/lib/permissions';
import { getSettings } from '@/lib/orders';
import { parseList } from '@/lib/serialize';
import type { ItemStatus, Priority, ProductionType } from '@/lib/stages';
import type { BoardColumnData, BoardData, ItemCard, OrderCard } from '@/types/board';

export const dynamic = 'force-dynamic';

/**
 * يبني لوحة الكانبان للمستخدم الحالي.
 *
 * كل التصفية تحدث هنا على السيرفر: المستخدم لا يستقبل أصلًا بيانات الأعمدة
 * أو أنواع الإنتاج التي لا يملك صلاحية رؤيتها، فإخفاء العناصر ليس مجرد
 * تجميل في الواجهة.
 */
export const GET = route(async () => {
  const user = await requireUser();
  if (!can(user, 'orders.view')) throw forbidden('عرض الأوردرات');

  const columns = visibleColumns(user);
  const settings = await getSettings();

  const orderStages = columns
    .filter((c) => c.kind === 'order' && c.stage)
    .map((c) => c.stage as string);

  const laneTypes = columns
    .filter((c) => c.kind === 'item' && c.productionType)
    .map((c) => c.productionType as ProductionType);

  const visibleTypes = allowedProductionTypes(user);

  // ── كروت الأوردرات ──
  const orders = orderStages.length
    ? await prisma.order.findMany({
        where: { isArchived: false, stage: { in: orderStages } },
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
        include: {
          createdBy: { select: { id: true, name: true } },
          items: { select: { id: true, productionType: true, title: true, status: true } },
          _count: { select: { attachments: true, comments: true } },
        },
      })
    : [];

  // ── كروت بنود الشغل داخل ممرات الإنتاج ──
  const items = laneTypes.length
    ? await prisma.orderItem.findMany({
        where: {
          productionType: { in: laneTypes },
          order: { stage: 'production', isArchived: false },
        },
        orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
        include: {
          assignee: { select: { id: true, name: true } },
          _count: { select: { attachments: true } },
          order: {
            select: {
              id: true,
              number: true,
              customerName: true,
              priority: true,
              dueDate: true,
            },
          },
        },
      })
    : [];

  const orderCards: OrderCard[] = orders.map((order) => {
    const visibleItems = order.items.filter(
      (item) => user.role.isAdmin || visibleTypes.includes(item.productionType as ProductionType),
    );
    return {
      type: 'order',
      id: order.id,
      number: order.number,
      customerName: order.customerName,
      priority: order.priority as Priority,
      stage: order.stage,
      position: order.position,
      dueDate: order.dueDate?.toISOString() ?? null,
      createdBy: order.createdBy,
      items: visibleItems.map((item) => ({
        id: item.id,
        productionType: item.productionType as ProductionType,
        title: item.title,
        status: item.status as ItemStatus,
      })),
      totalItems: order.items.length,
      doneItems: order.items.filter((i) => i.status === 'done').length,
      attachmentsCount: order._count.attachments,
      commentsCount: order._count.comments,
      invoiceNumber: order.invoiceNumber,
      deliveryNoteNumber: order.deliveryNoteNumber,
    };
  });

  const itemCards: ItemCard[] = items.map((item) => ({
    type: 'item',
    id: item.id,
    title: item.title,
    productionType: item.productionType as ProductionType,
    status: item.status as ItemStatus,
    quantity: item.quantity,
    specs: item.specs,
    options: parseList(item.options),
    consumedQty: item.consumedQty,
    consumedUnit: item.consumedUnit,
    position: item.position,
    assignee: item.assignee,
    attachmentsCount: item._count.attachments,
    order: {
      id: item.order.id,
      number: item.order.number,
      customerName: item.order.customerName,
      priority: item.order.priority as Priority,
      dueDate: item.order.dueDate?.toISOString() ?? null,
    },
  }));

  const data: BoardData = {
    orderNumberPrefix: settings.orderNumberPrefix,
    columns: columns.map<BoardColumnData>((column) => ({
      key: column.key,
      label: column.label,
      kind: column.kind,
      accent: column.accent,
      headerBg: column.headerBg,
      hint: column.hint,
      cards:
        column.kind === 'order'
          ? orderCards.filter((card) => card.stage === column.stage)
          : itemCards.filter((card) => card.productionType === column.productionType),
    })),
  };

  return ok(data);
});

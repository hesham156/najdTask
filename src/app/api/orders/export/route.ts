import { insensitive, prisma } from '@/lib/prisma';
import { badRequest, forbidden, ok, requireUser, route } from '@/lib/api';
import { allowedProductionTypes, can } from '@/lib/permissions';
import { getSettings } from '@/lib/orders';
import { parseList } from '@/lib/serialize';
import { isOrderStage } from '@/lib/stages';

export const dynamic = 'force-dynamic';

/**
 * بيانات كاملة للأوردرات المطابقة للفلاتر، بالشكل الذي يحتاجه مستند الطباعة.
 *
 * قائمة الأوردرات العادية تُرجع ملخّصًا لا يكفي للطباعة (بلا مواصفات البنود ولا
 * خياراتها ولا الفاتورة)، وجلب كل أوردر على حدة يعني طلبًا لكل صف. فهذا المسار
 * يجلبها دفعة واحدة بنفس فلاتر القائمة وبنفس قواعد إخفاء أنواع الإنتاج.
 */

const MAX_ORDERS = 200;

function parseDay(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export const GET = route(async (request: Request) => {
  const user = await requireUser();
  if (!can(user, 'orders.view')) throw forbidden('عرض الأوردرات');

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const stage = url.searchParams.get('stage')?.trim();
  const customerId = url.searchParams.get('customerId')?.trim();
  const from = parseDay(url.searchParams.get('from'));
  const to = parseDay(url.searchParams.get('to'), true);

  const numeric = q && /^\d+$/.test(q) ? Number(q) : undefined;

  const where = {
    isArchived: false,
    ...(stage && isOrderStage(stage) ? { stage } : {}),
    ...(customerId ? { customerId } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { customerName: { contains: q, ...insensitive } },
            { description: { contains: q, ...insensitive } },
            ...(numeric !== undefined ? [{ number: numeric }] : []),
          ],
        }
      : {}),
  };

  const total = await prisma.order.count({ where });
  if (total > MAX_ORDERS) {
    throw badRequest(
      `الفترة المحددة فيها ${total} أوردر، والحد الأقصى للتصدير ${MAX_ORDERS}. ضيّق الفترة أو أضف فلترًا.`,
    );
  }

  const visibleTypes = allowedProductionTypes(user);
  const itemFilter = user.role.isAdmin ? {} : { productionType: { in: visibleTypes } };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { number: 'asc' },
    take: MAX_ORDERS,
    include: {
      createdBy: { select: { id: true, name: true } },
      items: {
        where: itemFilter,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { assignee: { select: { id: true, name: true } } },
      },
      attachments: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, originalName: true, orderItemId: true },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          createdAt: true,
          orderItemId: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  const settings = await getSettings();

  return ok({
    orders: orders.map((order) => {
      // مرفقات وملاحظات البنود المخفية عن هذا المستخدم يجب ألا تتسرب في التصدير
      const visibleItemIds = new Set(order.items.map((item) => item.id));
      return {
        id: order.id,
        number: order.number,
        description: order.description,
        customerName: order.customerName,
        stage: order.stage,
        priority: order.priority,
        dueDate: order.dueDate?.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
        createdBy: order.createdBy,
        items: order.items.map((item) => ({
          id: item.id,
          productionType: item.productionType,
          title: item.title,
          quantity: item.quantity,
          specs: item.specs,
          options: parseList(item.options),
          consumedQty: item.consumedQty,
          consumedUnit: item.consumedUnit,
          status: item.status,
          assignee: item.assignee,
        })),
        attachments: order.attachments.filter(
          (a) => !a.orderItemId || visibleItemIds.has(a.orderItemId),
        ),
        comments: order.comments
          .filter((c) => !c.orderItemId || visibleItemIds.has(c.orderItemId))
          .map((c) => ({
            id: c.id,
            body: c.body,
            createdAt: c.createdAt.toISOString(),
            user: c.user,
          })),
        invoiceNumber: order.invoiceNumber,
        invoiceAmount: order.invoiceAmount,
        invoicePaid: order.invoicePaid,
        deliveryNoteNumber: order.deliveryNoteNumber,
        receiverName: order.receiverName,
      };
    }),
    total,
    orderNumberPrefix: settings.orderNumberPrefix,
  });
});

import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { forbidden, ok, requireUser, route, notFound } from '@/lib/api';
import { allowedProductionTypes, can } from '@/lib/permissions';
import { findOrderOrThrow, getSettings, logActivity } from '@/lib/orders';
import { deleteStoredFile } from '@/lib/storage';
import { parseList } from '@/lib/serialize';
import { PRIORITIES } from '@/lib/stages';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

// ─────────────────────────────── تفاصيل الأوردر ───────────────────────────────

export const GET = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  if (!can(user, 'orders.view')) throw forbidden('عرض الأوردرات');

  const visibleTypes = allowedProductionTypes(user);
  const itemFilter = user.role.isAdmin ? {} : { productionType: { in: visibleTypes } };

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      createdBy: { select: { id: true, name: true } },
      customer: true,
      items: {
        where: itemFilter,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          assignee: { select: { id: true, name: true } },
          _count: { select: { attachments: true } },
        },
      },
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { items: true } },
    },
  });

  if (!order) throw notFound('الأوردر');

  // مرفقات البنود المخفية عن هذا المستخدم يجب ألا تظهر له
  const visibleItemIds = new Set(order.items.map((i) => i.id));
  const attachments = order.attachments.filter(
    (a) => !a.orderItemId || visibleItemIds.has(a.orderItemId),
  );
  const comments = order.comments.filter(
    (c) => !c.orderItemId || visibleItemIds.has(c.orderItemId),
  );

  const settings = await getSettings();

  return ok({
    order: {
      ...order,
      // الخيارات مخزَّنة كنص JSON، والواجهة تتوقع مصفوفة
      items: order.items.map((item) => ({ ...item, options: parseList(item.options) })),
      attachments,
      comments,
      totalItems: order._count.items,
      hiddenItems: order._count.items - order.items.length,
    },
    orderNumberPrefix: settings.orderNumberPrefix,
  });
});

// ─────────────────────────────── تعديل الأوردر ───────────────────────────────

const updateSchema = z.object({
  description: z.string().trim().max(4000).nullable().optional(),
  customerName: z.string().trim().min(1).max(160).optional(),
  // اختيار عميل موجود لنقل الأوردر إليه — عند إرساله نأخذ اسمه الرسمي أيضًا
  customerId: z.string().trim().min(1).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // حقول الفاتورة وسند التسليم — تحتاج صلاحية invoice.manage
  invoiceNumber: z.string().trim().max(60).nullable().optional(),
  invoiceAmount: z.coerce.number().min(0).nullable().optional(),
  invoicePaid: z.boolean().optional(),
  deliveryNoteNumber: z.string().trim().max(60).nullable().optional(),
  receiverName: z.string().trim().max(160).nullable().optional(),
});

const INVOICE_FIELDS = [
  'invoiceNumber',
  'invoiceAmount',
  'invoicePaid',
  'deliveryNoteNumber',
  'receiverName',
] as const;

export const PATCH = route(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const body = updateSchema.parse(await request.json());
  const order = await findOrderOrThrow(params.id);

  const touchesInvoice = INVOICE_FIELDS.some((field) => field in body);
  const touchesOrder = Object.keys(body).some(
    (key) => !(INVOICE_FIELDS as readonly string[]).includes(key),
  );

  if (touchesInvoice && !can(user, 'invoice.manage')) {
    throw forbidden('إصدار الفاتورة وسند التسليم');
  }
  if (touchesOrder && !can(user, 'orders.edit')) {
    throw forbidden('تعديل الأوردر');
  }

  // نقل الأوردر إلى عميل موجود: نتحقق أنه موجود ونأخذ اسمه الرسمي معه
  let customerLink: { customerId: string; customerName: string } | undefined;
  if (body.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: body.customerId },
      select: { id: true, name: true },
    });
    if (!customer) throw notFound('العميل');
    customerLink = { customerId: customer.id, customerName: customer.name };
  }
  const movedCustomer = !!customerLink && customerLink.customerId !== order.customerId;

  const updated = await prisma.order.update({
    where: { id: params.id },
    data: {
      ...(body.description !== undefined ? { description: body.description } : {}),
      // العميل المختار من القائمة يغلب على الاسم المكتوب يدويًا
      ...(customerLink
        ? { customerId: customerLink.customerId, customerName: customerLink.customerName }
        : body.customerId === null
          ? { customerId: null }
          : {}),
      ...(body.customerName !== undefined && !customerLink
        ? { customerName: body.customerName }
        : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.dueDate !== undefined
        ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
        : {}),
      ...(body.invoiceNumber !== undefined ? { invoiceNumber: body.invoiceNumber } : {}),
      ...(body.invoiceAmount !== undefined ? { invoiceAmount: body.invoiceAmount } : {}),
      ...(body.invoicePaid !== undefined ? { invoicePaid: body.invoicePaid } : {}),
      ...(body.deliveryNoteNumber !== undefined
        ? { deliveryNoteNumber: body.deliveryNoteNumber }
        : {}),
      ...(body.receiverName !== undefined ? { receiverName: body.receiverName } : {}),
    },
  });

  await logActivity({
    orderId: order.id,
    userId: user.id,
    action: touchesInvoice && !touchesOrder ? 'invoice_updated' : 'updated',
    details:
      touchesInvoice && !touchesOrder
        ? 'حدّث بيانات الفاتورة/التسليم'
        : movedCustomer
          ? `عدّل الأوردر ونقله إلى العميل ${customerLink!.customerName}`
          : 'عدّل بيانات الأوردر',
  });

  return ok({ order: updated });
});

// ─────────────────────────────── حذف الأوردر ───────────────────────────────

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  if (!can(user, 'orders.delete')) throw forbidden('حذف الأوردر');

  const order = await findOrderOrThrow(params.id);

  // نحذف الملفات من القرص قبل حذف السجلات، وإلا بقيت يتيمة تستهلك مساحة
  const attachments = await prisma.attachment.findMany({
    where: { orderId: order.id },
    select: { fileName: true },
  });
  await Promise.all(attachments.map((a) => deleteStoredFile(a.fileName)));

  await prisma.order.delete({ where: { id: order.id } });

  return ok({ success: true });
});

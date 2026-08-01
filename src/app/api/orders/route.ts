import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { forbidden, ok, requireUser, route } from '@/lib/api';
import { allowedProductionTypes, can } from '@/lib/permissions';
import { allocateOrderNumber, getSettings, logActivity } from '@/lib/orders';
import { PRIORITIES, PRODUCTION_TYPES, isOrderStage } from '@/lib/stages';

export const dynamic = 'force-dynamic';

// ─────────────────────────────── قائمة الأوردرات ───────────────────────────────

export const GET = route(async (request: Request) => {
  const user = await requireUser();
  if (!can(user, 'orders.view')) throw forbidden('عرض الأوردرات');

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const stage = url.searchParams.get('stage')?.trim();
  const take = Math.min(Number(url.searchParams.get('take') ?? 50), 200);
  const skip = Math.max(Number(url.searchParams.get('skip') ?? 0), 0);

  const numeric = q && /^\d+$/.test(q) ? Number(q) : undefined;

  const where = {
    isArchived: false,
    ...(stage && isOrderStage(stage) ? { stage } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { customerName: { contains: q } },
            { description: { contains: q } },
            ...(numeric !== undefined ? [{ number: numeric }] : []),
          ],
        }
      : {}),
  };

  const visibleTypes = allowedProductionTypes(user);

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { number: 'desc' },
      take,
      skip,
      include: {
        createdBy: { select: { id: true, name: true } },
        items: {
          where: user.role.isAdmin ? {} : { productionType: { in: visibleTypes } },
          select: { id: true, productionType: true, title: true, status: true, quantity: true },
        },
        _count: { select: { attachments: true, comments: true, items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const settings = await getSettings();

  return ok({
    orders: orders.map((o) => ({
      ...o,
      dueDate: o.dueDate?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      totalItems: o._count.items,
    })),
    total,
    orderNumberPrefix: settings.orderNumberPrefix,
  });
});

// ─────────────────────────────── إنشاء أوردر ───────────────────────────────

const itemSchema = z.object({
  productionType: z.enum(PRODUCTION_TYPES),
  title: z.string().trim().min(1, 'اكتب اسم بند الشغل'),
  quantity: z.coerce.number().int().min(1, 'الكمية لا تقل عن 1').default(1),
  specs: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const createSchema = z.object({
  title: z.string().trim().min(1, 'اكتب عنوان الأوردر').max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  customerName: z.string().trim().min(1, 'اكتب اسم العميل').max(160),
  customerPhone: z.string().trim().max(40).optional().nullable(),
  customerId: z.string().trim().optional().nullable(),
  priority: z.enum(PRIORITIES).default('normal'),
  dueDate: z.string().datetime().optional().nullable(),
  items: z.array(itemSchema).default([]),
});

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  if (!can(user, 'orders.create')) throw forbidden('إضافة أوردر');

  const body = createSchema.parse(await request.json());

  // لو لم يُختر عميل موجود، نسجّل عميلًا جديدًا بنفس الاسم لتتراكم قائمة العملاء
  let customerId = body.customerId || null;
  if (!customerId) {
    const existing = await prisma.customer.findFirst({ where: { name: body.customerName } });
    if (existing) {
      customerId = existing.id;
      if (body.customerPhone && !existing.phone) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { phone: body.customerPhone },
        });
      }
    } else if (can(user, 'customers.manage')) {
      const created = await prisma.customer.create({
        data: { name: body.customerName, phone: body.customerPhone || null },
      });
      customerId = created.id;
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    const number = await allocateOrderNumber(tx);

    return tx.order.create({
      data: {
        number,
        title: body.title,
        description: body.description || null,
        customerName: body.customerName,
        customerId,
        priority: body.priority,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        createdById: user.id,
        stage: 'orders',
        items: {
          create: body.items.map((item, index) => ({
            productionType: item.productionType,
            title: item.title,
            quantity: item.quantity,
            specs: item.specs || null,
            notes: item.notes || null,
            position: index,
          })),
        },
      },
      include: { items: true },
    });
  });

  await logActivity({
    orderId: order.id,
    userId: user.id,
    action: 'created',
    toStage: 'orders',
    details: `أنشأ الأوردر رقم ${order.number} للعميل ${order.customerName}`,
  });

  return ok({ order }, 201);
});

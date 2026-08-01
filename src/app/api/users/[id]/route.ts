import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, notFound, ok, requireUser, route } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  roleId: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6, 'كلمة المرور 6 أحرف على الأقل').max(100).optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!can(actor, 'users.manage')) throw forbidden('تعديل المستخدمين');

  const body = updateSchema.parse(await request.json());
  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: { role: true },
  });
  if (!target) throw notFound('المستخدم');

  if (body.roleId && body.roleId !== target.roleId) {
    const role = await prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw badRequest('الدور المحدد غير موجود');
    if (role.isAdmin && !actor.role.isAdmin) {
      throw forbidden('ترقية مستخدم إلى مدير النظام');
    }
  }

  // لا نسمح بإيقاف آخر أدمن نشط وإلا أُغلق النظام على الجميع
  const deactivating = body.isActive === false && target.isActive;
  const demoting = body.roleId && body.roleId !== target.roleId && target.role.isAdmin;
  if ((deactivating || demoting) && target.role.isAdmin) {
    const activeAdmins = await prisma.user.count({
      where: { isActive: true, role: { isAdmin: true } },
    });
    if (activeAdmins <= 1) {
      throw badRequest('لا يمكن إيقاف أو تنزيل آخر مدير نظام نشط');
    }
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.roleId !== undefined ? { roleId: body.roleId } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
    },
    include: { role: { select: { id: true, key: true, name: true, isAdmin: true } } },
  });

  return ok({
    user: {
      id: updated.id,
      name: updated.name,
      username: updated.username,
      phone: updated.phone,
      isActive: updated.isActive,
      role: updated.role,
    },
  });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!can(actor, 'users.manage')) throw forbidden('حذف المستخدمين');

  if (actor.id === params.id) throw badRequest('لا يمكنك حذف حسابك أنت');

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      role: true,
      _count: { select: { createdOrders: true, uploads: true, comments: true, activities: true } },
    },
  });
  if (!target) throw notFound('المستخدم');

  if (target.role.isAdmin) {
    const activeAdmins = await prisma.user.count({
      where: { isActive: true, role: { isAdmin: true } },
    });
    if (activeAdmins <= 1) throw badRequest('لا يمكن حذف آخر مدير نظام');
  }

  // للمستخدم سجل مرتبط بأوردرات، فالحذف الكامل يفقدنا تاريخ العمل.
  // نوقفه بدل حذفه ونوضّح ذلك للأدمن.
  const hasHistory =
    target._count.createdOrders + target._count.uploads + target._count.comments + target._count.activities > 0;

  if (hasHistory) {
    await prisma.user.update({ where: { id: params.id }, data: { isActive: false } });
    return ok({
      success: true,
      deactivated: true,
      message: 'للمستخدم سجل عمل مرتبط بأوردرات، فتم إيقاف حسابه بدل حذفه للحفاظ على السجل',
    });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return ok({ success: true, deactivated: false });
});

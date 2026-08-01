import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, ok, requireUser, route } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { parseList } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  // من يستطيع إسناد البنود يحتاج قائمة الموظفين أيضًا
  if (!can(user, 'users.manage') && !can(user, 'items.assign')) {
    throw forbidden('عرض المستخدمين');
  }

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { role: { select: { id: true, key: true, name: true, isAdmin: true } } },
  });

  const full = can(user, 'users.manage');

  return ok({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      ...(full
        ? {
            phone: u.phone,
            isActive: u.isActive,
            lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
          }
        : {}),
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'اكتب اسم الموظف').max(120),
  username: z
    .string()
    .trim()
    .min(3, 'اسم المستخدم 3 أحرف على الأقل')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'اسم المستخدم بحروف إنجليزية وأرقام فقط'),
  password: z.string().min(6, 'كلمة المرور 6 أحرف على الأقل').max(100),
  phone: z.string().trim().max(40).optional().nullable(),
  roleId: z.string().trim().min(1, 'اختر الدور'),
  isActive: z.boolean().default(true),
});

export const POST = route(async (request: Request) => {
  const actor = await requireUser();
  if (!can(actor, 'users.manage')) throw forbidden('إضافة المستخدمين');

  const body = createSchema.parse(await request.json());
  const username = body.username.toLowerCase();

  if (await prisma.user.findUnique({ where: { username } })) {
    throw badRequest('اسم المستخدم مستخدم بالفعل، اختر غيره');
  }

  const role = await prisma.role.findUnique({ where: { id: body.roleId } });
  if (!role) throw badRequest('الدور المحدد غير موجود');

  // منع تصعيد الصلاحيات: من ليس أدمن لا يصنع أدمن
  if (role.isAdmin && !actor.role.isAdmin) {
    throw forbidden('إنشاء مستخدم بصلاحيات مدير النظام');
  }

  const created = await prisma.user.create({
    data: {
      name: body.name,
      username,
      phone: body.phone || null,
      passwordHash: await hashPassword(body.password),
      roleId: body.roleId,
      isActive: body.isActive,
    },
    include: { role: true },
  });

  return ok(
    {
      user: {
        id: created.id,
        name: created.name,
        username: created.username,
        isActive: created.isActive,
        role: {
          id: created.role.id,
          key: created.role.key,
          name: created.role.name,
          isAdmin: created.role.isAdmin,
          permissions: parseList(created.role.permissions),
        },
      },
    },
    201,
  );
});

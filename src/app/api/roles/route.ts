import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, ok, requireUser, route } from '@/lib/api';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, can } from '@/lib/permissions';
import { parseList, serializeList } from '@/lib/serialize';
import { BOARD_COLUMNS, PRODUCTION_TYPES } from '@/lib/stages';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  // إدارة المستخدمين تحتاج قائمة الأدوار للاختيار منها
  if (!can(user, 'roles.manage') && !can(user, 'users.manage')) {
    throw forbidden('عرض الأدوار');
  }

  const roles = await prisma.role.findMany({
    orderBy: [{ isAdmin: 'desc' }, { createdAt: 'asc' }],
    include: { _count: { select: { users: true } } },
  });

  return ok({
    roles: roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isAdmin: r.isAdmin,
      isSystem: r.isSystem,
      permissions: parseList(r.permissions),
      visibleStages: parseList(r.visibleStages),
      productionTypes: parseList(r.productionTypes),
      usersCount: r._count.users,
    })),
    // الكتالوج الذي تبني منه الواجهة مصفوفة الصلاحيات
    catalog: {
      groups: PERMISSION_GROUPS,
      columns: BOARD_COLUMNS.map((c) => ({
        key: c.key,
        label: c.label,
        kind: c.kind,
        productionType: c.productionType ?? null,
      })),
      productionTypes: PRODUCTION_TYPES,
    },
  });
});

const bodySchema = z.object({
  name: z.string().trim().min(2, 'اكتب اسم الدور').max(80),
  description: z.string().trim().max(300).optional().nullable(),
  permissions: z.array(z.string()).default([]),
  visibleStages: z.array(z.string()).default([]),
  productionTypes: z.array(z.string()).default([]),
});

/**
 * يقصّ القوائم على القيم المعروفة فقط حتى لا تتسرب مفاتيح ملفّقة.
 * ملاحظة: ملفات route.ts لا يُسمح لها بتصدير أي شيء غير معالِجات HTTP.
 */
function sanitize(body: z.infer<typeof bodySchema>) {
  const columnKeys = BOARD_COLUMNS.map((c) => c.key);
  return {
    permissions: body.permissions.filter((p) => ALL_PERMISSIONS.includes(p)),
    visibleStages: body.visibleStages.filter((s) => columnKeys.includes(s)),
    productionTypes: body.productionTypes.filter((t) =>
      (PRODUCTION_TYPES as readonly string[]).includes(t),
    ),
  };
}

export const POST = route(async (request: Request) => {
  const actor = await requireUser();
  if (!can(actor, 'roles.manage')) throw forbidden('إضافة الأدوار');

  const body = bodySchema.parse(await request.json());
  const clean = sanitize(body);

  // لا يمنح أحد صلاحية لا يملكها هو
  if (!actor.role.isAdmin) {
    const excess = clean.permissions.filter((p) => !actor.role.permissions.includes(p));
    if (excess.length) throw forbidden('منح صلاحيات لا تملكها أنت');
  }

  const key = `role_${Date.now().toString(36)}`;
  if (await prisma.role.findFirst({ where: { name: body.name } })) {
    throw badRequest('يوجد دور بنفس الاسم');
  }

  const role = await prisma.role.create({
    data: {
      key,
      name: body.name,
      description: body.description || null,
      permissions: serializeList(clean.permissions),
      visibleStages: serializeList(clean.visibleStages),
      productionTypes: serializeList(clean.productionTypes),
    },
  });

  return ok({ role: { ...role, ...clean, usersCount: 0 } }, 201);
});

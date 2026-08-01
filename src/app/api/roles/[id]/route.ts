import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, notFound, ok, requireUser, route } from '@/lib/api';
import { ALL_PERMISSIONS, can } from '@/lib/permissions';
import { serializeList } from '@/lib/serialize';
import { BOARD_COLUMNS, PRODUCTION_TYPES } from '@/lib/stages';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string()).optional(),
  visibleStages: z.array(z.string()).optional(),
  productionTypes: z.array(z.string()).optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!can(actor, 'roles.manage')) throw forbidden('تعديل الأدوار');

  const body = updateSchema.parse(await request.json());
  const role = await prisma.role.findUnique({ where: { id: params.id } });
  if (!role) throw notFound('الدور');

  // دور مدير النظام يملك كل شيء بحكم التعريف، وتعديل صلاحياته قد يقفل النظام
  if (role.isAdmin && (body.permissions || body.visibleStages || body.productionTypes)) {
    throw badRequest('دور مدير النظام يملك كل الصلاحيات دائمًا ولا يمكن تقييده');
  }

  const columnKeys = BOARD_COLUMNS.map((c) => c.key);
  const permissions = body.permissions?.filter((p) => ALL_PERMISSIONS.includes(p));
  const visibleStages = body.visibleStages?.filter((s) => columnKeys.includes(s));
  const productionTypes = body.productionTypes?.filter((t) =>
    (PRODUCTION_TYPES as readonly string[]).includes(t),
  );

  if (permissions && !actor.role.isAdmin) {
    const excess = permissions.filter((p) => !actor.role.permissions.includes(p));
    if (excess.length) throw forbidden('منح صلاحيات لا تملكها أنت');
  }

  const updated = await prisma.role.update({
    where: { id: role.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(permissions ? { permissions: serializeList(permissions) } : {}),
      ...(visibleStages ? { visibleStages: serializeList(visibleStages) } : {}),
      ...(productionTypes ? { productionTypes: serializeList(productionTypes) } : {}),
    },
    include: { _count: { select: { users: true } } },
  });

  return ok({
    role: {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      isAdmin: updated.isAdmin,
      isSystem: updated.isSystem,
      permissions: permissions ?? undefined,
      visibleStages: visibleStages ?? undefined,
      productionTypes: productionTypes ?? undefined,
      usersCount: updated._count.users,
    },
  });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!can(actor, 'roles.manage')) throw forbidden('حذف الأدوار');

  const role = await prisma.role.findUnique({
    where: { id: params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw notFound('الدور');

  if (role.isSystem) throw badRequest('لا يمكن حذف الأدوار الأساسية في النظام');
  if (role._count.users > 0) {
    throw badRequest(
      `هذا الدور مسنَد إلى ${role._count.users} مستخدم. انقلهم إلى دور آخر أولًا.`,
    );
  }

  await prisma.role.delete({ where: { id: role.id } });
  return ok({ success: true });
});

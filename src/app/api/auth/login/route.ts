import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { createSessionToken, setSessionCookie, verifyPassword } from '@/lib/auth';
import { ApiError, ok, route } from '@/lib/api';
import { parseList } from '@/lib/serialize';

const schema = z.object({
  username: z.string().trim().min(1, 'اكتب اسم المستخدم'),
  password: z.string().min(1, 'اكتب كلمة المرور'),
});

export const POST = route(async (request: Request) => {
  const { username, password } = schema.parse(await request.json());

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: { role: true },
  });

  // نفس الرسالة في الحالتين حتى لا نكشف أسماء المستخدمين الموجودة
  const invalid = new ApiError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  if (!user) throw invalid;
  if (!(await verifyPassword(password, user.passwordHash))) throw invalid;
  if (!user.isActive) throw new ApiError(403, 'هذا الحساب موقوف، راجع مدير النظام');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await setSessionCookie(await createSessionToken(user.id));

  return ok({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: {
        id: user.role.id,
        key: user.role.key,
        name: user.role.name,
        isAdmin: user.role.isAdmin,
        permissions: parseList(user.role.permissions),
        visibleStages: parseList(user.role.visibleStages),
        productionTypes: parseList(user.role.productionTypes),
      },
    },
  });
});

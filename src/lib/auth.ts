import 'server-only';

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

import { prisma } from './prisma';
import { parseList } from './serialize';
import type { SessionUser } from './permissions';

export { parseList, serializeList } from './serialize';

export const SESSION_COOKIE = 'najd_session';
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error(
      'AUTH_SECRET غير مضبوط أو قصير جدًا. ضع مفتاحًا عشوائيًا طويلًا في ملف .env',
    );
  }
  return new TextEncoder().encode(secret);
}

// ────────────────────────────── كلمات المرور ──────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ──────────────────────────────── الجلسة ────────────────────────────────

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}

/**
 * يقرأ المستخدم الحالي من الكوكي.
 *
 * نجلب الدور من قاعدة البيانات في كل طلب (لا نخزّنه داخل التوكن) حتى يسري
 * أي تعديل يجريه الأدمن على الصلاحيات فورًا دون انتظار تسجيل خروج ودخول.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await readSessionToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  if (!user || !user.isActive) return null;

  return {
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
  };
}

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { getCurrentUser } from './auth';
import { can, type SessionUser } from './permissions';

/** خطأ يحمل كود HTTP ورسالة عربية تُعرض للمستخدم مباشرة. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const unauthorized = () => new ApiError(401, 'من فضلك سجّل الدخول أولًا');
export const forbidden = (what = 'هذا الإجراء') =>
  new ApiError(403, `ليس لديك صلاحية ${what}`);
export const notFound = (what = 'العنصر') => new ApiError(404, `${what} غير موجود`);
export const badRequest = (message: string) => new ApiError(400, message);

/** يجلب المستخدم الحالي أو يرمي 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/** يجلب المستخدم ويتأكد من امتلاكه الصلاحية، وإلا يرمي 403. */
export async function requirePermission(
  permission: string,
  label?: string,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) throw forbidden(label);
  return user;
}

export function assertPermission(user: SessionUser, permission: string, label?: string) {
  if (!can(user, permission)) throw forbidden(label);
}

/**
 * يغلّف معالج المسار ليحوّل الأخطاء إلى استجابات JSON مرتّبة بدل انهيار الطلب.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse | Response>,
) {
  return async (...args: Args): Promise<NextResponse | Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof ZodError) {
        const first = error.errors[0];
        return NextResponse.json(
          { error: first?.message ?? 'بيانات غير صحيحة', issues: error.errors },
          { status: 422 },
        );
      }
      console.error('[api]', error);
      return NextResponse.json(
        { error: 'حدث خطأ غير متوقع في الخادم' },
        { status: 500 },
      );
    }
  };
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

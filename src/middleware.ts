import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'najd_session';

/**
 * حاجز أولي سريع: لو مفيش كوكي جلسة أصلًا، نحوّل لصفحة الدخول قبل تحميل
 * الصفحة. التحقق الحقيقي من صحة التوكن والصلاحيات يتم في السيرفر داخل
 * layout الخاص بالتطبيق وفي كل مسار API.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname, search } = request.nextUrl;

  if (!hasSession && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * كل المسارات ما عدا:
     * - مسارات الـ API (تتحقق بنفسها وترجع 401 بدل التحويل)
     * - ملفات Next الداخلية والأصول الساكنة
     */
    '/((?!api|_next/static|_next/image|icons|manifest.webmanifest|sw.js|offline.html|favicon.ico).*)',
  ],
};

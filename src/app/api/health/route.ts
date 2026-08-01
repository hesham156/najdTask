import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * فحص الصحة الذي تستخدمه Railway قبل توجيه الترافيك للنسخة الجديدة.
 *
 * نتحقق من الاتصال بقاعدة البيانات فعليًا، لأن أشيع سبب لفشل النشر هو
 * DATABASE_URL غير مضبوط — ومن الأفضل أن يفشل الفحص بوضوح بدل أن يعمل
 * التطبيق ويظهر للمستخدمين خطأ عند أول صفحة.
 *
 * هذا المسار عام بلا مصادقة، ولا يكشف أي بيانات.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'connected' });
  } catch {
    return NextResponse.json(
      { status: 'error', database: 'unreachable' },
      { status: 503 },
    );
  }
}

import { PrismaClient } from '@prisma/client';

// في وضع التطوير يعيد Next تحميل الوحدات كثيرًا، فنحتفظ بنسخة واحدة على
// الكائن العام حتى لا تُفتح عشرات الاتصالات بقاعدة البيانات.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * خيار البحث غير الحسّاس لحالة الأحرف.
 *
 * `mode: 'insensitive'` مدعوم في PostgreSQL فقط ويرفضه Prisma على SQLite، لذلك
 * نضيفه حسب المحرك الفعلي. في SQLite عامل LIKE أصلًا غير حسّاس لحروف ASCII،
 * فالنتيجة متقاربة في الحالتين.
 */
export const insensitive = (process.env.DATABASE_URL ?? '').startsWith('postgres')
  ? ({ mode: 'insensitive' } as const)
  : {};

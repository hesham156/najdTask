// فحص سريع لمتغيرات البيئة قبل تشغيل التطبيق.
//
// السبب: لو غاب DATABASE_URL فإن Prisma يفشل برسالة P1012 طويلة عن "get-config
// wasm" لا تقول للمستخدم أين المشكلة فعلًا. هذا الملف يوقف التشغيل مبكرًا
// برسالة تشرح ما ينقص وأين يضبطه بالضبط.

import { existsSync, readFileSync } from 'node:fs';

// على Railway المتغيرات حقيقية في البيئة، لكن محليًا هي داخل ملف .env — و node
// لا يقرأه تلقائيًا (بعكس Prisma و Next). نقرأه هنا حتى لا يفشل الفحص محليًا
// على متغير موجود فعلًا.
function loadDotEnv() {
  if (!existsSync('.env')) return;

  for (const rawLine of readFileSync('.env', 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // البيئة الحقيقية لها الأولوية

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

const isProduction = process.env.NODE_ENV === 'production';

const problems = [];
const warnings = [];

// ── قاعدة البيانات ──
const dbUrl = (process.env.DATABASE_URL || '').trim();

if (!dbUrl) {
  problems.push({
    title: 'DATABASE_URL غير مضبوط',
    lines: [
      'على Railway: افتح خدمة التطبيق (مش خدمة Postgres) ← Variables',
      '  ← Add Variable Reference ← اختر خدمة Postgres ← DATABASE_URL',
      '',
      'لو كتبتها يدويًا فلازم اسم الخدمة يطابق الظاهر في اللوحة بالحرف:',
      '  ${{ Postgres.DATABASE_URL }}',
      'لو الاسم غلط، Railway يترك القيمة فارغة بدون أي تحذير.',
      '',
      'محليًا: ضع الرابط في ملف .env',
    ],
  });
} else if (dbUrl.includes('${{')) {
  // المرجع لم يُحَل — غالبًا اسم الخدمة مكتوب غلط
  problems.push({
    title: 'DATABASE_URL فيه مرجع لم يُحَل',
    lines: [
      `القيمة الحالية: ${dbUrl}`,
      '',
      'معنى ذلك أن اسم الخدمة داخل ${{ }} لا يطابق أي خدمة في مشروعك.',
      'صحّح الاسم، أو استخدم Add Variable Reference ليكتبه Railway بنفسه.',
    ],
  });
} else if (!/^(postgres(ql)?|file):/.test(dbUrl)) {
  problems.push({
    title: 'DATABASE_URL بصيغة غير مفهومة',
    lines: [
      'المتوقع أن يبدأ بـ postgresql:// (أو file: لقاعدة SQLite محلية).',
      `الموجود يبدأ بـ: ${dbUrl.slice(0, 24)}...`,
    ],
  });
}

// ── مفتاح الجلسات ──
const secret = (process.env.AUTH_SECRET || '').trim();

if (!secret) {
  problems.push({
    title: 'AUTH_SECRET غير مضبوط',
    lines: [
      'بدونه لا يمكن توقيع جلسات الدخول.',
      'ولّد واحدًا بهذا الأمر وضعه في متغيرات الخدمة:',
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    ],
  });
} else if (secret.length < 24) {
  problems.push({
    title: 'AUTH_SECRET قصير جدًا',
    lines: ['المطلوب 24 حرفًا على الأقل، والأفضل مفتاح عشوائي طويل.'],
  });
} else if (isProduction && secret.includes('dev')) {
  warnings.push('AUTH_SECRET يبدو أنه مفتاح التطوير — استبدله بمفتاح عشوائي على السيرفر.');
}

// ── تحذيرات لا توقف التشغيل ──
if (isProduction) {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  if (!uploadDir.startsWith('/')) {
    warnings.push(
      `UPLOAD_DIR = "${uploadDir}" مسار داخل الحاوية، والمرفقات ستُمحى مع كل نشر. ` +
        'أضف Volume على /data واضبط UPLOAD_DIR=/data/uploads',
    );
  }
  if (process.env.SEED_DEMO === 'true') {
    warnings.push(
      'SEED_DEMO=true على الإنتاج — سيتم إنشاء حسابات بكلمة المرور 123456 وأوردرات وهمية.',
    );
  }
  if (!process.env.ADMIN_PASSWORD) {
    warnings.push(
      'ADMIN_PASSWORD غير مضبوط — لو لم يكن حساب admin موجودًا فسيُنشأ بكلمة "admin123".',
    );
  }
}

for (const warning of warnings) {
  console.warn(`\n⚠️  ${warning}`);
}

if (problems.length === 0) {
  if (warnings.length) console.warn('');
  process.exit(0);
}

console.error('\n' + '─'.repeat(68));
console.error('توقف التشغيل: إعدادات ناقصة');
console.error('─'.repeat(68));

for (const problem of problems) {
  console.error(`\n❌ ${problem.title}\n`);
  for (const line of problem.lines) {
    console.error(line ? `   ${line}` : '');
  }
}

console.error('\n' + '─'.repeat(68));
console.error('التفاصيل في قسم "النشر على Railway" داخل README.md');
console.error('─'.repeat(68) + '\n');

process.exit(1);

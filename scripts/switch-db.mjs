// يبدّل محرك قاعدة البيانات في prisma/schema.prisma بين sqlite و postgresql.
// المخطط مكتوب بدون enum ولا مصفوفات، فالتبديل آمن في الاتجاهين.
//
//   node scripts/switch-db.mjs sqlite
//   node scripts/switch-db.mjs postgresql

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ALLOWED = ['sqlite', 'postgresql'];
const target = process.argv[2];

if (!ALLOWED.includes(target)) {
  console.error(`استخدم: node scripts/switch-db.mjs <${ALLOWED.join('|')}>`);
  process.exit(1);
}

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');

const providerLine = /(\n\s*provider\s*=\s*)"(sqlite|postgresql)"(\s*\n\s*url\s*=\s*env\("DATABASE_URL"\))/;

if (!providerLine.test(schema)) {
  console.error('لم أجد سطر provider داخل كتلة datasource في prisma/schema.prisma');
  process.exit(1);
}

writeFileSync(schemaPath, schema.replace(providerLine, `$1"${target}"$3`), 'utf8');

console.log(`تم ضبط محرك قاعدة البيانات على: ${target}`);
console.log('لا تنسَ تحديث DATABASE_URL في ملف .env ثم تشغيل:  npx prisma db push');

/**
 * القوائم (الصلاحيات، الأعمدة المرئية، أنواع الإنتاج) تُخزَّن في قاعدة البيانات
 * كنص JSON بدل مصفوفات، حتى يعمل نفس المخطط على SQLite و PostgreSQL.
 *
 * هذا الملف خالٍ من أي اعتماد على السيرفر حتى يمكن استخدامه في سكربت الـ seed
 * وفي مكوّنات الواجهة على السواء.
 */

export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function serializeList(value: string[]): string {
  return JSON.stringify([...new Set(value)]);
}

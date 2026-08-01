import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * تخزين المرفقات على القرص.
 *
 * الملفات تُحفظ خارج مجلد public عمدًا، ولا يمكن الوصول إليها إلا عبر
 * /api/files/[id] الذي يتحقق من صلاحية المستخدم أولًا. لو خُزِّنت في public
 * لكان أي شخص يعرف الرابط قادرًا على تحميل تصاميم العملاء.
 *
 * للنشر على استضافة قرصها مؤقت (مثل Vercel) استبدل جسم الدوال الثلاث أدناه
 * بمكتبة S3/R2 — بقية النظام لا تحتاج أي تعديل.
 */

const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024;

/** امتدادات تنفيذية نرفض رفعها. */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.sh',
  '.js', '.jar', '.vbs', '.dll', '.lnk', '.reg',
]);

async function ensureDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

/** ينظّف اسم الملف من أي محاولة للخروج من المجلد. */
function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 12);
  return /^\.[a-z0-9]+$/.test(ext) ? ext : '';
}

export function isBlockedFile(originalName: string): boolean {
  return BLOCKED_EXTENSIONS.has(path.extname(originalName).toLowerCase());
}

export async function saveFile(
  file: File,
): Promise<{ fileName: string; size: number; mimeType: string }> {
  await ensureDir();

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = `${Date.now()}-${randomUUID()}${safeExtension(file.name)}`;

  await writeFile(path.join(UPLOAD_DIR, fileName), buffer);

  return {
    fileName,
    size: buffer.byteLength,
    mimeType: file.type || 'application/octet-stream',
  };
}

export async function readStoredFile(fileName: string): Promise<Buffer> {
  // نمنع أي "../" في الاسم القادم من قاعدة البيانات كطبقة أمان إضافية
  const resolved = path.resolve(UPLOAD_DIR, path.basename(fileName));
  if (!resolved.startsWith(UPLOAD_DIR)) {
    throw new Error('مسار ملف غير صالح');
  }
  return readFile(resolved);
}

export async function deleteStoredFile(fileName: string): Promise<void> {
  try {
    const resolved = path.resolve(UPLOAD_DIR, path.basename(fileName));
    if (!resolved.startsWith(UPLOAD_DIR)) return;
    await unlink(resolved);
  } catch {
    // الملف غير موجود أصلًا — لا شيء نفعله
  }
}

export function etagFor(fileName: string, size: number): string {
  return `"${createHash('sha1').update(`${fileName}:${size}`).digest('hex')}"`;
}

/** أيقونة مبسطة حسب نوع الملف — تُستخدم في الواجهة. */
export function fileKind(mimeType: string, name: string): 'image' | 'pdf' | 'design' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  const ext = path.extname(name).toLowerCase();
  if (['.ai', '.psd', '.cdr', '.eps', '.indd', '.svg'].includes(ext)) return 'design';
  return 'file';
}

import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, ok, requireUser, route } from '@/lib/api';
import { can } from '@/lib/permissions';
import { assertCanTouchProductionType, findOrderOrThrow, logActivity } from '@/lib/orders';
import { MAX_UPLOAD_BYTES, isBlockedFile, saveFile } from '@/lib/storage';
import { formatBytes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * رفع مرفقات للأوردر.
 *
 * لو أُرسل orderItemId يصبح الملف خاصًا ببند بعينه، فلا يراه إلا من يرى نوع
 * إنتاج هذا البند — مفيد لفصل ملفات الأوفست عن ملفات الديجيتال داخل نفس الأوردر.
 */
export const POST = route(async (request: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  if (!can(user, 'files.upload')) throw forbidden('رفع الملفات');

  const order = await findOrderOrThrow(params.id);

  const form = await request.formData();
  const orderItemId = (form.get('orderItemId') as string | null) || null;

  if (orderItemId) {
    const item = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: { orderId: true, productionType: true },
    });
    if (!item || item.orderId !== order.id) throw badRequest('بند الشغل غير تابع لهذا الأوردر');
    assertCanTouchProductionType(user, item.productionType);
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw badRequest('لم يتم اختيار أي ملف');

  const saved = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw badRequest(
        `الملف "${file.name}" حجمه ${formatBytes(file.size)} ويتجاوز الحد المسموح ${formatBytes(MAX_UPLOAD_BYTES)}`,
      );
    }
    if (isBlockedFile(file.name)) {
      throw badRequest(`نوع الملف "${file.name}" غير مسموح برفعه`);
    }

    const stored = await saveFile(file);
    const attachment = await prisma.attachment.create({
      data: {
        orderId: order.id,
        orderItemId,
        fileName: stored.fileName,
        originalName: file.name.slice(0, 255),
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedById: user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    saved.push(attachment);
  }

  await logActivity({
    orderId: order.id,
    orderItemId,
    userId: user.id,
    action: 'file_uploaded',
    details: `رفع ${saved.length} ${saved.length === 1 ? 'ملف' : 'ملفات'}: ${saved.map((a) => a.originalName).join('، ')}`,
  });

  return ok({ attachments: saved }, 201);
});

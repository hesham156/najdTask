import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { forbidden, notFound, ok, requireUser, route } from '@/lib/api';
import { can, canSeeProductionType } from '@/lib/permissions';
import { logActivity } from '@/lib/orders';
import { deleteStoredFile, etagFor, readStoredFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

async function loadAccessible(id: string, userId: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { orderItem: { select: { productionType: true } } },
  });
  if (!attachment) throw notFound('الملف');
  return attachment;
}

/**
 * يقدّم الملف بعد التحقق من الصلاحية.
 * الملفات لا تُخزَّن في public تحديدًا حتى لا يمكن الوصول إليها بتخمين الرابط.
 */
export const GET = route(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  if (!can(user, 'files.download')) throw forbidden('فتح الملفات');

  const attachment = await loadAccessible(params.id, user.id);

  // ملف تابع لبند شغل لا يفتحه إلا من يرى نوع الإنتاج الخاص به
  if (attachment.orderItem && !canSeeProductionType(user, attachment.orderItem.productionType)) {
    throw forbidden('فتح هذا الملف');
  }

  const etag = etagFor(attachment.fileName, attachment.size);
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304 });
  }

  const buffer = await readStoredFile(attachment.fileName);
  const download = new URL(request.url).searchParams.get('download') === '1';

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.size),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
      ETag: etag,
    },
  });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  if (!can(user, 'files.delete')) throw forbidden('حذف الملفات');

  const attachment = await loadAccessible(params.id, user.id);
  if (attachment.orderItem && !canSeeProductionType(user, attachment.orderItem.productionType)) {
    throw forbidden('حذف هذا الملف');
  }

  await prisma.attachment.delete({ where: { id: attachment.id } });
  await deleteStoredFile(attachment.fileName);

  await logActivity({
    orderId: attachment.orderId,
    orderItemId: attachment.orderItemId,
    userId: user.id,
    action: 'file_deleted',
    details: `حذف الملف "${attachment.originalName}"`,
  });

  return ok({ success: true });
});

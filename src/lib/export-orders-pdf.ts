/**
 * تصدير مجموعة أوردرات: ملف PDF مستقل لكل أوردر، مجمّعة في ملف ZIP واحد.
 *
 * لماذا هكذا:
 *  - المستند نفسه هو مستند الطباعة حرفيًا (buildOrderHtml)، فلا يوجد تنسيقان
 *    يفترقان مع الوقت.
 *  - نرسمه داخل iframe مخفي ثم نحوّله إلى صورة بـ html2canvas: المتصفح هو من
 *    يشكّل الحروف العربية ويوصلها، وهذا ما يجعل الناتج سليمًا. توليد PDF نصّي
 *    مباشرة من jsPDF لا يجيد تشكيل العربية، فيخرج الكلام مفكّكًا ومقلوبًا.
 *  - النتيجة صورة داخل PDF: مظهرها مطابق للطباعة لكن نصّها غير قابل للتحديد
 *    أو البحث. هذه هي المقايضة المقصودة.
 *  - الملفات تُجمَّع في ZIP لأن تنزيل عشرات الملفات دفعة واحدة يوقفه المتصفح.
 *
 * المكتبات تُحمَّل ديناميكيًا عند الضغط على زر التصدير فقط، فلا تثقل حزمة
 * الصفحة على من لا يصدّر.
 */

import { buildOrderHtml, type PrintableOrder } from '@/lib/print-order';

/** عرض A4 بالبكسل عند 96dpi — نرسم عليه ثم نقيس على الصفحة بالمليمتر. */
const A4_WIDTH_PX = 794;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** دقة الرسم. 2 يعطي وضوحًا يقارب 150dpi على الورق بحجم ملف معقول. */
const SCALE = 2;

export type ExportProgress = { done: number; total: number };

/** اسم ملف آمن على ويندوز وماك: لا محارف ممنوعة ولا طول مبالغ فيه. */
function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** يكتب المستند في iframe مخفي ويعيده بعد اكتمال تحميله. */
function renderInFrame(html: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    // خارج الشاشة لا مخفي بـ display:none — العنصر المخفي لا تُحسب أبعاده
    frame.style.cssText = `position:fixed; left:-10000px; top:0; width:${A4_WIDTH_PX}px; height:100px; border:0; visibility:hidden;`;

    frame.onload = () => resolve(frame);
    frame.onerror = () => reject(new Error('تعذّر تجهيز مستند الأوردر'));

    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      reject(new Error('تعذّر تجهيز مستند الأوردر'));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    // بعض المتصفحات لا تطلق onload على مستند مكتوب يدويًا
    if (doc.readyState === 'complete') resolve(frame);
  });
}

/** يحوّل مستند أوردر واحد إلى PDF بصفحات A4. */
async function orderToPdfBlob(
  order: PrintableOrder,
  orderNumberPrefix: string,
  jsPDF: typeof import('jspdf').jsPDF,
  html2canvas: typeof import('html2canvas').default,
): Promise<Blob> {
  const frame = await renderInFrame(buildOrderHtml(order, orderNumberPrefix));

  try {
    const doc = frame.contentDocument!;
    const body = doc.body;

    // الإطار يأخذ ارتفاع محتواه حتى يلتقطه html2canvas كاملًا لا الجزء الظاهر
    const height = Math.max(body.scrollHeight, body.offsetHeight);
    frame.style.height = `${height}px`;

    const canvas = await html2canvas(body, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: A4_WIDTH_PX,
      width: A4_WIDTH_PX,
      height,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // ارتفاع الصفحة الواحدة مقيسًا ببكسلات الرسم
    const pageHeightPx = Math.floor((A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width);
    const pages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

    for (let page = 0; page < pages; page++) {
      const sliceTop = page * pageHeightPx;
      const sliceHeight = Math.min(pageHeightPx, canvas.height - sliceTop);

      // نقصّ كل صفحة في لوحة منفصلة بدل إزاحة الصورة كاملة، فلا يتضخّم الملف
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const ctx = slice.getContext('2d');
      if (!ctx) throw new Error('تعذّر رسم صفحة المستند');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, sliceTop, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const sliceHeightMm = (sliceHeight / canvas.width) * A4_WIDTH_MM;
      if (page > 0) pdf.addPage();
      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        0,
        0,
        A4_WIDTH_MM,
        sliceHeightMm,
        undefined,
        'FAST',
      );
    }

    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

/**
 * يبني ZIP فيه ملف PDF لكل أوردر. `onProgress` يُستدعى بعد كل أوردر لتحديث
 * شريط التقدّم في الواجهة.
 */
export async function exportOrdersToPdfZip(
  orders: PrintableOrder[],
  orderNumberPrefix: string,
  onProgress?: (progress: ExportProgress) => void,
): Promise<Blob> {
  const [{ jsPDF }, html2canvasModule, JSZipModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
    import('jszip'),
  ]);

  const html2canvas = html2canvasModule.default;
  const zip = new JSZipModule.default();

  const usedNames = new Set<string>();

  for (const [index, order] of orders.entries()) {
    const blob = await orderToPdfBlob(order, orderNumberPrefix, jsPDF, html2canvas);

    // رقم الأوردر فريد، لكن نحتاط لو تكرّر الاسم بعد التنظيف
    let fileName = `${safeFileName(`${orderNumberPrefix}${order.number} - ${order.customerName}`)}.pdf`;
    if (usedNames.has(fileName)) fileName = `${fileName.slice(0, -4)} (${index + 1}).pdf`;
    usedNames.add(fileName);

    zip.file(fileName, blob);
    onProgress?.({ done: index + 1, total: orders.length });

    // نفسح مجالًا للمتصفح بين كل أوردر وآخر حتى لا تتجمّد الصفحة
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return zip.generateAsync({ type: 'blob' });
}

/** ينزّل Blob باسم محدد. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // الإفراج المتأخر يترك للمتصفح وقتًا لبدء التنزيل
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

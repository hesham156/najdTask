/**
 * بناء مستند طباعة مستقل لأوردر واحد وفتحه في نافذة الطباعة.
 *
 * نبني صفحة HTML كاملة بأنماطها الخاصة ونفتحها في نافذة جديدة ثم نستدعي
 * print(): هذا يعزل التنسيق عن أنماط التطبيق (الشريط الجانبي، الحاويات
 * القابلة للتمرير) ويضمن مخرجًا نظيفًا ومرتبًا بلا أي عناصر واجهة.
 */

import { formatDate, formatDateTime } from '@/lib/utils';
import {
  ITEM_STATUS_LABELS,
  ORDER_STAGE_LABELS,
  PRIORITY_LABELS,
  PRODUCTION_TYPE_LABELS,
  consumptionShortLabel,
  itemOptionLabels,
  type ItemStatus,
  type OrderStage,
  type Priority,
  type ProductionType,
} from '@/lib/stages';

type Person = { id: string; name: string };

type PrintItem = {
  id: string;
  productionType: ProductionType;
  title: string;
  quantity: number;
  specs: string | null;
  options: string[];
  consumedQty: number | null;
  consumedUnit: string | null;
  status: ItemStatus;
  assignee: Person | null;
};

type PrintAttachment = {
  id: string;
  originalName: string;
  orderItemId: string | null;
};

export type PrintableOrder = {
  number: number;
  description: string | null;
  customerName: string;
  stage: OrderStage;
  priority: Priority;
  dueDate: string | null;
  createdAt: string;
  createdBy: Person;
  items: PrintItem[];
  attachments: PrintAttachment[];
  invoiceNumber: string | null;
  invoiceAmount: number | null;
  invoicePaid: boolean;
  deliveryNoteNumber: string | null;
  receiverName: string | null;
};

/** يمنع كسر التخطيط أو حقن HTML من محتوى المستخدم (أسماء، مواصفات...). */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemRow(item: PrintItem, index: number): string {
  const options = itemOptionLabels(item.productionType, item.options);
  const consumption =
    item.consumedQty !== null
      ? `${item.consumedQty} ${consumptionShortLabel(item.productionType, item.consumedUnit)}`
      : '—';

  const details = [
    item.specs ? `<div class="specs">${esc(item.specs)}</div>` : '',
    options.length > 0
      ? `<div class="options">${options.map((o) => `<span>${esc(o)}</span>`).join('')}</div>`
      : '',
  ].join('');

  return `
    <tr>
      <td class="num center">${index + 1}</td>
      <td>
        <div class="item-title">${esc(item.title)}</div>
        ${details}
      </td>
      <td class="center">${esc(PRODUCTION_TYPE_LABELS[item.productionType])}</td>
      <td class="num center">${esc(item.quantity)}</td>
      <td class="num center">${esc(consumption)}</td>
      <td class="center">${esc(ITEM_STATUS_LABELS[item.status])}</td>
      <td class="center">${item.assignee ? esc(item.assignee.name) : '—'}</td>
    </tr>`;
}

/**
 * مستند الأوردر كصفحة HTML مستقلة. مُصدَّر لأن التصدير الجماعي إلى PDF يعيد
 * استخدامه حرفيًا، فيخرج ملف التصدير مطابقًا لما تراه في الطباعة.
 */
export function buildOrderHtml(order: PrintableOrder, orderNumberPrefix: string): string {
  const orderNo = `${orderNumberPrefix}${order.number}`;
  const orderFiles = order.attachments.filter((a) => !a.orderItemId);

  const itemsTable =
    order.items.length > 0
      ? `<table class="items">
          <thead>
            <tr>
              <th class="center">#</th>
              <th>البند والمواصفات</th>
              <th class="center">نوع الشغل</th>
              <th class="center">الكمية</th>
              <th class="center">المستهلك</th>
              <th class="center">الحالة</th>
              <th class="center">المسؤول</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map((item, i) => itemRow(item, i)).join('')}
          </tbody>
        </table>`
      : `<p class="empty">لا توجد بنود شغل</p>`;

  const filesBlock =
    orderFiles.length > 0
      ? `<section class="block">
          <h2>ملفات الأوردر <span class="count">${orderFiles.length}</span></h2>
          <ul class="files">
            ${orderFiles.map((f) => `<li>${esc(f.originalName)}</li>`).join('')}
          </ul>
        </section>`
      : '';

  const hasInvoice =
    order.invoiceNumber ||
    order.invoiceAmount !== null ||
    order.deliveryNoteNumber ||
    order.receiverName;

  const invoiceBlock = hasInvoice
    ? `<section class="block">
        <h2>الفاتورة وسند التسليم</h2>
        <dl class="meta-grid">
          <div><dt>رقم الفاتورة</dt><dd class="num">${esc(order.invoiceNumber) || '—'}</dd></div>
          <div><dt>قيمة الفاتورة</dt><dd class="num">${
            order.invoiceAmount !== null ? `${esc(order.invoiceAmount)} ر.س` : '—'
          }</dd></div>
          <div><dt>حالة التحصيل</dt><dd>${order.invoicePaid ? 'تم التحصيل' : 'غير محصّلة'}</dd></div>
          <div><dt>رقم سند التسليم</dt><dd class="num">${esc(order.deliveryNoteNumber) || '—'}</dd></div>
          <div><dt>اسم المستلم</dt><dd>${esc(order.receiverName) || '—'}</dd></div>
        </dl>
      </section>`
    : '';

  const descriptionBlock = order.description
    ? `<section class="block">
        <h2>تفاصيل الأوردر</h2>
        <p class="description">${esc(order.description)}</p>
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>أوردر ${esc(orderNo)} — ${esc(order.customerName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --line: #e2e8f0; --muted: #64748b; --ink: #0f172a; }
    body {
      font-family: 'Segoe UI', 'Tahoma', system-ui, sans-serif;
      color: var(--ink);
      line-height: 1.5;
      padding: 24px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .num { font-variant-numeric: tabular-nums; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--ink);
      margin-bottom: 20px;
    }
    /* بلا letter-spacing: تحويل المستند إلى صورة في التصدير يرسم الحروف واحدًا
       واحدًا عند ضبطه، فتنفصل حروف الكلمة العربية وتضيع المسافات بين الكلمات */
    .brand { font-size: 22px; font-weight: 800; }
    .brand small { display: block; font-size: 11px; font-weight: 500; color: var(--muted); margin-top: 2px; }
    .order-no {
      font-size: 20px; font-weight: 800;
      background: var(--ink); color: #fff;
      padding: 6px 12px; border-radius: 8px;
    }
    .headline { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .badge {
      font-size: 12px; font-weight: 600;
      border: 1px solid var(--line); border-radius: 999px;
      padding: 3px 10px; background: #f8fafc; color: #334155;
    }
    .meta-grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px 16px; margin-bottom: 20px;
    }
    .meta-grid > div {
      border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: #f8fafc;
    }
    .meta-grid dt { font-size: 11px; color: var(--muted); margin-bottom: 2px; }
    .meta-grid dd { font-size: 14px; font-weight: 700; }
    .block { margin-bottom: 20px; }
    .block h2 {
      font-size: 15px; font-weight: 800; margin-bottom: 10px;
      display: flex; align-items: center; gap: 8px;
    }
    .block h2 .count {
      font-size: 12px; background: #eef2f7; color: var(--muted);
      border-radius: 999px; padding: 1px 8px;
    }
    .description { white-space: pre-wrap; background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-size: 14px; }
    table.items { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.items th {
      background: #f1f5f9; text-align: right; font-weight: 700;
      padding: 8px 10px; border: 1px solid var(--line); font-size: 12px;
    }
    table.items td { padding: 8px 10px; border: 1px solid var(--line); vertical-align: top; }
    table.items .center { text-align: center; }
    .item-title { font-weight: 700; }
    .specs { color: var(--muted); font-size: 12px; margin-top: 3px; }
    .options { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
    .options span {
      font-size: 11px; font-weight: 600;
      border: 1px solid #c7d2fe; background: #eef2ff; color: #4338ca;
      border-radius: 4px; padding: 1px 6px;
    }
    ul.files { list-style: none; display: grid; gap: 6px; }
    ul.files li {
      font-size: 13px; border: 1px solid var(--line);
      border-radius: 6px; padding: 6px 10px; background: #f8fafc;
    }
    .empty { color: var(--muted); font-size: 13px; border: 1px dashed var(--line); border-radius: 8px; padding: 14px; text-align: center; }
    footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); text-align: center; }
    @media print {
      body { padding: 0; }
      table.items tr, .block { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">نجد<small>أمر شغل</small></div>
    <div class="order-no num">${esc(orderNo)}</div>
  </header>

  <div class="headline">${esc(order.customerName)}</div>
  <div class="badges">
    <span class="badge">${esc(ORDER_STAGE_LABELS[order.stage])}</span>
    <span class="badge">${esc(PRIORITY_LABELS[order.priority])}</span>
  </div>

  <dl class="meta-grid">
    <div><dt>تاريخ الإنشاء</dt><dd>${esc(formatDate(order.createdAt))}</dd></div>
    <div><dt>تاريخ التسليم</dt><dd>${order.dueDate ? esc(formatDate(order.dueDate)) : '—'}</dd></div>
    <div><dt>أنشأه</dt><dd>${esc(order.createdBy.name)}</dd></div>
  </dl>

  ${descriptionBlock}

  <section class="block">
    <h2>بنود الشغل <span class="count">${order.items.length}</span></h2>
    ${itemsTable}
  </section>

  ${filesBlock}
  ${invoiceBlock}

  <footer>طُبع في ${esc(formatDateTime(new Date().toISOString()))} — نظام نجد لإدارة المطبعة</footer>
</body>
</html>`;
}

/** يبني مستند الأوردر ويفتح نافذة الطباعة. يعيد false إذا منع المتصفح النافذة. */
export function printOrder(order: PrintableOrder, orderNumberPrefix: string): boolean {
  const html = buildOrderHtml(order, orderNumberPrefix);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false;

  win.document.open();
  win.document.write(html);
  win.document.close();

  // نستدعي الطباعة مرة واحدة فقط: عند اكتمال التحميل، وإلا احتياطيًا بعد مهلة
  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      /* تجاهل — قد تكون النافذة أُغلقت */
    }
  };

  win.onload = triggerPrint;
  setTimeout(triggerPrint, 500);

  return true;
}

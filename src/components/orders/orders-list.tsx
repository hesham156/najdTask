'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Download, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiGet } from '@/lib/client';
import { downloadBlob, exportOrdersToPdfZip } from '@/lib/export-orders-pdf';
import type { PrintableOrder } from '@/lib/print-order';
import { cn, formatDate } from '@/lib/utils';
import {
  ORDER_STAGES,
  ORDER_STAGE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  PRODUCTION_TYPE_LABELS,
  type OrderStage,
  type Priority,
  type ProductionType,
} from '@/lib/stages';
import { usePermissions } from '@/components/session';
import { EmptyState, PageLoader, Spinner } from '@/components/ui';
import { CreateOrderModal } from './create-order-modal';

type ListOrder = {
  id: string;
  number: number;
  customerName: string;
  stage: OrderStage;
  priority: Priority;
  dueDate: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  items: { id: string; productionType: ProductionType; status: string }[];
  totalItems: number;
  _count: { attachments: number; comments: number };
};

export function OrdersList() {
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  /** فلتر الفترة على تاريخ إنشاء الأوردر، بصيغة YYYY-MM-DD */
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  /** الفلاتر التي يشترك فيها العرض والتصدير، فيصدّر المستخدم ما يراه بالضبط */
  const filters = {
    ...(search ? { q: search } : {}),
    ...(stage ? { stage } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['orders', search, stage, from, to],
    queryFn: () =>
      apiGet<{ orders: ListOrder[]; total: number; orderNumberPrefix: string }>(
        `/api/orders?${new URLSearchParams(filters)}`,
      ),
  });

  const prefix = data?.orderNumberPrefix ?? '';
  const hasFilters = Boolean(search || stage || from || to);

  async function exportPdfs() {
    setExporting({ done: 0, total: 0 });
    try {
      const payload = await apiGet<{
        orders: PrintableOrder[];
        total: number;
        orderNumberPrefix: string;
      }>(`/api/orders/export?${new URLSearchParams(filters)}`);

      if (payload.orders.length === 0) {
        toast.error('لا توجد أوردرات في هذه الفترة');
        return;
      }

      setExporting({ done: 0, total: payload.orders.length });

      const zip = await exportOrdersToPdfZip(
        payload.orders,
        payload.orderNumberPrefix,
        setExporting,
      );

      const stamp = from && to ? `${from}_${to}` : from || to || 'الكل';
      downloadBlob(zip, `أوردرات ${stamp}.zip`);
      toast.success(`تم تصدير ${payload.orders.length} أوردر`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر تصدير الأوردرات');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">كل الأوردرات</h1>
            <p className="text-xs text-slate-500">
              {data ? (
                <>
                  <span className="num">{data.total}</span> أوردر
                </>
              ) : (
                'جارٍ التحميل...'
              )}
            </p>
          </div>

          <div className="flex-1" />

          <button
            type="button"
            className="btn-secondary"
            onClick={exportPdfs}
            disabled={exporting !== null || !data || data.total === 0}
            title="ملف PDF لكل أوردر، مجمّعة في ZIP واحد"
          >
            {exporting ? <Spinner /> : <Download className="h-4 w-4" />}
            {exporting
              ? exporting.total > 0
                ? `جارٍ التصدير ${exporting.done}/${exporting.total}`
                : 'جارٍ التحضير...'
              : 'تصدير PDF'}
          </button>

          {can('orders.create') ? (
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              أوردر جديد
            </button>
          ) : null}
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" />
            <input
              className="input ps-9"
              placeholder="ابحث برقم الأوردر أو اسم العميل..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            className="input sm:w-48"
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            aria-label="تصفية حسب المرحلة"
          >
            <option value="">كل المراحل</option>
            {ORDER_STAGES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STAGE_LABELS[value]}
              </option>
            ))}
          </select>

          {/* الفترة محسوبة على تاريخ إنشاء الأوردر لا تاريخ تسليمه */}
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-xs text-slate-500">من</span>
            <input
              type="date"
              className="input w-auto"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="من تاريخ الإنشاء"
            />
            <span className="shrink-0 text-xs text-slate-500">إلى</span>
            <input
              type="date"
              className="input w-auto"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              aria-label="إلى تاريخ الإنشاء"
            />
            {from || to ? (
              <button
                type="button"
                className="btn-ghost h-9 w-9 shrink-0 !px-0 text-slate-400 hover:text-red-600"
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
                aria-label="مسح فلتر الفترة"
                title="مسح الفترة"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : !data || data.orders.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="لا توجد أوردرات"
            description={hasFilters ? 'جرّب تغيير كلمة البحث أو الفلاتر' : 'ابدأ بإضافة أول أوردر'}
          />
        ) : (
          <>
            {/* جدول على الشاشات الكبيرة */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-start font-medium">الرقم</th>
                    <th className="px-3 py-2.5 text-start font-medium">العميل</th>
                    <th className="px-3 py-2.5 text-start font-medium">المرحلة</th>
                    <th className="px-3 py-2.5 text-start font-medium">البنود</th>
                    <th className="px-3 py-2.5 text-start font-medium">التسليم</th>
                    <th className="px-3 py-2.5 text-start font-medium">الأولوية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.orders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/orders/${order.id}`}
                          className="num font-bold text-brand-700 hover:underline"
                        >
                          {prefix}
                          {order.number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-medium text-slate-800 hover:underline"
                        >
                          {order.customerName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {ORDER_STAGE_LABELS[order.stage]}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {order.items.map((item) => (
                            <span
                              key={item.id}
                              className={cn(
                                'chip',
                                item.status === 'done'
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-600',
                              )}
                            >
                              {PRODUCTION_TYPE_LABELS[item.productionType]}
                            </span>
                          ))}
                          {order.totalItems > order.items.length ? (
                            <span className="chip border-slate-200 bg-white text-slate-400">
                              +<span className="num">{order.totalItems - order.items.length}</span>
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{formatDate(order.dueDate)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('chip', PRIORITY_STYLES[order.priority])}>
                          {PRIORITY_LABELS[order.priority]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* كروت على الموبايل */}
            <div className="space-y-2 md:hidden">
              {data.orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="num rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold text-white">
                      {prefix}
                      {order.number}
                    </span>
                    <span className={cn('chip', PRIORITY_STYLES[order.priority])}>
                      {PRIORITY_LABELS[order.priority]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{order.customerName}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                    <span className="chip border-slate-200 bg-slate-50">
                      {ORDER_STAGE_LABELS[order.stage]}
                    </span>
                    {order.dueDate ? <span>التسليم {formatDate(order.dueDate)}</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <CreateOrderModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

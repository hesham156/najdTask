'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Search } from 'lucide-react';

import { apiGet } from '@/lib/client';
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
import { EmptyState, PageLoader } from '@/components/ui';
import { CreateOrderModal } from './create-order-modal';

type ListOrder = {
  id: string;
  number: number;
  title: string;
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
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', search, stage],
    queryFn: () =>
      apiGet<{ orders: ListOrder[]; total: number; orderNumberPrefix: string }>(
        `/api/orders?${new URLSearchParams({
          ...(search ? { q: search } : {}),
          ...(stage ? { stage } : {}),
        })}`,
      ),
  });

  const prefix = data?.orderNumberPrefix ?? '';

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
              placeholder="ابحث برقم الأوردر أو العنوان أو العميل..."
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
        </div>

        {isLoading ? (
          <PageLoader />
        ) : !data || data.orders.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="لا توجد أوردرات"
            description={
              search || stage ? 'جرّب تغيير كلمة البحث أو الفلتر' : 'ابدأ بإضافة أول أوردر'
            }
          />
        ) : (
          <>
            {/* جدول على الشاشات الكبيرة */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-start font-medium">الرقم</th>
                    <th className="px-3 py-2.5 text-start font-medium">الأوردر</th>
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
                        <Link href={`/orders/${order.id}`} className="hover:underline">
                          {order.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{order.customerName}</td>
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
                  <p className="text-sm font-semibold text-slate-900">{order.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{order.customerName}</p>
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

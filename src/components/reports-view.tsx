'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, Receipt, Users } from 'lucide-react';

import { apiGet } from '@/lib/client';
import { cn } from '@/lib/utils';
import { PageLoader, Spinner } from '@/components/ui';

type ConsumptionUnitRow = { unit: string; total: number; count: number };

type ReportData = {
  period: { days: number; label: string };
  periods: { days: number; label: string }[];
  totalOrders: number;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  lateOrders: number;
  stageCounts: { stage: string; label: string; count: number }[];
  workload: {
    id: string;
    name: string;
    pending: number;
    inProgress: number;
    done: number;
    active: number;
    total: number;
  }[];
  typeCounts: {
    type: string;
    label: string;
    pending: number;
    inProgress: number;
    done: number;
    total: number;
  }[];
  consumption: {
    totalSheets: number;
    totalMeters: number;
    recordedItems: number;
    totalItems: number;
    byType: { type: string; label: string; recordedItems: number; units: ConsumptionUnitRow[] }[];
  };
  topCustomers: { name: string; count: number }[];
};

const num = (value: number) => value.toLocaleString('en-US');

export function ReportsView() {
  const [days, setDays] = useState(30);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['reports', days],
    queryFn: () => apiGet<ReportData>(`/api/reports?days=${days}`),
    placeholderData: (previous) => previous,
  });

  if (isLoading) return <PageLoader />;
  if (error || !data) {
    return (
      <div className="p-6">
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'تعذّر تحميل التقارير'}
        </p>
      </div>
    );
  }

  const maxStage = Math.max(...data.stageCounts.map((s) => s.count), 1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-slate-900">
            التقارير
            {isFetching ? <Spinner className="ms-2 inline text-slate-400" /> : null}
          </h1>

          {/* كل الأرقام أدناه محسوبة على أوردرات هذه الفترة */}
          <div className="flex flex-wrap gap-1" role="group" aria-label="الفترة">
            {data.periods.map((period) => (
              <button
                key={period.days}
                type="button"
                onClick={() => setDays(period.days)}
                aria-pressed={data.period.days === period.days}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                  data.period.days === period.days
                    ? 'border-brand-400 bg-brand-50 text-brand-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        {/* بطاقات سريعة */}
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={ClipboardList}
            label="إجمالي الأوردرات"
            value={data.totalOrders.toString()}
          />
          <StatCard
            icon={Receipt}
            label="إجمالي الفواتير"
            value={data.totalInvoiced.toLocaleString('en-US')}
          />
          <StatCard
            icon={AlertTriangle}
            label="أوردرات فات موعدها"
            value={data.lateOrders.toString()}
            danger={data.lateOrders > 0}
          />
        </div>

        {/* التحصيل المالي */}
        <section className="card mb-5 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">التحصيل المالي</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">إجمالي الفواتير</p>
              <p className="num text-xl font-bold text-slate-900">{num(data.totalInvoiced)}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs text-green-700">محصّل</p>
              <p className="num text-xl font-bold text-green-700">{num(data.totalCollected)}</p>
            </div>
            <div
              className={cn(
                'rounded-lg border p-3',
                data.totalOutstanding > 0
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-slate-200 bg-slate-50',
              )}
            >
              <p
                className={cn('text-xs', data.totalOutstanding > 0 ? 'text-amber-700' : 'text-slate-500')}
              >
                متبقّي على العملاء
              </p>
              <p
                className={cn(
                  'num text-xl font-bold',
                  data.totalOutstanding > 0 ? 'text-amber-700' : 'text-slate-900',
                )}
              >
                {num(data.totalOutstanding)}
              </p>
            </div>
          </div>
          {/* شريط نسبة التحصيل */}
          {data.totalInvoiced > 0 ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${(data.totalCollected / data.totalInvoiced) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                نسبة التحصيل{' '}
                <span className="num font-semibold text-slate-700">
                  {Math.round((data.totalCollected / data.totalInvoiced) * 100)}%
                </span>
              </p>
            </div>
          ) : null}
        </section>

        {/* توزيع المراحل */}
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">الأوردرات حسب المرحلة</h2>
          <div className="space-y-2">
            {data.stageCounts.map((stage) => (
              <div key={stage.stage} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs text-slate-600">
                  {stage.label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(stage.count / maxStage) * 100}%` }}
                  />
                </div>
                <span className="num w-8 shrink-0 text-end text-xs font-bold text-slate-700">
                  {stage.count}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* أنواع الإنتاج */}
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">بنود الشغل حسب النوع</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="pb-2 text-start font-medium">النوع</th>
                  <th className="pb-2 text-start font-medium">في الانتظار</th>
                  <th className="pb-2 text-start font-medium">جاري التنفيذ</th>
                  <th className="pb-2 text-start font-medium">تم</th>
                  <th className="pb-2 text-start font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.typeCounts.map((type) => (
                  <tr key={type.type}>
                    <td className="py-2 font-medium text-slate-800">{type.label}</td>
                    <td className="num py-2 text-slate-600">{type.pending}</td>
                    <td className="num py-2 text-blue-700">{type.inProgress}</td>
                    <td className="num py-2 text-green-700">{type.done}</td>
                    <td className="num py-2 font-bold text-slate-800">{type.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* توزيع الشغل على العمّال */}
        <section className="card mb-4 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Users className="h-4 w-4 text-slate-400" />
            توزيع الشغل على العمّال
          </h2>
          {data.workload.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
              لا توجد بنود مُسنَدة لعمّال في هذه الفترة
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="pb-2 text-start font-medium">العامل</th>
                    <th className="pb-2 text-start font-medium">في الانتظار</th>
                    <th className="pb-2 text-start font-medium">جاري التنفيذ</th>
                    <th className="pb-2 text-start font-medium">تم</th>
                    <th className="pb-2 text-start font-medium">الحمل الجاري</th>
                    <th className="pb-2 text-start font-medium">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.workload.map((worker) => (
                    <tr key={worker.id}>
                      <td className="py-2 font-medium text-slate-800">{worker.name}</td>
                      <td className="num py-2 text-slate-600">{worker.pending}</td>
                      <td className="num py-2 text-blue-700">{worker.inProgress}</td>
                      <td className="num py-2 text-green-700">{worker.done}</td>
                      <td className="num py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-bold',
                            worker.active > 0
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {worker.active}
                        </span>
                      </td>
                      <td className="num py-2 font-bold text-slate-800">{worker.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* استهلاك الإنتاج */}
        <section className="card mb-4 p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">استهلاك الإنتاج</h2>
            <p className="text-[11px] text-slate-500">
              مسجَّل على <span className="num">{data.consumption.recordedItems}</span> من{' '}
              <span className="num">{data.consumption.totalItems}</span> بند
            </p>
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">إجمالي الشيتات</p>
              <p className="num text-xl font-bold text-slate-900">
                {num(data.consumption.totalSheets)}
                <span className="ms-1 text-xs font-normal text-slate-500">شيت</span>
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">إجمالي الأمتار</p>
              <p className="num text-xl font-bold text-slate-900">
                {num(data.consumption.totalMeters)}
                <span className="ms-1 text-xs font-normal text-slate-500">متر</span>
              </p>
            </div>
          </div>

          {data.consumption.byType.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
              لم يسجّل عمال الإنتاج أي استهلاك في هذه الفترة
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.consumption.byType.map((row) => (
                <li key={row.type} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium text-slate-800">{row.label}</span>
                  <span className="text-[11px] text-slate-400">
                    <span className="num">{row.recordedItems}</span> بند
                  </span>
                  <span className="ms-auto flex flex-wrap gap-1.5">
                    {row.units.map((u) => (
                      <span
                        key={u.unit}
                        className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700"
                      >
                        <span className="num">{num(u.total)}</span> {u.unit}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* أكثر العملاء */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">أكثر العملاء طلبًا</h2>
          {data.topCustomers.length === 0 ? (
            <p className="text-xs text-slate-500">لا توجد بيانات بعد</p>
          ) : (
            <ul className="space-y-1.5">
              {data.topCustomers.map((customer) => (
                <li
                  key={customer.name}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate text-slate-700">{customer.name}</span>
                  <span className="num shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {customer.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
          danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('num text-lg font-bold', danger ? 'text-red-600' : 'text-slate-900')}>
          {value}
        </p>
      </div>
    </div>
  );
}

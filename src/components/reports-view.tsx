'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, Receipt } from 'lucide-react';

import { apiGet } from '@/lib/client';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui';

type ReportData = {
  totalOrders: number;
  totalInvoiced: number;
  lateOrders: number;
  stageCounts: { stage: string; label: string; count: number }[];
  typeCounts: {
    type: string;
    label: string;
    pending: number;
    inProgress: number;
    done: number;
    total: number;
  }[];
  topCustomers: { name: string; count: number }[];
};

export function ReportsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reports'],
    queryFn: () => apiGet<ReportData>('/api/reports'),
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
        <h1 className="mb-4 text-lg font-bold text-slate-900">التقارير</h1>

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

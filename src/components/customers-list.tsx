'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Phone, Plus, Search, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiGet, apiPost } from '@/lib/client';
import { cn, formatDate } from '@/lib/utils';
import {
  ORDER_STAGE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  type OrderStage,
  type Priority,
} from '@/lib/stages';
import { usePermissions } from '@/components/session';
import { EmptyState, Field, Modal, PageLoader, Spinner } from '@/components/ui';

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  _count: { orders: number };
};

export function CustomersList() {
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [ordersOf, setOrdersOf] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      apiGet<{ customers: Customer[] }>(
        `/api/customers${search ? `?q=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900">العملاء</h1>
          <div className="flex-1" />
          {can('customers.manage') ? (
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              عميل جديد
            </button>
          ) : null}
        </header>

        <div className="relative mb-4 sm:max-w-xs">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" />
          <input
            className="input ps-9"
            placeholder="ابحث بالاسم أو التليفون..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {isLoading ? (
          <PageLoader />
        ) : !data || data.customers.length === 0 ? (
          <EmptyState icon={UsersRound} title="لا يوجد عملاء" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.customers.map((customer) => (
              <div
                key={customer.id}
                className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{customer.name}</p>
                  {customer.company ? (
                    <p className="truncate text-xs text-slate-500">{customer.company}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {customer.phone ? (
                      <a
                        href={`tel:${customer.phone}`}
                        className="num flex items-center gap-1 hover:text-brand-700"
                        dir="ltr"
                      >
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </a>
                    ) : null}
                    <span>
                      <span className="num font-semibold text-slate-700">
                        {customer._count.orders}
                      </span>{' '}
                      أوردر
                    </span>
                  </div>
                </div>

                {can('orders.view') ? (
                  <button
                    type="button"
                    className="btn-secondary shrink-0 !py-1.5 !text-xs"
                    onClick={() => setOrdersOf(customer)}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    أوردراته
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <CustomerOrdersModal customer={ordersOf} onClose={() => setOrdersOf(null)} />
    </div>
  );
}

// ─────────────────────────── أوردرات العميل خلال فترة ───────────────────────────

type CustomerOrder = {
  id: string;
  number: number;
  stage: OrderStage;
  priority: Priority;
  createdAt: string;
  dueDate: string | null;
  totalItems: number;
  invoiceNumber: string | null;
  invoiceAmount: number | null;
  invoicePaid: boolean;
};

/** فترات جاهزة — والحقول تحت تسمح بأي مدى آخر يدويًا */
const PRESETS = [
  { days: 30, label: 'آخر ٣٠ يوم' },
  { days: 90, label: 'آخر ٣ شهور' },
  { days: 365, label: 'آخر سنة' },
  { days: 0, label: 'كل الوقت' },
] as const;

/** YYYY-MM-DD بالتوقيت المحلي — toISOString يرجع UTC فيزيح اليوم أحيانًا */
function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function rangeFor(days: number) {
  if (days === 0) return { from: '', to: '' };
  return { from: isoDay(new Date(Date.now() - days * 86_400_000)), to: isoDay(new Date()) };
}

function CustomerOrdersModal({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const [range, setRange] = useState(() => rangeFor(30));

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['customer-orders', customer?.id, range.from, range.to],
    queryFn: () =>
      apiGet<{
        orders: CustomerOrder[];
        total: number;
        totalInvoiced: number;
        orderNumberPrefix: string;
      }>(
        `/api/orders?${new URLSearchParams({
          customerId: customer!.id,
          take: '200',
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {}),
        })}`,
      ),
    enabled: customer !== null,
    // نبقي النتائج أثناء تغيير الفترة فقط — لا نعرض أوردرات عميل مكان عميل آخر
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === customer?.id ? previous : undefined,
  });

  const prefix = data?.orderNumberPrefix ?? '';
  const activePreset = PRESETS.find(
    (preset) => rangeFor(preset.days).from === range.from && rangeFor(preset.days).to === range.to,
  );

  return (
    <Modal
      open={customer !== null}
      onClose={onClose}
      title={customer ? `أوردرات ${customer.name}` : 'أوردرات العميل'}
      description="اختر الفترة لعرض أوردرات العميل خلالها"
      size="lg"
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          إغلاق
        </button>
      }
    >
      {/* اختيار الفترة */}
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="الفترة">
        {PRESETS.map((preset) => (
          <button
            key={preset.days}
            type="button"
            onClick={() => setRange(rangeFor(preset.days))}
            aria-pressed={activePreset?.days === preset.days}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
              activePreset?.days === preset.days
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <Field label="من تاريخ" htmlFor="orders-from">
          <input
            id="orders-from"
            type="date"
            className="input"
            value={range.from}
            max={range.to || undefined}
            onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
          />
        </Field>
        <Field label="إلى تاريخ" htmlFor="orders-to">
          <input
            id="orders-to"
            type="date"
            className="input"
            value={range.to}
            min={range.from || undefined}
            onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
          />
        </Field>
      </div>

      {/* ملخّص الفترة */}
      {data ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">عدد الأوردرات</p>
            <p className="num text-lg font-bold text-slate-900">{data.total}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">إجمالي الفواتير</p>
            <p className="num text-lg font-bold text-slate-900">
              {data.totalInvoiced.toLocaleString('en-US')}
            </p>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error instanceof Error ? error.message : 'تعذّر تحميل أوردرات العميل'}
        </p>
      ) : !data || data.orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="لا توجد أوردرات في هذه الفترة" />
      ) : (
        <ul className={cn('space-y-2', isFetching && 'opacity-60')}>
          {data.orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {prefix}
                    {order.number}
                  </span>
                  <span className="chip border-slate-200 bg-slate-50 text-slate-600">
                    {ORDER_STAGE_LABELS[order.stage]}
                  </span>
                  <span className={cn('chip', PRIORITY_STYLES[order.priority])}>
                    {PRIORITY_LABELS[order.priority]}
                  </span>
                  {order.invoiceAmount !== null ? (
                    <span
                      className={cn(
                        'chip ms-auto',
                        order.invoicePaid
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700',
                      )}
                    >
                      <span className="num">{order.invoiceAmount.toLocaleString('en-US')}</span>
                      {order.invoicePaid ? ' — محصّلة' : ' — غير محصّلة'}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>أُنشئ {formatDate(order.createdAt)}</span>
                  {order.dueDate ? <span>التسليم {formatDate(order.dueDate)}</span> : null}
                  <span>
                    <span className="num">{order.totalItems}</span> بند
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ─────────────────────────────── إضافة عميل ───────────────────────────────

function CreateCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/api/customers', {
        name: name.trim(),
        phone: phone.trim() || null,
        company: company.trim() || null,
      }),
    onSuccess: () => {
      toast.success('تمت إضافة العميل');
      setName('');
      setPhone('');
      setCompany('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="عميل جديد"
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={mutation.isPending || !name.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
            إضافة
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="اسم العميل" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="التليفون">
          <input
            className="input"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="الشركة">
          <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, Pencil, Phone, Plus, Search, Trash2, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/client';
import { cn, formatDate } from '@/lib/utils';
import {
  ORDER_STAGE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  type OrderStage,
  type Priority,
} from '@/lib/stages';
import { usePermissions } from '@/components/session';
import { ConfirmDialog, EmptyState, Field, Modal, PageLoader, Spinner } from '@/components/ui';

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  _count: { orders: number };
};

export function CustomersList() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const manage = can('customers.manage');

  const [search, setSearch] = useState('');
  /** null = مغلقة، 'new' = إضافة، وإلا العميل الجاري تعديله */
  const [form, setForm] = useState<Customer | 'new' | null>(null);
  const [ordersOf, setOrdersOf] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      apiGet<{ customers: Customer[] }>(
        `/api/customers${search ? `?q=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (customer: Customer) => apiDelete(`/api/customers/${customer.id}`),
    onSuccess: () => {
      toast.success('تم حذف العميل');
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      // أوردرات العميل المحذوف فقدت ارتباطها، فأي نتائج محفوظة لم تعد صحيحة
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setConfirmDelete(null);
    },
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900">العملاء</h1>
          <div className="flex-1" />
          {manage ? (
            <button type="button" className="btn-primary" onClick={() => setForm('new')}>
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

                <div className="flex shrink-0 items-center gap-1">
                  {can('orders.view') ? (
                    <button
                      type="button"
                      className="btn-secondary !py-1.5 !text-xs"
                      onClick={() => setOrdersOf(customer)}
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      أوردراته
                    </button>
                  ) : null}

                  {manage ? (
                    <>
                      <button
                        type="button"
                        className="btn-ghost h-8 w-8 !px-0 text-slate-400 hover:text-brand-700"
                        onClick={() => setForm(customer)}
                        aria-label={`تعديل ${customer.name}`}
                        title="تعديل"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost h-8 w-8 !px-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setConfirmDelete(customer)}
                        aria-label={`حذف ${customer.name}`}
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CustomerFormModal target={form} onClose={() => setForm(null)} />
      <CustomerOrdersModal customer={ordersOf} onClose={() => setOrdersOf(null)} />

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`حذف ${confirmDelete?.name ?? 'العميل'}`}
        message={
          confirmDelete && confirmDelete._count.orders > 0
            ? `سيُحذف سجل العميل نهائيًا. أوردراته الـ ${confirmDelete._count.orders} لن تُحذف ويبقى اسمه مكتوبًا عليها، لكنها ستفقد ارتباطها به فلن تظهر في "أوردراته" بعد الآن.`
            : 'سيُحذف سجل العميل نهائيًا. هل أنت متأكد؟'
        }
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
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

// ─────────────────────────── إضافة عميل أو تعديله ───────────────────────────

/**
 * نموذج واحد للحالتين: `target` يساوي 'new' للإضافة، أو العميل نفسه للتعديل.
 * الحقول تُملأ من العميل عند فتح النافذة عليه، وتُفرَّغ عند الإضافة — لذلك
 * نستعمل `key` على المكوّن الداخلي بدل مزامنة الحالة يدويًا بـ useEffect.
 */
function CustomerFormModal({
  target,
  onClose,
}: {
  target: Customer | 'new' | null;
  onClose: () => void;
}) {
  if (!target) return null;
  const editing = target === 'new' ? null : target;
  // الـ key يعيد بناء النموذج بحقول العميل الجديد بدل مزامنتها بـ useEffect
  return <CustomerFormDialog key={editing?.id ?? 'new'} customer={editing} onDone={onClose} />;
}

function CustomerFormDialog({
  customer,
  onDone,
}: {
  customer: Customer | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [company, setCompany] = useState(customer?.company ?? '');

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        phone: phone.trim() || null,
        company: company.trim() || null,
      };
      return customer
        ? apiPatch(`/api/customers/${customer.id}`, body)
        : apiPost('/api/customers', body);
    },
    onSuccess: () => {
      toast.success(customer ? 'تم حفظ بيانات العميل' : 'تمت إضافة العميل');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open
      onClose={() => {
        if (!mutation.isPending) onDone();
      }}
      title={customer ? `تعديل ${customer.name}` : 'عميل جديد'}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onDone}
            disabled={mutation.isPending}
          >
            إلغاء
          </button>
          <button
            type="submit"
            form="customer-form"
            className="btn-primary"
            disabled={mutation.isPending || !name.trim()}
          >
            {mutation.isPending ? (
              <Spinner />
            ) : customer ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {customer ? 'حفظ' : 'إضافة'}
          </button>
        </>
      }
    >
      <form
        id="customer-form"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return toast.error('اكتب اسم العميل');
          mutation.mutate();
        }}
      >
        <Field label="اسم العميل" required>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
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

        {customer ? (
          <p className="text-xs text-slate-500">
            تغيير الاسم هنا لا يغيّر اسم العميل المكتوب على أوردراته السابقة — كل أوردر يحتفظ
            بنسخة الاسم وقت إنشائه.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

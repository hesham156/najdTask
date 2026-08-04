'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock,
  Download,
  EyeOff,
  FileText,
  History,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Send,
  Trash2,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/client';
import { cn, formatBytes, formatDate, formatDateTime, timeAgo } from '@/lib/utils';
import {
  ITEM_OPTIONS,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_STYLES,
  ORDER_STAGE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  PRODUCTION_TYPES,
  PRODUCTION_TYPE_LABELS,
  consumptionShortLabel,
  itemOptionLabels,
  sanitizeItemOptions,
  type ItemStatus,
  type OrderStage,
  type Priority,
  type ProductionType,
} from '@/lib/stages';
import { usePermissions } from '@/components/session';
import { ConfirmDialog, Field, OptionPicker, PageLoader, Spinner } from '@/components/ui';

// ────────────────────────────────── الأنواع ──────────────────────────────────

type Person = { id: string; name: string };

type DetailItem = {
  id: string;
  productionType: ProductionType;
  title: string;
  quantity: number;
  specs: string | null;
  notes: string | null;
  options: string[];
  consumedQty: number | null;
  consumedUnit: string | null;
  status: ItemStatus;
  assignee: Person | null;
  completedAt: string | null;
  _count: { attachments: number };
};

type DetailAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  orderItemId: string | null;
  createdAt: string;
  uploadedBy: Person;
};

type DetailComment = {
  id: string;
  body: string;
  createdAt: string;
  orderItemId: string | null;
  user: Person;
};

type DetailActivity = {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
  user: Person;
};

type OrderDetailData = {
  order: {
    id: string;
    number: number;
    description: string | null;
    customerName: string;
    stage: OrderStage;
    priority: Priority;
    dueDate: string | null;
    createdAt: string;
    createdBy: Person;
    items: DetailItem[];
    attachments: DetailAttachment[];
    comments: DetailComment[];
    activities: DetailActivity[];
    totalItems: number;
    hiddenItems: number;
    invoiceNumber: string | null;
    invoiceAmount: number | null;
    invoicePaid: boolean;
    deliveryNoteNumber: string | null;
    receiverName: string | null;
  };
  orderNumberPrefix: string;
};

// ─────────────────────────────── المكوّن الرئيسي ───────────────────────────────

type DeleteTarget = { kind: 'order' | 'item' | 'file'; id: string };

export function OrderDetail({
  orderId,
  /** يُستدعى بعد حذف الأوردر — النافذة تمرّره لتغلق نفسها. بدونه نرجع لقائمة الأوردرات. */
  onDeleted,
}: {
  orderId: string;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { can, canSeeProductionType } = usePermissions();

  const { data, isLoading, error } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiGet<OrderDetailData>(`/api/orders/${orderId}`),
  });

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  }

  const itemStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ItemStatus }) =>
      apiPatch(`/api/items/${id}`, { status }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: ({ kind, id }: DeleteTarget) => {
      if (kind === 'item') return apiDelete(`/api/items/${id}`);
      if (kind === 'file') return apiDelete(`/api/files/${id}`);
      return apiDelete(`/api/orders/${id}`);
    },
    onSuccess: (_result, target) => {
      setConfirmDelete(null);

      if (target.kind === 'order') {
        toast.success('تم حذف الأوردر');
        // لا نحدّث استعلام أوردر لم يعد موجودًا — نسقطه ونغادر الشاشة
        queryClient.removeQueries({ queryKey: ['order', orderId] });
        queryClient.invalidateQueries({ queryKey: ['board'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        if (onDeleted) onDeleted();
        else router.push('/orders');
        return;
      }

      toast.success('تم الحذف');
      refresh();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirmDelete(null);
    },
  });

  if (isLoading) return <PageLoader label="جارٍ تحميل الأوردر..." />;
  if (error || !data) {
    return (
      <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {error instanceof Error ? error.message : 'تعذّر تحميل الأوردر'}
      </p>
    );
  }

  const { order, orderNumberPrefix } = data;
  const orderFiles = order.attachments.filter((a) => !a.orderItemId);

  return (
    <div className="space-y-5">
      {/* ── الترويسة ── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="num rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
              {orderNumberPrefix}
              {order.number}
            </span>
            <span className="chip border-slate-200 bg-slate-50 text-slate-600">
              {ORDER_STAGE_LABELS[order.stage]}
            </span>
            <span className={cn('chip', PRIORITY_STYLES[order.priority])}>
              {PRIORITY_LABELS[order.priority]}
            </span>
          </div>

          {/* لا عنوان للأوردر — اسم العميل هو ترويسته */}
          <h2 className="flex items-center gap-1.5 text-lg font-bold leading-tight text-slate-900">
            <User className="h-4 w-4 shrink-0 text-slate-400" />
            {order.customerName}
          </h2>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {order.dueDate ? (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                التسليم {formatDate(order.dueDate)}
              </span>
            ) : null}
            <span>أنشأه {order.createdBy.name}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {can('orders.edit') ? (
            <button type="button" className="btn-secondary" onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-4 w-4" />
              {editing ? 'إلغاء التعديل' : 'تعديل'}
            </button>
          ) : null}

          {can('orders.delete') ? (
            <button
              type="button"
              className="btn-ghost text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => setConfirmDelete({ kind: 'order', id: order.id })}
            >
              <Trash2 className="h-4 w-4" />
              حذف الأوردر
            </button>
          ) : null}
        </div>
      </header>

      {editing ? (
        <EditOrderForm order={order} onDone={() => { setEditing(false); refresh(); }} />
      ) : order.description ? (
        <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
          {order.description}
        </p>
      ) : null}

      {/* ── بنود الشغل ── */}
      <section>
        <SectionTitle
          icon={FileText}
          title="بنود الشغل"
          count={order.items.length}
          note={
            order.hiddenItems > 0
              ? `${order.hiddenItems} بند مخفي عنك (نوع شغل خارج صلاحيتك)`
              : undefined
          }
        />

        <div className="space-y-2">
          {order.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              attachments={order.attachments.filter((a) => a.orderItemId === item.id)}
              canChangeStatus={can('items.move')}
              canDelete={can('items.delete')}
              canDownload={can('files.download')}
              busy={itemStatus.isPending}
              onStatus={(status) => itemStatus.mutate({ id: item.id, status })}
              onDelete={() => setConfirmDelete({ kind: 'item', id: item.id })}
            />
          ))}

          {order.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
              {order.hiddenItems > 0
                ? 'كل بنود هذا الأوردر خارج نوع الشغل المسموح لك'
                : 'لا توجد بنود شغل — أضف بندًا قبل إرسال الأوردر للإنتاج'}
            </p>
          ) : null}
        </div>

        {can('items.create') ? <AddItemForm orderId={order.id} onAdded={refresh} /> : null}
      </section>

      {/* ── ملفات الأوردر ── */}
      <section>
        <SectionTitle icon={Paperclip} title="ملفات الأوردر" count={orderFiles.length} />

        <AttachmentList
          attachments={orderFiles}
          canDownload={can('files.download')}
          canDelete={can('files.delete')}
          onDelete={(id) => setConfirmDelete({ kind: 'file', id })}
        />

        {can('files.upload') ? (
          <Uploader orderId={order.id} onUploaded={refresh} />
        ) : null}
      </section>

      {/* ── الفاتورة وسند التسليم ── */}
      {can('invoice.manage') || order.invoiceNumber || order.deliveryNoteNumber ? (
        <InvoiceSection order={order} editable={can('invoice.manage')} onSaved={refresh} />
      ) : null}

      {/* ── التعليقات ── */}
      <section>
        <SectionTitle icon={FileText} title="التعليقات" count={order.comments.length} />
        <CommentsBlock
          orderId={order.id}
          comments={order.comments}
          canComment={can('comments.create')}
          onAdded={refresh}
        />
      </section>

      {/* ── سجل النشاط ── */}
      <section>
        <SectionTitle icon={History} title="سجل النشاط" count={order.activities.length} />
        <ol className="space-y-2 border-s-2 border-slate-100 ps-3">
          {order.activities.map((activity) => (
            <li key={activity.id} className="relative text-xs">
              <span className="absolute -start-[1.0625rem] top-1.5 h-2 w-2 rounded-full bg-slate-300" />
              <p className="text-slate-700">{activity.details ?? activity.action}</p>
              <p className="mt-0.5 text-slate-400">
                {activity.user.name} — {timeAgo(activity.createdAt)}
              </p>
            </li>
          ))}
          {order.activities.length === 0 ? (
            <li className="text-xs text-slate-400">لا يوجد نشاط بعد</li>
          ) : null}
        </ol>
      </section>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={
          confirmDelete?.kind === 'order'
            ? `حذف الأوردر ${orderNumberPrefix}${order.number}`
            : confirmDelete?.kind === 'item'
              ? 'حذف بند الشغل'
              : 'حذف الملف'
        }
        message={
          confirmDelete?.kind === 'order'
            ? `سيتم حذف أوردر ${order.customerName} وكل بنوده وملفاته وتعليقاته وسجل نشاطه نهائيًا. لا يمكن التراجع عن هذا الإجراء.`
            : confirmDelete?.kind === 'item'
              ? 'سيتم حذف البند وكل مرفقاته نهائيًا. هل أنت متأكد؟'
              : 'سيتم حذف الملف نهائيًا. هل أنت متأكد؟'
        }
        confirmLabel="حذف"
        loading={removeMutation.isPending}
        onConfirm={() => confirmDelete && removeMutation.mutate(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ─────────────────────────────── مكوّنات مساعدة ───────────────────────────────

function SectionTitle({
  icon: Icon,
  title,
  count,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  note?: string;
}) {
  return (
    <div className="mb-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Icon className="h-4 w-4 text-slate-400" />
        {title}
        {typeof count === 'number' ? (
          <span className="num rounded-full bg-slate-100 px-1.5 text-xs font-bold text-slate-500">
            {count}
          </span>
        ) : null}
      </h3>
      {note ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
          <EyeOff className="h-3 w-3" />
          {note}
        </p>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  attachments,
  canChangeStatus,
  canDelete,
  canDownload,
  busy,
  onStatus,
  onDelete,
}: {
  item: DetailItem;
  attachments: DetailAttachment[];
  canChangeStatus: boolean;
  canDelete: boolean;
  canDownload: boolean;
  busy: boolean;
  onStatus: (status: ItemStatus) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="chip border-slate-200 bg-slate-50 text-slate-700">
              {PRODUCTION_TYPE_LABELS[item.productionType]}
            </span>
            <span className={cn('chip', ITEM_STATUS_STYLES[item.status])}>
              {ITEM_STATUS_LABELS[item.status]}
            </span>
            {item.assignee ? (
              <span className="chip border-slate-200 bg-white text-slate-500">
                {item.assignee.name}
              </span>
            ) : null}
          </div>

          <p className="text-sm font-semibold text-slate-900">
            {item.title}
            <span className="num me-1 ms-2 text-xs font-normal text-slate-500">
              ×{item.quantity}
            </span>
            {item.consumedQty !== null ? (
              <span className="ms-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                استهلك <span className="num">{item.consumedQty}</span>{' '}
                {consumptionShortLabel(item.productionType, item.consumedUnit)}
              </span>
            ) : null}
          </p>

          {item.specs ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.specs}</p>
          ) : null}

          {itemOptionLabels(item.productionType, item.options).length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {itemOptionLabels(item.productionType, item.options).map((label) => (
                <span
                  key={label}
                  className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canChangeStatus && item.status !== 'in_progress' ? (
            <button
              type="button"
              className="btn-secondary !py-1.5 !text-xs"
              disabled={busy}
              onClick={() => onStatus('in_progress')}
            >
              {item.status === 'done' ? 'إعادة فتح' : 'ابدأ'}
            </button>
          ) : null}

          {canChangeStatus && item.status === 'in_progress' ? (
            <button
              type="button"
              className="btn !py-1.5 !text-xs bg-green-600 text-white hover:bg-green-700"
              disabled={busy}
              onClick={() => onStatus('done')}
            >
              <Check className="h-3 w-3" />
              خلص
            </button>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              className="btn-ghost h-8 w-8 !px-0 text-slate-400 hover:text-red-600"
              onClick={onDelete}
              aria-label="حذف البند"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {attachments.length > 0 && canDownload ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
          {attachments.map((file) => (
            <a
              key={file.id}
              href={`/api/files/${file.id}`}
              target="_blank"
              rel="noreferrer"
              className="chip border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
            >
              <Paperclip className="h-3 w-3" />
              {file.originalName}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AttachmentList({
  attachments,
  canDownload,
  canDelete,
  onDelete,
}: {
  attachments: DetailAttachment[];
  canDownload: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
        لا توجد ملفات مرفوعة
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {attachments.map((file) => (
        <li
          key={file.id}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-700">{file.originalName}</p>
            <p className="text-[11px] text-slate-400">
              <span className="num">{formatBytes(file.size)}</span> — {file.uploadedBy.name} —{' '}
              {timeAgo(file.createdAt)}
            </p>
          </div>

          {canDownload ? (
            <>
              <a
                href={`/api/files/${file.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost h-8 w-8 !px-0"
                aria-label={`فتح ${file.originalName}`}
                title="فتح"
              >
                <FileText className="h-4 w-4" />
              </a>
              <a
                href={`/api/files/${file.id}?download=1`}
                className="btn-ghost h-8 w-8 !px-0"
                aria-label={`تحميل ${file.originalName}`}
                title="تحميل"
              >
                <Download className="h-4 w-4" />
              </a>
            </>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              className="btn-ghost h-8 w-8 !px-0 text-slate-400 hover:text-red-600"
              onClick={() => onDelete(file.id)}
              aria-label={`حذف ${file.originalName}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Uploader({ orderId, onUploaded }: { orderId: string; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);

  async function upload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const form = new FormData();
    Array.from(fileList).forEach((file) => form.append('files', file));

    setUploading(true);
    try {
      await apiPost(`/api/orders/${orderId}/attachments`, form);
      toast.success('تم رفع الملفات');
      onUploaded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل رفع الملفات');
    } finally {
      setUploading(false);
    }
  }

  return (
    <label
      className={cn(
        'mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed',
        'border-slate-300 bg-white px-3 py-3 text-xs text-slate-500 transition-colors',
        'hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700',
      )}
    >
      {uploading ? <Spinner /> : <Plus className="h-4 w-4" />}
      {uploading ? 'جارٍ الرفع...' : 'أضف ملفات'}
      <input
        type="file"
        multiple
        className="hidden"
        disabled={uploading}
        onChange={(event) => {
          upload(event.target.files);
          event.target.value = '';
        }}
      />
    </label>
  );
}

function AddItemForm({ orderId, onAdded }: { orderId: string; onAdded: () => void }) {
  const { canSeeProductionType } = usePermissions();
  const types = PRODUCTION_TYPES.filter((type) => canSeeProductionType(type));

  const [open, setOpen] = useState(false);
  const [productionType, setProductionType] = useState<ProductionType>(types[0] ?? 'digital');
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [specs, setSpecs] = useState('');
  const [options, setOptions] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/orders/${orderId}/items`, {
        productionType,
        title: title.trim(),
        quantity,
        specs: specs.trim() || null,
        options,
      }),
    onSuccess: () => {
      toast.success('تمت إضافة البند');
      setTitle('');
      setQuantity(1);
      setSpecs('');
      setOptions([]);
      setOpen(false);
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (types.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="btn-secondary mt-2 !text-xs" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        أضف بند شغل
      </button>
    );
  }

  return (
    <form
      className="mt-2 space-y-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return toast.error('اكتب اسم البند');
        mutation.mutate();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[7rem_1fr_5.5rem]">
        <select
          className="input !py-1.5 text-xs"
          value={productionType}
          onChange={(e) => {
            const next = e.target.value as ProductionType;
            setProductionType(next);
            setOptions((prev) => sanitizeItemOptions(next, prev));
          }}
          aria-label="نوع الشغل"
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {PRODUCTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <input
          className="input !py-1.5 text-xs"
          placeholder="اسم البند"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="اسم البند"
        />
        <input
          type="number"
          min={1}
          className="input !py-1.5 text-xs"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 1)}
          aria-label="الكمية"
        />
      </div>

      <input
        className="input !py-1.5 text-xs"
        placeholder="المواصفات"
        value={specs}
        onChange={(e) => setSpecs(e.target.value)}
        aria-label="المواصفات"
      />

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-slate-500">
          خيارات {PRODUCTION_TYPE_LABELS[productionType]}
        </p>
        <OptionPicker
          options={ITEM_OPTIONS[productionType] ?? []}
          selected={options}
          onChange={setOptions}
          disabled={mutation.isPending}
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary !py-1.5 !text-xs" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
          إضافة
        </button>
        <button
          type="button"
          className="btn-ghost !py-1.5 !text-xs"
          onClick={() => setOpen(false)}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}

function EditOrderForm({
  order,
  onDone,
}: {
  order: OrderDetailData['order'];
  onDone: () => void;
}) {
  const [customerName, setCustomerName] = useState(order.customerName);
  const [description, setDescription] = useState(order.description ?? '');
  const [priority, setPriority] = useState<Priority>(order.priority);
  const [dueDate, setDueDate] = useState(order.dueDate ? order.dueDate.slice(0, 10) : '');

  const mutation = useMutation({
    mutationFn: () =>
      apiPatch(`/api/orders/${order.id}`, {
        customerName: customerName.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
      }),
    onSuccess: () => {
      toast.success('تم حفظ التعديلات');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Field label="اسم العميل">
        <input
          className="input"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
      </Field>

      <Field label="الأولوية">
        <select
          className="input"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="تاريخ التسليم">
        <input
          type="date"
          className="input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>

      <Field label="التفاصيل" className="sm:col-span-2">
        <textarea
          className="input min-h-[72px] resize-y"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : <Check className="h-4 w-4" />}
          حفظ التعديلات
        </button>
      </div>
    </form>
  );
}

function InvoiceSection({
  order,
  editable,
  onSaved,
}: {
  order: OrderDetailData['order'];
  editable: boolean;
  onSaved: () => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState(order.invoiceNumber ?? '');
  const [invoiceAmount, setInvoiceAmount] = useState(order.invoiceAmount?.toString() ?? '');
  const [invoicePaid, setInvoicePaid] = useState(order.invoicePaid);
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState(order.deliveryNoteNumber ?? '');
  const [receiverName, setReceiverName] = useState(order.receiverName ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      apiPatch(`/api/orders/${order.id}`, {
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceAmount: invoiceAmount ? Number(invoiceAmount) : null,
        invoicePaid,
        deliveryNoteNumber: deliveryNoteNumber.trim() || null,
        receiverName: receiverName.trim() || null,
      }),
    onSuccess: () => {
      toast.success('تم حفظ بيانات الفاتورة');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!editable) {
    return (
      <section>
        <SectionTitle icon={Receipt} title="الفاتورة وسند التسليم" />
        <dl className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">رقم الفاتورة</dt>
            <dd className="num font-semibold text-slate-800">{order.invoiceNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">سند التسليم</dt>
            <dd className="num font-semibold text-slate-800">
              {order.deliveryNoteNumber ?? '—'}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle icon={Receipt} title="الفاتورة وسند التسليم" />
      <form
        className="grid gap-3 rounded-xl border border-rose-200 bg-rose-50/40 p-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="رقم الفاتورة">
          <input
            className="input"
            dir="ltr"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </Field>

        <Field label="قيمة الفاتورة">
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            dir="ltr"
            value={invoiceAmount}
            onChange={(e) => setInvoiceAmount(e.target.value)}
          />
        </Field>

        <Field label="رقم سند التسليم">
          <input
            className="input"
            dir="ltr"
            value={deliveryNoteNumber}
            onChange={(e) => setDeliveryNoteNumber(e.target.value)}
          />
        </Field>

        <Field label="اسم المستلم">
          <input
            className="input"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={invoicePaid}
            onChange={(e) => setInvoicePaid(e.target.checked)}
          />
          تم تحصيل قيمة الفاتورة
        </label>

        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : <Receipt className="h-4 w-4" />}
            حفظ بيانات الفاتورة
          </button>
        </div>
      </form>
    </section>
  );
}

function CommentsBlock({
  orderId,
  comments,
  canComment,
  onAdded,
}: {
  orderId: string;
  comments: DetailComment[];
  canComment: boolean;
  onAdded: () => void;
}) {
  const [body, setBody] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/orders/${orderId}/comments`, { body: body.trim() }),
    onSuccess: () => {
      setBody('');
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      {comments.map((comment) => (
        <div key={comment.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-600">{comment.user.name}</span>
            <span>{formatDateTime(comment.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {comment.body}
          </p>
        </div>
      ))}

      {comments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500">
          لا توجد تعليقات
        </p>
      ) : null}

      {canComment ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            mutation.mutate();
          }}
        >
          <input
            className="input"
            placeholder="اكتب ملاحظة للفريق..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary shrink-0 !px-3"
            disabled={mutation.isPending || !body.trim()}
            aria-label="إرسال"
          >
            {mutation.isPending ? <Spinner /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      ) : null}
    </div>
  );
}

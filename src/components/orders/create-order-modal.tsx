'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiGet, apiPost } from '@/lib/client';
import { cn, formatBytes } from '@/lib/utils';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  PRODUCTION_TYPES,
  PRODUCTION_TYPE_LABELS,
  type Priority,
  type ProductionType,
} from '@/lib/stages';
import { usePermissions } from '@/components/session';
import { Field, Modal, Spinner } from '@/components/ui';

type DraftItem = {
  uid: string;
  productionType: ProductionType;
  title: string;
  quantity: number;
  specs: string;
};

const newItem = (productionType: ProductionType): DraftItem => ({
  uid: Math.random().toString(36).slice(2),
  productionType,
  title: '',
  quantity: 1,
  specs: '',
});

export function CreateOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { can, canSeeProductionType } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableTypes = PRODUCTION_TYPES.filter((type) => canSeeProductionType(type));
  const defaultType = availableTypes[0] ?? 'digital';

  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const { data: customersData } = useQuery({
    queryKey: ['customers', 'options'],
    queryFn: () => apiGet<{ customers: { id: string; name: string; phone: string | null }[] }>(
      '/api/customers',
    ),
    enabled: open,
  });

  function reset() {
    setTitle('');
    setCustomerName('');
    setCustomerPhone('');
    setDescription('');
    setPriority('normal');
    setDueDate('');
    setItems([]);
    setFiles([]);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || null,
        priority,
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
        items: items
          .filter((item) => item.title.trim())
          .map((item) => ({
            productionType: item.productionType,
            title: item.title.trim(),
            quantity: item.quantity,
            specs: item.specs.trim() || null,
          })),
      };

      const { order } = await apiPost<{ order: { id: string; number: number } }>(
        '/api/orders',
        payload,
      );

      // المرفقات تُرفع بعد إنشاء الأوردر لأنها تحتاج معرّفه
      if (files.length > 0 && can('files.upload')) {
        const form = new FormData();
        files.forEach((file) => form.append('files', file));
        try {
          await apiPost(`/api/orders/${order.id}/attachments`, form);
        } catch (error) {
          toast.error(
            `تم حفظ الأوردر رقم ${order.number} لكن فشل رفع الملفات: ${
              error instanceof Error ? error.message : ''
            }`,
          );
        }
      }

      return order;
    },
    onSuccess: (order) => {
      toast.success(`تم إنشاء الأوردر رقم ${order.number}`);
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      reset();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return toast.error('اكتب عنوان الأوردر');
    if (!customerName.trim()) return toast.error('اكتب اسم العميل');
    const named = items.filter((item) => item.title.trim());
    if (items.length > 0 && named.length === 0) {
      return toast.error('اكتب اسم بند الشغل أو احذف البند الفارغ');
    }
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      title="أوردر جديد"
      description="رقم الأوردر يُعطى تلقائيًا حسب التسلسل المحدد في الإعدادات"
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            إلغاء
          </button>
          <button
            type="submit"
            form="create-order-form"
            className="btn-primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
            حفظ الأوردر
          </button>
        </>
      }
    >
      <form id="create-order-form" onSubmit={submit} className="space-y-5">
        {/* بيانات أساسية */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان الأوردر" htmlFor="order-title" required className="sm:col-span-2">
            <input
              id="order-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مطبوعات افتتاح الفرع الجديد"
              required
            />
          </Field>

          <Field label="اسم العميل" htmlFor="customer-name" required>
            <input
              id="customer-name"
              className="input"
              list="customers-list"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                const match = customersData?.customers.find((c) => c.name === e.target.value);
                if (match?.phone) setCustomerPhone(match.phone);
              }}
              placeholder="اكتب أو اختر من العملاء السابقين"
              required
            />
            <datalist id="customers-list">
              {customersData?.customers.map((customer) => (
                <option key={customer.id} value={customer.name} />
              ))}
            </datalist>
          </Field>

          <Field label="تليفون العميل" htmlFor="customer-phone">
            <input
              id="customer-phone"
              className="input"
              dir="ltr"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
            />
          </Field>

          <Field label="الأولوية" htmlFor="priority">
            <select
              id="priority"
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

          <Field label="تاريخ التسليم" htmlFor="due-date">
            <input
              id="due-date"
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>

          <Field label="تفاصيل الأوردر" htmlFor="description" className="sm:col-span-2">
            <textarea
              id="description"
              className="input min-h-[72px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="أي ملاحظات أو تفاصيل يحتاجها فريق الشغل"
            />
          </Field>
        </div>

        {/* بنود الشغل */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">بنود الشغل</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                قسّم الأوردر حسب نوع الشغل. كل بند يظهر لعامله فقط في عموده.
              </p>
            </div>
          </div>

          {items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.uid} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="grid gap-2 sm:grid-cols-[7rem_1fr_5.5rem_auto]">
                    <select
                      className="input !py-1.5 text-xs"
                      value={item.productionType}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, i) =>
                            i === index
                              ? { ...it, productionType: e.target.value as ProductionType }
                              : it,
                          ),
                        )
                      }
                      aria-label="نوع الشغل"
                    >
                      {availableTypes.map((type) => (
                        <option key={type} value={type}>
                          {PRODUCTION_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>

                    <input
                      className="input !py-1.5 text-xs"
                      placeholder="اسم البند (مثال: كروت شخصية)"
                      value={item.title}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, i) => (i === index ? { ...it, title: e.target.value } : it)),
                        )
                      }
                      aria-label="اسم البند"
                    />

                    <input
                      type="number"
                      min={1}
                      className="input !py-1.5 text-xs"
                      placeholder="الكمية"
                      value={item.quantity}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, i) =>
                            i === index ? { ...it, quantity: Number(e.target.value) || 1 } : it,
                          ),
                        )
                      }
                      aria-label="الكمية"
                    />

                    <button
                      type="button"
                      className="btn-ghost h-9 w-9 !px-0 text-slate-400 hover:text-red-600"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="حذف البند"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <input
                    className="input mt-2 !py-1.5 text-xs"
                    placeholder="المواصفات: المقاس، نوع الورق، الألوان، التشطيب..."
                    value={item.specs}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, i) => (i === index ? { ...it, specs: e.target.value } : it)),
                      )
                    }
                    aria-label="المواصفات"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
              لم تضف بنودًا بعد — تقدر تضيفها الآن أو لاحقًا قبل إرسال الأوردر للإنتاج
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {availableTypes.map((type) => (
              <button
                key={type}
                type="button"
                className="btn-secondary !py-1.5 !text-xs"
                onClick={() => setItems((prev) => [...prev, newItem(type)])}
              >
                <Plus className="h-3 w-3" />
                {PRODUCTION_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </section>

        {/* المرفقات */}
        {can('files.upload') ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">ملفات الأوردر</h3>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                setFiles((prev) => [...prev, ...picked]);
                event.target.value = '';
              }}
            />

            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed',
                'border-slate-300 bg-white px-4 py-5 text-sm text-slate-500 transition-colors',
                'hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700',
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
              اختر ملفات التصميم أو صور المطلوب
            </button>

            {files.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="num shrink-0 text-slate-400">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      className="shrink-0 text-slate-400 hover:text-red-600"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`حذف ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </form>
    </Modal>
  );
}

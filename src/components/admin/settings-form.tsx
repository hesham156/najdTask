'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Hash, Save } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiGet, apiPatch } from '@/lib/client';
import { Field, PageLoader, Spinner } from '@/components/ui';

type SettingsData = {
  settings: {
    companyName: string;
    companyPhone: string | null;
    companyAddress: string | null;
    currency: string;
    orderNumberPrefix: string;
    orderNumberStart: number;
    nextOrderNumber: number;
  };
  lastOrderNumber: number | null;
};

export function SettingsForm() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<SettingsData>('/api/settings'),
  });

  const [form, setForm] = useState({
    companyName: '',
    companyPhone: '',
    companyAddress: '',
    currency: '',
    orderNumberPrefix: '',
    orderNumberStart: 1,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      companyName: data.settings.companyName,
      companyPhone: data.settings.companyPhone ?? '',
      companyAddress: data.settings.companyAddress ?? '',
      currency: data.settings.currency,
      orderNumberPrefix: data.settings.orderNumberPrefix,
      orderNumberStart: data.settings.orderNumberStart,
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      apiPatch('/api/settings', {
        companyName: form.companyName.trim(),
        companyPhone: form.companyPhone.trim() || null,
        companyAddress: form.companyAddress.trim() || null,
        currency: form.currency.trim(),
        orderNumberPrefix: form.orderNumberPrefix.trim(),
        orderNumberStart: form.orderNumberStart,
      }),
    onSuccess: () => {
      toast.success('تم حفظ الإعدادات');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) return <PageLoader />;

  const minStart = data.lastOrderNumber ? data.lastOrderNumber + 1 : 1;
  const nextNumber =
    form.orderNumberStart !== data.settings.orderNumberStart
      ? form.orderNumberStart
      : data.settings.nextOrderNumber;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <h1 className="mb-4 text-lg font-bold text-slate-900">الإعدادات</h1>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {/* ترقيم الأوردرات */}
          <section className="card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Hash className="h-4 w-4 text-slate-400" />
              ترقيم الأوردرات
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              كل أوردر جديد يأخذ الرقم التالي تلقائيًا. لو عندك ترقيم قديم عايز تكمّل عليه، غيّر
              رقم البداية.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="بادئة الرقم" hint="اختياري — مثال: NJ- يجعل الرقم NJ-1024">
                <input
                  className="input"
                  dir="ltr"
                  value={form.orderNumberPrefix}
                  onChange={(e) => setForm({ ...form, orderNumberPrefix: e.target.value })}
                  placeholder="بدون بادئة"
                />
              </Field>

              <Field
                label="يبدأ الترقيم من"
                hint={
                  data.lastOrderNumber
                    ? `آخر أوردر رقمه ${data.lastOrderNumber}، فأقل رقم مسموح هو ${minStart}`
                    : 'لا توجد أوردرات بعد، تقدر تبدأ من أي رقم'
                }
              >
                <input
                  type="number"
                  min={minStart}
                  className="input"
                  dir="ltr"
                  value={form.orderNumberStart}
                  onChange={(e) =>
                    setForm({ ...form, orderNumberStart: Number(e.target.value) || 1 })
                  }
                />
              </Field>
            </div>

            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
              الأوردر القادم هيأخذ الرقم{' '}
              <span className="num font-bold">
                {form.orderNumberPrefix}
                {nextNumber}
              </span>
            </p>
          </section>

          {/* بيانات المطبعة */}
          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Building2 className="h-4 w-4 text-slate-400" />
              بيانات المطبعة
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم المطبعة" required className="sm:col-span-2">
                <input
                  className="input"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </Field>

              <Field label="التليفون">
                <input
                  className="input"
                  dir="ltr"
                  value={form.companyPhone}
                  onChange={(e) => setForm({ ...form, companyPhone: e.target.value })}
                />
              </Field>

              <Field label="العملة">
                <input
                  className="input"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  placeholder="ج.م"
                />
              </Field>

              <Field label="العنوان" className="sm:col-span-2">
                <input
                  className="input"
                  value={form.companyAddress}
                  onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
                />
              </Field>
            </div>
          </section>

          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : <Save className="h-4 w-4" />}
            حفظ الإعدادات
          </button>
        </form>
      </div>
    </div>
  );
}

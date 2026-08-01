'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Plus, Search, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiGet, apiPost } from '@/lib/client';
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
              <div key={customer.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                {customer.company ? (
                  <p className="text-xs text-slate-500">{customer.company}</p>
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
            ))}
          </div>
        )}
      </div>

      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

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

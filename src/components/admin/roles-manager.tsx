'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Columns3, Layers, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/client';
import { cn } from '@/lib/utils';
import { PRODUCTION_TYPE_LABELS, type ProductionType } from '@/lib/stages';
import { ConfirmDialog, Field, Modal, PageLoader, Spinner } from '@/components/ui';

type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isAdmin: boolean;
  isSystem: boolean;
  permissions: string[];
  visibleStages: string[];
  productionTypes: string[];
  usersCount: number;
};

type Catalog = {
  groups: { key: string; label: string; permissions: { key: string; label: string; description?: string }[] }[];
  columns: { key: string; label: string; kind: 'order' | 'item'; productionType: string | null }[];
  productionTypes: readonly string[];
};

export function RolesManager() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  // النسخة المحلية القابلة للتعديل قبل الحفظ
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    permissions: string[];
    visibleStages: string[];
    productionTypes: string[];
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => apiGet<{ roles: Role[]; catalog: Catalog }>('/api/roles'),
  });

  const roles = data?.roles ?? [];
  const catalog = data?.catalog;

  const selected = useMemo(
    () => roles.find((role) => role.id === selectedId) ?? roles[0] ?? null,
    [roles, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft({
      name: selected.name,
      description: selected.description ?? '',
      permissions: [...selected.permissions],
      visibleStages: [...selected.visibleStages],
      productionTypes: [...selected.productionTypes],
    });
  }, [selected?.id, selected]);

  const saveMutation = useMutation({
    mutationFn: () => apiPatch(`/api/roles/${selected!.id}`, draft),
    onSuccess: () => {
      toast.success('تم حفظ الصلاحيات');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/roles/${id}`),
    onSuccess: () => {
      toast.success('تم حذف الدور');
      setDeleteTarget(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setDeleteTarget(null);
    },
  });

  if (isLoading || !catalog) return <PageLoader />;

  const locked = selected?.isAdmin ?? false;

  function toggle(list: 'permissions' | 'visibleStages' | 'productionTypes', value: string) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            [list]: prev[list].includes(value)
              ? prev[list].filter((v) => v !== value)
              : [...prev[list], value],
          }
        : prev,
    );
  }

  function toggleGroup(keys: string[], on: boolean) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            permissions: on
              ? [...new Set([...prev.permissions, ...keys])]
              : prev.permissions.filter((p) => !keys.includes(p)),
          }
        : prev,
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">الأدوار والصلاحيات</h1>
            <p className="text-xs text-slate-500">
              حدد لكل دور ما يقدر يعمله، وأي أعمدة يشوفها، وأي نوع شغل يخصّه
            </p>
          </div>
          <div className="flex-1" />
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            دور جديد
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          {/* قائمة الأدوار */}
          <aside className="space-y-1.5">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedId(role.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-start transition-colors',
                  selected?.id === role.id
                    ? 'border-brand-300 bg-brand-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <ShieldCheck
                  className={cn(
                    'h-4 w-4 shrink-0',
                    role.isAdmin ? 'text-brand-600' : 'text-slate-400',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {role.name}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    <span className="num">{role.usersCount}</span> مستخدم
                    {role.isAdmin ? ' — كل الصلاحيات' : ` — ${role.permissions.length} صلاحية`}
                  </span>
                </span>
              </button>
            ))}
          </aside>

          {/* محرر الدور */}
          {selected && draft ? (
            <div className="space-y-4">
              <section className="card p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="اسم الدور">
                    <input
                      className="input"
                      value={draft.name}
                      disabled={selected.isSystem}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </Field>
                  <Field label="الوصف">
                    <input
                      className="input"
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    />
                  </Field>
                </div>

                {locked ? (
                  <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                    دور مدير النظام يملك كل الصلاحيات دائمًا ولا يمكن تقييده — وهذا مقصود حتى لا
                    يُقفل النظام على الجميع بالخطأ.
                  </p>
                ) : null}
              </section>

              {!locked ? (
                <>
                  {/* الأفعال */}
                  <section className="card p-4">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Check className="h-4 w-4 text-slate-400" />
                      ما الذي يقدر هذا الدور على فعله؟
                    </h2>

                    <div className="space-y-4">
                      {catalog.groups.map((group) => {
                        const keys = group.permissions.map((p) => p.key);
                        const allOn = keys.every((k) => draft.permissions.includes(k));
                        return (
                          <div key={group.key}>
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                {group.label}
                              </h3>
                              <button
                                type="button"
                                className="text-[11px] font-medium text-brand-600 hover:underline"
                                onClick={() => toggleGroup(keys, !allOn)}
                              >
                                {allOn ? 'إلغاء الكل' : 'تحديد الكل'}
                              </button>
                            </div>

                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {group.permissions.map((permission) => (
                                <label
                                  key={permission.key}
                                  className={cn(
                                    'flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors',
                                    draft.permissions.includes(permission.key)
                                      ? 'border-brand-200 bg-brand-50/60'
                                      : 'border-slate-200 bg-white hover:bg-slate-50',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                                    checked={draft.permissions.includes(permission.key)}
                                    onChange={() => toggle('permissions', permission.key)}
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-slate-800">{permission.label}</span>
                                    {permission.description ? (
                                      <span className="block text-[11px] text-slate-500">
                                        {permission.description}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* الأعمدة */}
                  <section className="card p-4">
                    <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Columns3 className="h-4 w-4 text-slate-400" />
                      أي أعمدة يشوفها في اللوحة؟
                    </h2>
                    <p className="mb-3 text-xs text-slate-500">
                      العمود غير المحدد لا يظهر له أصلًا، ولا تصل بياناته إلى جهازه.
                    </p>

                    <div className="grid gap-1.5 sm:grid-cols-3">
                      {catalog.columns.map((column) => (
                        <label
                          key={column.key}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors',
                            draft.visibleStages.includes(column.key)
                              ? 'border-brand-200 bg-brand-50/60'
                              : 'border-slate-200 bg-white hover:bg-slate-50',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-slate-300"
                            checked={draft.visibleStages.includes(column.key)}
                            onChange={() => toggle('visibleStages', column.key)}
                          />
                          <span className="min-w-0 truncate text-slate-800">{column.label}</span>
                          {column.kind === 'item' ? (
                            <span className="chip shrink-0 border-slate-200 bg-white text-[10px] text-slate-400">
                              إنتاج
                            </span>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </section>

                  {/* أنواع الإنتاج */}
                  <section className="card p-4">
                    <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Layers className="h-4 w-4 text-slate-400" />
                      أي نوع شغل يخصّه؟
                    </h2>
                    <p className="mb-3 text-xs text-slate-500">
                      دي أهم إعداد للعمال: لو حددت الأوفست فقط، صاحب الدور ده هيشوف بنود الأوفست
                      بس — حتى لو الأوردر فيه شغل ديجيتال واندور.
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {catalog.productionTypes.map((type) => (
                        <label
                          key={type}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                            draft.productionTypes.includes(type)
                              ? 'border-brand-200 bg-brand-50/60'
                              : 'border-slate-200 bg-white hover:bg-slate-50',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={draft.productionTypes.includes(type)}
                            onChange={() => toggle('productionTypes', type)}
                          />
                          {PRODUCTION_TYPE_LABELS[type as ProductionType]}
                        </label>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || locked}
                >
                  {saveMutation.isPending ? <Spinner /> : <Save className="h-4 w-4" />}
                  حفظ التغييرات
                </button>

                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  <span className="num">{selected.usersCount}</span> مستخدم بهذا الدور
                </span>

                <div className="flex-1" />

                {!selected.isSystem ? (
                  <button
                    type="button"
                    className="btn-ghost text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteTarget(selected)}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف الدور
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <CreateRoleModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف الدور"
        message={`سيتم حذف دور "${deleteTarget?.name}" نهائيًا. هل أنت متأكد؟`}
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function CreateRoleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/api/roles', {
        name: name.trim(),
        description: description.trim() || null,
        permissions: ['orders.view'],
        visibleStages: [],
        productionTypes: [],
      }),
    onSuccess: () => {
      toast.success('تم إنشاء الدور — حدد صلاحياته الآن');
      setName('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="دور جديد"
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
            إنشاء
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="اسم الدور" required>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: عامل تشطيب"
          />
        </Field>
        <Field label="الوصف">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف مختصر لمهام هذا الدور"
          />
        </Field>
      </div>
    </Modal>
  );
}

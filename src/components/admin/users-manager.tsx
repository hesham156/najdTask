'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiGet, apiPatch, apiPost } from '@/lib/client';
import { cn, formatDate, initials } from '@/lib/utils';
import { Field, Modal, PageLoader, Spinner } from '@/components/ui';
import { useSession } from '@/components/session';

type ManagedUser = {
  id: string;
  name: string;
  username: string;
  phone?: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
  role: { id: string; key: string; name: string; isAdmin: boolean };
};

type RoleOption = { id: string; name: string; isAdmin: boolean };

export function UsersManager() {
  const queryClient = useQueryClient();
  const me = useSession();
  const [formUser, setFormUser] = useState<ManagedUser | 'new' | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<{ users: ManagedUser[] }>('/api/users'),
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => apiGet<{ roles: RoleOption[] }>('/api/roles'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch(`/api/users/${id}`, { isActive }),
    onSuccess: () => {
      toast.success('تم تحديث الحساب');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <PageLoader />;

  const users = data?.users ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">المستخدمون</h1>
            <p className="text-xs text-slate-500">
              <span className="num">{users.length}</span> حساب في النظام
            </p>
          </div>
          <div className="flex-1" />
          <button type="button" className="btn-primary" onClick={() => setFormUser('new')}>
            <Plus className="h-4 w-4" />
            مستخدم جديد
          </button>
        </header>

        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3',
                user.isActive === false ? 'border-slate-200 opacity-60' : 'border-slate-200',
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {initials(user.name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {user.name}
                  {user.id === me.id ? (
                    <span className="ms-2 text-[11px] font-normal text-slate-400">(أنت)</span>
                  ) : null}
                </p>
                <p className="num text-xs text-slate-500" dir="ltr">
                  {user.username}
                </p>
              </div>

              <div className="text-xs text-slate-600">
                <span className="chip border-slate-200 bg-slate-50">{user.role.name}</span>
              </div>

              {user.lastLoginAt !== undefined ? (
                <p className="hidden text-[11px] text-slate-400 sm:block">
                  آخر دخول {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'لم يدخل بعد'}
                </p>
              ) : null}

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="btn-ghost h-8 w-8 !px-0"
                  onClick={() => setFormUser(user)}
                  aria-label={`تعديل ${user.name}`}
                  title="تعديل"
                >
                  <Pencil className="h-4 w-4" />
                </button>

                {user.id !== me.id ? (
                  <button
                    type="button"
                    className={cn(
                      'btn-ghost h-8 w-8 !px-0',
                      user.isActive ? 'text-slate-400 hover:text-red-600' : 'text-green-600',
                    )}
                    disabled={toggleActive.isPending}
                    onClick={() =>
                      toggleActive.mutate({ id: user.id, isActive: !user.isActive })
                    }
                    aria-label={user.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                    title={user.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                  >
                    {user.isActive ? (
                      <UserX className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <UserFormModal
        target={formUser}
        roles={rolesData?.roles ?? []}
        onClose={() => setFormUser(null)}
      />
    </div>
  );
}

function UserFormModal({
  target,
  roles,
  onClose,
}: {
  target: ManagedUser | 'new' | null;
  roles: RoleOption[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = target === 'new';
  const user = target && target !== 'new' ? target : null;

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');

  // إعادة تعبئة النموذج عند تغيير المستخدم المستهدف
  const key = target === 'new' ? 'new' : (user?.id ?? '');
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (target && loadedKey !== key) {
    setLoadedKey(key);
    setName(user?.name ?? '');
    setUsername(user?.username ?? '');
    setPhone(user?.phone ?? '');
    setRoleId(user?.role.id ?? roles[0]?.id ?? '');
    setPassword('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      isNew
        ? apiPost('/api/users', {
            name: name.trim(),
            username: username.trim().toLowerCase(),
            phone: phone.trim() || null,
            roleId,
            password,
          })
        : apiPatch(`/api/users/${user!.id}`, {
            name: name.trim(),
            phone: phone.trim() || null,
            roleId,
            ...(password ? { password } : {}),
          }),
    onSuccess: () => {
      toast.success(isNew ? 'تم إنشاء المستخدم' : 'تم حفظ التعديلات');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={isNew ? 'مستخدم جديد' : `تعديل ${user?.name ?? ''}`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="submit"
            form="user-form"
            className="btn-primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
            {isNew ? 'إنشاء' : 'حفظ'}
          </button>
        </>
      }
    >
      <form
        id="user-form"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return toast.error('اكتب اسم الموظف');
          if (isNew && !username.trim()) return toast.error('اكتب اسم المستخدم');
          if (isNew && password.length < 6) return toast.error('كلمة المرور 6 أحرف على الأقل');
          if (!roleId) return toast.error('اختر الدور');
          mutation.mutate();
        }}
      >
        <Field label="اسم الموظف" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field
          label="اسم المستخدم"
          required={isNew}
          hint={isNew ? 'بحروف إنجليزية وأرقام فقط' : 'لا يمكن تغيير اسم المستخدم بعد الإنشاء'}
        >
          <input
            className="input"
            dir="ltr"
            value={username}
            disabled={!isNew}
            onChange={(e) => setUsername(e.target.value)}
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

        <Field label="الدور" required>
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={isNew ? 'كلمة المرور' : 'كلمة مرور جديدة'}
          required={isNew}
          hint={isNew ? '6 أحرف على الأقل' : 'اتركها فارغة لو مش عايز تغيّرها'}
        >
          <div className="relative">
            <KeyRound className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" />
            <input
              type="text"
              className="input ps-9"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </Field>
      </form>
    </Modal>
  );
}

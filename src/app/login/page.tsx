import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/orders';
import { LoginForm } from '@/components/login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/board');

  const settings = await getSettings();

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-bl from-brand-50 via-surface to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lift">
            ن
          </span>
          <h1 className="text-xl font-bold text-slate-900">{settings.companyName}</h1>
          <p className="mt-1 text-sm text-slate-500">نظام متابعة الأوردرات</p>
        </div>

        <div className="card p-5">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          لو نسيت بياناتك راجع مدير النظام
        </p>
      </div>
    </main>
  );
}

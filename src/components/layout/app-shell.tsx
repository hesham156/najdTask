'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  ClipboardList,
  KanbanSquare,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiPost } from '@/lib/client';
import { cn, initials } from '@/lib/utils';
import { usePermissions } from '@/components/session';
import { InstallPrompt } from '@/components/install-prompt';
import { NotificationsToggle } from '@/components/notifications-toggle';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
};

const NAV: NavItem[] = [
  { href: '/board', label: 'لوحة الشغل', icon: KanbanSquare, permission: 'orders.view' },
  { href: '/orders', label: 'كل الأوردرات', icon: ClipboardList, permission: 'orders.view' },
  { href: '/customers', label: 'العملاء', icon: UsersRound, permission: 'customers.view' },
  { href: '/reports', label: 'التقارير', icon: BarChart3, permission: 'reports.view' },
  { href: '/users', label: 'المستخدمون', icon: Users, permission: 'users.manage' },
  { href: '/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck, permission: 'roles.manage' },
  { href: '/settings', label: 'الإعدادات', icon: Settings, permission: 'settings.manage' },
];

export function AppShell({
  companyName,
  children,
}: {
  companyName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, can } = usePermissions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // إغلاق القائمة الجانبية عند التنقل على الموبايل
  useEffect(() => setMenuOpen(false), [pathname]);

  const items = NAV.filter((item) => !item.permission || can(item.permission));

  async function logout() {
    setLoggingOut(true);
    try {
      await apiPost('/api/auth/logout');
      router.replace('/login');
      router.refresh();
    } catch {
      toast.error('تعذّر تسجيل الخروج');
      setLoggingOut(false);
    }
  }

  return (
    // contain:paint يجعل هذه القشرة الكتلةَ الحاوية للقائمة الجانبية الثابتة،
    // فيقصّها overflow-hidden أعلاه بدل أن تقف خارج الشاشة وتجعل المستند
    // قابلًا للتمرير أفقيًا على الموبايل. القشرة بمقاس الشاشة، فلا شيء مشروع
    // يُرسَم خارجها (التنبيهات تُنقَل إلى body خارج هذه القشرة).
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface [contain:paint]">
      {/* الشريط العلوي */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
        <button
          type="button"
          className="btn-ghost h-9 w-9 !px-0 lg:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="القائمة"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/board" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            ن
          </span>
          <span className="text-sm font-semibold text-slate-900 sm:text-base">{companyName}</span>
        </Link>

        <div className="flex-1" />

        <InstallPrompt />
        <NotificationsToggle />

        <div className="flex items-center gap-2 rounded-lg py-1 pe-1 ps-2">
          <div className="hidden text-end sm:block">
            <p className="text-xs font-semibold leading-tight text-slate-800">{user.name}</p>
            <p className="text-[11px] leading-tight text-slate-500">{user.role.name}</p>
          </div>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
            {initials(user.name)}
          </span>
        </div>

        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="btn-ghost h-9 w-9 !px-0 text-slate-500 hover:text-red-600"
          aria-label="تسجيل الخروج"
          title="تسجيل الخروج"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* غطاء القائمة على الموبايل */}
        {menuOpen ? (
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="fixed inset-0 top-14 z-20 bg-slate-900/40 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            'fixed inset-y-14 z-20 w-60 shrink-0 overflow-y-auto border-e border-slate-200 bg-white p-3 transition-transform lg:static lg:inset-auto lg:translate-x-0',
            menuOpen
              ? 'translate-x-0'
              : 'pointer-events-none translate-x-full lg:pointer-events-auto lg:translate-x-0',
          )}
          style={{ insetInlineStart: 0 }}
        >
          <nav className="flex flex-col gap-1">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  <item.icon className="h-4.5 w-4.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            <p className="font-semibold text-slate-600">{user.role.name}</p>
            <p className="mt-1">
              {user.role.isAdmin
                ? 'صلاحيات كاملة على النظام'
                : `${user.role.permissions.length} صلاحية مفعّلة`}
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/orders';
import { AppShell } from '@/components/layout/app-shell';
import { SessionProvider } from '@/components/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const settings = await getSettings();

  return (
    <SessionProvider user={user}>
      <AppShell companyName={settings.companyName}>{children}</AppShell>
    </SessionProvider>
  );
}

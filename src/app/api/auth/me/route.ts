import { getCurrentUser } from '@/lib/auth';
import { ok, route } from '@/lib/api';
import { visibleColumns } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });

  return ok({
    user,
    columns: visibleColumns(user).map((c) => c.key),
  });
});

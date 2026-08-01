'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';

import type { SessionUser } from '@/lib/permissions';

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSession خارج SessionProvider');
  return user;
}

/**
 * فحص الصلاحيات في الواجهة — لإخفاء الأزرار فقط.
 * الحماية الحقيقية على السيرفر داخل كل مسار API.
 */
export function usePermissions() {
  const user = useSession();

  const can = useCallback(
    (permission: string) => user.role.isAdmin || user.role.permissions.includes(permission),
    [user],
  );

  const canSeeColumn = useCallback(
    (key: string) => user.role.isAdmin || user.role.visibleStages.includes(key),
    [user],
  );

  const canSeeProductionType = useCallback(
    (type: string) => user.role.isAdmin || user.role.productionTypes.includes(type),
    [user],
  );

  return useMemo(
    () => ({ user, can, canSeeColumn, canSeeProductionType }),
    [user, can, canSeeColumn, canSeeProductionType],
  );
}

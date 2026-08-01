import { clearSessionCookie } from '@/lib/auth';
import { ok, route } from '@/lib/api';

export const POST = route(async () => {
  clearSessionCookie();
  return ok({ success: true });
});

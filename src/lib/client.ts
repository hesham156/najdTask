'use client';

/** طبقة رقيقة فوق fetch تحوّل أخطاء الـ API إلى استثناءات برسائل عربية. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || 'تعذّر إتمام العملية، حاول مرة أخرى');
  }

  return payload as T;
}

export const apiGet = <T,>(url: string) => api<T>(url);

export const apiPost = <T,>(url: string, body?: unknown) =>
  api<T>(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

export const apiPatch = <T,>(url: string, body: unknown) =>
  api<T>(url, { method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = <T,>(url: string) => api<T>(url, { method: 'DELETE' });

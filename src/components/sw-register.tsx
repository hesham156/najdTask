'use client';

import { useEffect } from 'react';

/** يسجّل الـ service worker في الإنتاج فقط — أثناء التطوير يسبّب كاشًا مزعجًا. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // فشل التسجيل لا يمنع عمل التطبيق
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}

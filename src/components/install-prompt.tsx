'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * زر "ثبّت التطبيق" — يظهر فقط عندما يعلن المتصفح أن الصفحة قابلة للتثبيت.
 * على iOS لا يوجد هذا الحدث، والتثبيت يتم من قائمة المشاركة في Safari.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  return (
    <button
      type="button"
      className="btn-secondary !py-1.5 !text-xs"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
    >
      <Download className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">ثبّت التطبيق</span>
    </button>
  );
}

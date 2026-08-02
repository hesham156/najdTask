'use client';

import { useEffect, useState } from 'react';
import { Download, Plus, Share } from 'lucide-react';

import { Modal } from '@/components/ui';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** التطبيق مفتوح بالفعل كتطبيق مثبَّت لا كصفحة في المتصفح؟ */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // خاصية خاصة بـ Safari على iOS
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad — بما فيها iPadOS الذي يعرّف نفسه كـ Macintosh بشاشة لمس. */
function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * زر "ثبّت التطبيق".
 *
 * على أندرويد يعلن المتصفح عن قابلية التثبيت بحدث beforeinstallprompt فنعرض
 * زرًا يفتح نافذة التثبيت مباشرة. Safari على iOS لا يطلق هذا الحدث ولا يتيح
 * تثبيتًا برمجيًا إطلاقًا — الطريق الوحيد هو "مشاركة ← إضافة إلى الشاشة
 * الرئيسية"، فنعرض الخطوات مصوّرة بالكلمات بدلًا من ذلك.
 *
 * التثبيت على iOS ليس رفاهية: إشعارات الويب لا تعمل على iPhone إلا للتطبيق
 * المثبَّت على الشاشة الرئيسية (iOS 16.4 فأحدث).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  const [showIosButton, setShowIosButton] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // نحسبها بعد الإقلاع حتى لا يختلف رندر السيرفر عن العميل
    setShowIosButton(isIosDevice() && !isStandalone());

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (deferred) {
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

  if (!showIosButton) return null;

  return (
    <>
      <button
        type="button"
        className="btn-secondary !py-1.5 !text-xs"
        onClick={() => setIosHelpOpen(true)}
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">ثبّت التطبيق</span>
      </button>

      <Modal
        open={iosHelpOpen}
        onClose={() => setIosHelpOpen(false)}
        title="تثبيت التطبيق على الآيفون"
        description="من Safari، خطوتين وخلصنا"
        size="sm"
      >
        <ol className="space-y-3 text-sm text-slate-700">
          <li className="flex gap-3">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
              1
            </span>
            <span className="leading-relaxed">
              اضغط زر <strong>المشاركة</strong>
              <Share className="mx-1 inline h-4 w-4 align-text-bottom text-brand-600" />
              في شريط Safari بالأسفل.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
              2
            </span>
            <span className="leading-relaxed">
              انزل في القائمة واختر{' '}
              <strong>إضافة إلى الشاشة الرئيسية</strong>
              <Plus className="mx-1 inline h-4 w-4 align-text-bottom text-brand-600" />
              ثم <strong>إضافة</strong>.
            </span>
          </li>
        </ol>

        <div className="mt-4 space-y-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          <p>
            لازم تفتح الموقع من <strong>Safari</strong> بالذات — Chrome على الآيفون لا يسمح
            بالتثبيت.
          </p>
          <p>
            وبعد التثبيت افتح التطبيق من أيقونته على الشاشة الرئيسية: الإشعارات على الآيفون لا
            تعمل إلا من التطبيق المثبَّت.
          </p>
        </div>
      </Modal>
    </>
  );
}

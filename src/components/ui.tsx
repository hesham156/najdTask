'use client';

import { useEffect, useRef } from 'react';
import { Check, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';

// ──────────────────────────────── مؤشر تحميل ────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />;
}

export function PageLoader({ label = 'جارٍ التحميل...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
      <Spinner className="h-6 w-6" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

// ──────────────────────────────── حالة فارغة ────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      {Icon ? <Icon className="h-9 w-9 text-slate-300" /> : null}
      <div>
        <p className="font-medium text-slate-700">{title}</p>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ──────────────────────────────── حقل نموذج ────────────────────────────────

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

// ──────────────────────────── اختيار متعدد بمربّعات ────────────────────────────

/**
 * قائمة خيارات باختيار متعدد — تُستخدم لخيارات بند الشغل التي تختلف حسب نوع
 * الإنتاج. مربّعات ظاهرة بدل قائمة منسدلة لأن المطلوب رؤية كل الخيارات ولمسها
 * بسهولة على الموبايل.
 */
export function OptionPicker({
  options,
  selected,
  onChange,
  disabled,
  emptyLabel = 'لا توجد خيارات لهذا النوع',
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  if (options.length === 0) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option.key);
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => toggle(option.key)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <span
              className={cn(
                'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border',
                active ? 'border-brand-500 bg-brand-600' : 'border-slate-300 bg-white',
              )}
              aria-hidden
            >
              {active ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} /> : null}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────── نافذة ───────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (!panelRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift animate-scale-in sm:rounded-2xl',
          widths[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost -m-1 h-8 w-8 shrink-0 !px-0"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────── تأكيد الحذف ───────────────────────────────

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={loading}>
            إلغاء
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <Spinner /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">{message}</p>
    </Modal>
  );
}

// ──────────────────────────────── شارة ملوّنة ────────────────────────────────

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('chip', className)}>{children}</span>;
}

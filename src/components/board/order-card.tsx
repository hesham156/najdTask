'use client';

import { CalendarClock, MessageSquare, Paperclip, User } from 'lucide-react';

import { cn, dueState, formatDate } from '@/lib/utils';
import {
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  PRODUCTION_TYPE_LABELS,
  type ProductionType,
} from '@/lib/stages';
import type { OrderCard as OrderCardType } from '@/types/board';

const TYPE_DOT: Record<ProductionType, string> = {
  digital: 'bg-cyan-500',
  offset: 'bg-amber-500',
  indoor: 'bg-emerald-500',
};

export function OrderCardBody({
  card,
  prefix,
  dragging,
  handle,
  action,
}: {
  card: OrderCardType;
  prefix: string;
  dragging?: boolean;
  /** مقبض السحب — يُمرَّر من اللوحة، وغائب في طبقة السحب المعاينة */
  handle?: React.ReactNode;
  /** زر "نقل إلى..." */
  action?: React.ReactNode;
}) {
  const due = dueState(card.dueDate);
  const progress = card.totalItems > 0 ? Math.round((card.doneItems / card.totalItems) * 100) : 0;

  return (
    <article
      className={cn(
        'group rounded-xl border border-slate-200 bg-white p-3 text-start shadow-card transition-shadow',
        dragging ? 'shadow-lift ring-2 ring-brand-400' : 'hover:shadow-lift',
      )}
    >
      <header className="mb-2 flex items-center gap-1.5">
        {handle}
        <span className="num shrink-0 rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold text-white">
          {prefix}
          {card.number}
        </span>
        <span className={cn('chip ms-auto shrink-0', PRIORITY_STYLES[card.priority])}>
          {PRIORITY_LABELS[card.priority]}
        </span>
        {action}
      </header>

      <h3 className="text-sm font-semibold leading-snug text-slate-900">{card.title}</h3>

      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        <User className="h-3 w-3 shrink-0" />
        <span className="truncate">{card.customerName}</span>
      </p>

      {card.items.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.items.map((item) => (
            <span
              key={item.id}
              className={cn(
                'chip',
                item.status === 'done'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600',
              )}
              title={item.title}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', TYPE_DOT[item.productionType])} />
              {PRODUCTION_TYPE_LABELS[item.productionType]}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-amber-600">لا توجد بنود شغل بعد</p>
      )}

      {card.totalItems > 0 ? (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>
              اكتمل <span className="num">{card.doneItems}</span> من{' '}
              <span className="num">{card.totalItems}</span>
            </span>
            <span className="num">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress === 100 ? 'bg-green-500' : 'bg-brand-500',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      <footer className="mt-2.5 flex items-center gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        {card.dueDate ? (
          <span
            className={cn(
              'flex items-center gap-1',
              due === 'late' && 'font-semibold text-red-600',
              due === 'soon' && 'font-semibold text-amber-600',
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {formatDate(card.dueDate)}
          </span>
        ) : null}

        {card.attachmentsCount > 0 ? (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            <span className="num">{card.attachmentsCount}</span>
          </span>
        ) : null}

        {card.commentsCount > 0 ? (
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <span className="num">{card.commentsCount}</span>
          </span>
        ) : null}

        {card.invoiceNumber ? (
          <span className="ms-auto rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">
            فاتورة <span className="num">{card.invoiceNumber}</span>
          </span>
        ) : null}
      </footer>
    </article>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Check, CircleDot, Gauge, Paperclip, Play, User } from 'lucide-react';

import { cn, dueState, formatDate } from '@/lib/utils';
import {
  ITEM_STATUS_LABELS,
  ITEM_STATUS_STYLES,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  PRODUCTION_TYPE_LABELS,
  consumptionShortLabel,
  consumptionUnitFor,
  itemOptionLabels,
  type ItemStatus,
} from '@/lib/stages';
import type { ItemCard as ItemCardType } from '@/types/board';

export function ItemCardBody({
  card,
  prefix,
  dragging,
  handle,
  action,
  canChangeStatus,
  onStatusChange,
  onConsumedChange,
  busy,
}: {
  card: ItemCardType;
  prefix: string;
  dragging?: boolean;
  /** مقبض السحب — يُمرَّر من اللوحة، وغائب في طبقة السحب المعاينة */
  handle?: React.ReactNode;
  /** زر "نقل إلى..." */
  action?: React.ReactNode;
  canChangeStatus: boolean;
  onStatusChange?: (status: ItemStatus) => void;
  /** تسجيل الاستهلاك — نفس صلاحية بدء البند وإنهائه */
  onConsumedChange?: (value: number | null) => void;
  busy?: boolean;
}) {
  const due = dueState(card.order.dueDate);
  const done = card.status === 'done';
  const optionLabels = itemOptionLabels(card.productionType, card.options);

  // الأزرار لا يجب أن تبدأ سحبًا عند الضغط عليها
  const stop = (event: React.PointerEvent) => event.stopPropagation();

  return (
    <article
      className={cn(
        'rounded-xl border bg-white p-3 text-start shadow-card transition-shadow',
        done ? 'border-green-200 opacity-70' : 'border-slate-200',
        dragging ? 'shadow-lift ring-2 ring-brand-400' : 'hover:shadow-lift',
      )}
    >
      <header className="mb-2 flex items-center gap-1.5">
        {handle}
        <span className="num shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">
          {prefix}
          {card.order.number}
        </span>
        <span className={cn('chip ms-auto shrink-0', ITEM_STATUS_STYLES[card.status])}>
          {ITEM_STATUS_LABELS[card.status]}
        </span>
        {action}
      </header>

      <h3 className={cn('text-sm font-semibold leading-snug text-slate-900', done && 'line-through')}>
        {card.title}
      </h3>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span className="font-medium text-slate-600">
          الكمية <span className="num">{card.quantity}</span>
        </span>
        <span className="text-slate-300">•</span>
        <span className="truncate">{card.order.customerName}</span>
      </div>

      {card.specs ? (
        <p className="mt-1.5 line-clamp-2 rounded-md bg-slate-50 px-2 py-1 text-[11px] leading-relaxed text-slate-600">
          {card.specs}
        </p>
      ) : null}

      {optionLabels.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {optionLabels.map((label) => (
            <span
              key={label}
              className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className={cn('chip', PRIORITY_STYLES[card.order.priority])}>
          {PRIORITY_LABELS[card.order.priority]}
        </span>

        {card.order.dueDate ? (
          <span
            className={cn(
              'flex items-center gap-1',
              due === 'late' && 'font-semibold text-red-600',
              due === 'soon' && 'font-semibold text-amber-600',
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {formatDate(card.order.dueDate)}
          </span>
        ) : null}

        {card.attachmentsCount > 0 ? (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            <span className="num">{card.attachmentsCount}</span>
          </span>
        ) : null}

        {card.assignee ? (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {card.assignee.name}
          </span>
        ) : null}
      </div>

      {canChangeStatus && onConsumedChange ? (
        <div className="mt-2" onPointerDown={stop} onClick={(e) => e.stopPropagation()}>
          <ConsumedInput
            productionType={card.productionType}
            value={card.consumedQty}
            storedUnit={card.consumedUnit}
            disabled={busy}
            onSave={onConsumedChange}
          />
        </div>
      ) : null}

      {canChangeStatus && onStatusChange ? (
        <div
          className="mt-2.5 flex gap-1.5 border-t border-slate-100 pt-2"
          onPointerDown={stop}
          onClick={(e) => e.stopPropagation()}
        >
          {card.status === 'pending' ? (
            <button
              type="button"
              className="btn-secondary flex-1 !py-1.5 !text-xs"
              disabled={busy}
              onClick={() => onStatusChange('in_progress')}
            >
              <Play className="h-3 w-3" />
              ابدأ الشغل
            </button>
          ) : null}

          {card.status === 'in_progress' ? (
            <button
              type="button"
              className="btn !flex-1 !py-1.5 !text-xs bg-green-600 text-white hover:bg-green-700"
              disabled={busy}
              onClick={() => onStatusChange('done')}
            >
              <Check className="h-3 w-3" />
              خلص
            </button>
          ) : null}

          {done ? (
            <button
              type="button"
              className="btn-ghost flex-1 !py-1.5 !text-xs"
              disabled={busy}
              onClick={() => onStatusChange('in_progress')}
            >
              <CircleDot className="h-3 w-3" />
              إعادة فتح
            </button>
          ) : null}
        </div>
      ) : null}

      <span className="sr-only">نوع الشغل: {PRODUCTION_TYPE_LABELS[card.productionType]}</span>
    </article>
  );
}

/**
 * حقل تسجيل الاستهلاك: شيتات للطباعة الورقية وأمتار للاندور.
 *
 * الحفظ عند مغادرة الحقل أو الضغط على Enter — لا مع كل ضغطة مفتاح، وإلا
 * أرسلنا طلبًا لكل رقم يكتبه العامل. ونحفظ فقط إن تغيّرت القيمة فعلًا.
 */
function ConsumedInput({
  productionType,
  value,
  storedUnit,
  disabled,
  onSave,
}: {
  productionType: string;
  value: number | null;
  storedUnit: string | null;
  disabled?: boolean;
  onSave: (value: number | null) => void;
}) {
  const unit = consumptionUnitFor(productionType);
  const suffix = consumptionShortLabel(productionType, storedUnit);
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  // لو تغيّرت القيمة من الخادم (تحديث اللوحة) نزامن الحقل ما لم يكن قيد التحرير
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value === null ? '' : String(value));
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : Number(trimmed);

    if (next !== null && (Number.isNaN(next) || next < 0)) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    if (next === value) return;
    onSave(next);
  }

  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
      <Gauge className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={unit.step}
        value={draft}
        disabled={disabled}
        placeholder="—"
        aria-label={unit.label}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(value === null ? '' : String(value));
            setEditing(false);
            event.currentTarget.blur();
          }
        }}
        className="num w-full min-w-0 bg-transparent text-[11px] font-semibold text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-400 disabled:opacity-50"
      />
      <span className="shrink-0 text-[10px] text-slate-500">{suffix}</span>
    </label>
  );
}

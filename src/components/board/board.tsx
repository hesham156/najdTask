'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { apiGet, apiPatch, apiPost } from '@/lib/client';
import { cn } from '@/lib/utils';
import type { ItemStatus } from '@/lib/stages';
import { usePermissions } from '@/components/session';
import { EmptyState, PageLoader, Spinner } from '@/components/ui';
import { CreateOrderModal } from '@/components/orders/create-order-modal';
import { OrderDetailModal } from '@/components/orders/order-detail-modal';
import type { BoardCard, BoardColumnData, BoardData } from '@/types/board';

import { ItemCardBody } from './item-card';
import { OrderCardBody } from './order-card';

const cardKey = (card: BoardCard) => `${card.type}:${card.id}`;

function findColumnKey(id: string, columns: BoardColumnData[]): string | null {
  if (columns.some((column) => column.key === id)) return id;
  const owner = columns.find((column) => column.cards.some((card) => cardKey(card) === id));
  return owner?.key ?? null;
}

export function Board() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [columns, setColumns] = useState<BoardColumnData[]>([]);
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const columnsRef = useRef<BoardColumnData[]>([]);
  const originRef = useRef<{ column: string; index: number; card: BoardCard } | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['board'],
    queryFn: () => apiGet<BoardData>('/api/board'),
    // نوقف التحديث التلقائي أثناء السحب حتى لا يقفز الكارت من تحت الإصبع
    refetchInterval: activeCard ? false : 20_000,
  });

  useEffect(() => {
    if (data && !activeCard) {
      setColumns(data.columns);
      columnsRef.current = data.columns;
    }
  }, [data, activeCard]);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const prefix = data?.orderNumberPrefix ?? '';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // ضغطة مطوّلة على الموبايل حتى لا يتعارض السحب مع تمرير الصفحة
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const moveMutation = useMutation({
    mutationFn: ({
      card,
      toColumn,
      position,
    }: {
      card: BoardCard;
      toColumn: string;
      position: number;
    }) =>
      card.type === 'order'
        ? apiPost(`/api/orders/${card.id}/move`, { toColumn, position })
        : apiPost(`/api/items/${card.id}/move`, { toColumn, position }),
    onError: (error: Error) => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ItemStatus }) =>
      apiPatch(`/api/items/${id}`, { status }),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
  });

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const columnKey = findColumnKey(id, columnsRef.current);
    if (!columnKey) return;
    const column = columnsRef.current.find((c) => c.key === columnKey)!;
    const index = column.cards.findIndex((c) => cardKey(c) === id);
    const card = column.cards[index];
    if (!card) return;

    originRef.current = { column: columnKey, index, card };
    setActiveCard(card);
    document.body.classList.add('dragging');
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const from = findColumnKey(activeId, columnsRef.current);
    const to = findColumnKey(overId, columnsRef.current);
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const source = prev.find((c) => c.key === from);
      const target = prev.find((c) => c.key === to);
      const card = source?.cards.find((c) => cardKey(c) === activeId);
      if (!source || !target || !card) return prev;

      const overIndex = target.cards.findIndex((c) => cardKey(c) === overId);
      const insertAt = overIndex >= 0 ? overIndex : target.cards.length;

      return prev.map((column) => {
        if (column.key === from) {
          return { ...column, cards: column.cards.filter((c) => cardKey(c) !== activeId) };
        }
        if (column.key === to) {
          const next = [...column.cards];
          next.splice(insertAt, 0, card);
          return { ...column, cards: next };
        }
        return column;
      });
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const origin = originRef.current;

    originRef.current = null;
    setActiveCard(null);
    document.body.classList.remove('dragging');

    if (!origin) return;
    if (!over) {
      queryClient.invalidateQueries({ queryKey: ['board'] });
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const targetKey = findColumnKey(overId, columnsRef.current);

    if (!targetKey) {
      queryClient.invalidateQueries({ queryKey: ['board'] });
      return;
    }

    const targetColumn = columnsRef.current.find((c) => c.key === targetKey)!;
    const currentIndex = targetColumn.cards.findIndex((c) => cardKey(c) === activeId);
    const overIndex = targetColumn.cards.findIndex((c) => cardKey(c) === overId);
    const nextIndex = overIndex >= 0 ? overIndex : Math.max(0, targetColumn.cards.length - 1);

    if (currentIndex >= 0 && currentIndex !== nextIndex) {
      setColumns((prev) =>
        prev.map((column) =>
          column.key === targetKey
            ? { ...column, cards: arrayMove(column.cards, currentIndex, nextIndex) }
            : column,
        ),
      );
    }

    const changedColumn = targetKey !== origin.column;
    const changedOrder = nextIndex !== origin.index;

    if (changedColumn || changedOrder) {
      moveMutation.mutate({ card: origin.card, toColumn: targetKey, position: nextIndex });
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return columns;
    return columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => {
        const haystack =
          card.type === 'order'
            ? `${card.number} ${card.title} ${card.customerName}`
            : `${card.order.number} ${card.title} ${card.order.customerName} ${card.specs ?? ''}`;
        return haystack.toLowerCase().includes(term);
      }),
    }));
  }, [columns, search]);

  if (isLoading) return <PageLoader label="جارٍ تحميل اللوحة..." />;

  if (columns.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Inbox}
          title="لا توجد أعمدة معروضة لك"
          description="دورك الحالي لا يسمح برؤية أي عمود في اللوحة. راجع مدير النظام لتفعيل الأعمدة المناسبة لك."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* شريط الأدوات */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" />
          <input
            className="input ps-9"
            placeholder="ابحث برقم الأوردر أو العميل..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn-secondary h-9 w-9 !px-0"
          onClick={() => refetch()}
          aria-label="تحديث"
          title="تحديث"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </button>

        {can('orders.create') ? (
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">أوردر جديد</span>
            <span className="sm:hidden">جديد</span>
          </button>
        ) : null}
      </div>

      {/* اللوحة */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          originRef.current = null;
          setActiveCard(null);
          document.body.classList.remove('dragging');
          queryClient.invalidateQueries({ queryKey: ['board'] });
        }}
      >
        <div className="board-scroll flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
          {filtered.map((column) => (
            <BoardColumn
              key={column.key}
              column={column}
              prefix={prefix}
              onOpenOrder={setOpenOrderId}
              canChangeStatus={can('items.move')}
              onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
              busy={statusMutation.isPending}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeCard ? (
            <div className="w-72 rotate-2 cursor-grabbing">
              {activeCard.type === 'order' ? (
                <OrderCardBody card={activeCard} prefix={prefix} dragging />
              ) : (
                <ItemCardBody card={activeCard} prefix={prefix} dragging canChangeStatus={false} />
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <CreateOrderModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <OrderDetailModal orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </div>
  );
}

// ─────────────────────────────────── العمود ───────────────────────────────────

function BoardColumn({
  column,
  prefix,
  onOpenOrder,
  canChangeStatus,
  onStatusChange,
  busy,
}: {
  column: BoardColumnData;
  prefix: string;
  onOpenOrder: (id: string) => void;
  canChangeStatus: boolean;
  onStatusChange: (id: string, status: ItemStatus) => void;
  busy: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const ids = column.cards.map(cardKey);

  return (
    <section className="flex h-full w-[17.5rem] shrink-0 flex-col sm:w-72">
      <header
        className={cn(
          'mb-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-2',
          column.headerBg,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', column.accent)} />
          <h2 className="truncate text-sm font-semibold">{column.label}</h2>
        </div>
        <span className="num shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">
          {column.cards.length}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-1.5 transition-colors',
          isOver ? 'bg-brand-50 ring-2 ring-brand-300' : 'bg-surface-sunken/60',
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <SortableCard key={cardKey(card)} id={cardKey(card)}>
              {(dragging) => (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenOrder(card.type === 'order' ? card.id : card.order.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onOpenOrder(card.type === 'order' ? card.id : card.order.id);
                    }
                  }}
                  className="cursor-grab active:cursor-grabbing"
                >
                  {card.type === 'order' ? (
                    <OrderCardBody card={card} prefix={prefix} dragging={dragging} />
                  ) : (
                    <ItemCardBody
                      card={card}
                      prefix={prefix}
                      dragging={dragging}
                      canChangeStatus={canChangeStatus}
                      onStatusChange={(status) => onStatusChange(card.id, status)}
                      busy={busy}
                    />
                  )}
                </div>
              )}
            </SortableCard>
          ))}
        </SortableContext>

        {column.cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
            {column.hint ?? 'لا توجد كروت'}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ───────────────────────────── كارت قابل للسحب ─────────────────────────────

function SortableCard({
  id,
  children,
}: {
  id: string;
  children: (dragging: boolean) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      {children(isDragging)}
    </div>
  );
}

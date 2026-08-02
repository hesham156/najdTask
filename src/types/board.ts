import type { ItemStatus, Priority, ProductionType } from '@/lib/stages';

export type UserBadge = {
  id: string;
  name: string;
};

export type ItemSummary = {
  id: string;
  productionType: ProductionType;
  title: string;
  status: ItemStatus;
};

export type OrderCard = {
  type: 'order';
  id: string;
  number: number;
  title: string;
  customerName: string;
  priority: Priority;
  stage: string;
  position: number;
  dueDate: string | null;
  createdBy: UserBadge;
  /** ملخّص البنود التي يُسمح لهذا المستخدم برؤيتها فقط */
  items: ItemSummary[];
  /** إجمالي عدد البنود (بما فيها ما لا يراه) — لعرض تقدّم صحيح */
  totalItems: number;
  doneItems: number;
  attachmentsCount: number;
  commentsCount: number;
  invoiceNumber: string | null;
  deliveryNoteNumber: string | null;
};

export type ItemCard = {
  type: 'item';
  id: string;
  title: string;
  productionType: ProductionType;
  status: ItemStatus;
  quantity: number;
  specs: string | null;
  /** مفاتيح الخيارات المختارة — تُترجَم بـ itemOptionLabels في lib/stages */
  options: string[];
  /** ما استهلكه عامل الإنتاج فعليًا، ووحدته وقت الإدخال (sheet | meter) */
  consumedQty: number | null;
  consumedUnit: string | null;
  position: number;
  assignee: UserBadge | null;
  attachmentsCount: number;
  order: {
    id: string;
    number: number;
    title: string;
    customerName: string;
    priority: Priority;
    dueDate: string | null;
  };
};

export type BoardCard = OrderCard | ItemCard;

export type BoardColumnData = {
  key: string;
  label: string;
  kind: 'order' | 'item';
  accent: string;
  headerBg: string;
  hint?: string;
  cards: BoardCard[];
};

export type BoardData = {
  columns: BoardColumnData[];
  orderNumberPrefix: string;
};

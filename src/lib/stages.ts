/**
 * تعريف مراحل العمل وأعمدة اللوحة وأنواع الإنتاج.
 *
 * الفكرة الأساسية في النظام:
 * الأوردر يتحرك ككارت واحد في أعمدة (الأوردرات ← التصميم)، وبعد التصميم
 * "ينفتح" إلى بنود شغل (OrderItem) كل بند بنوع إنتاج مختلف، وكل بند يظهر
 * ككارت مستقل في عموده (ديجيتال / أوفست / اندور / خارجي أو أخرى). عامل
 * الأوفست يرى بنود الأوفست فقط. ولما كل البنود تخلص، كارت الأوردر يظهر في
 * عمود الاكتمال ويكمل رحلته (المراجعة ← الفاتورة وسند التسليم).
 *
 * وبين الإنتاج والاكتمال عمود "ما بعد الطباعة" للتشطيبات — مرحلة أوردر
 * يدوية بالكامل، يُسحَب إليها الكارت ومنها بيد المستخدم.
 *
 * لإضافة نوع إنتاج جديد (مثلًا "ليزر"): أضِف مفتاحه في PRODUCTION_TYPES
 * وعمودًا مقابلًا في BOARD_COLUMNS. باقي النظام يتكيّف تلقائيًا.
 */

// ────────────────────────────── أنواع الإنتاج ──────────────────────────────

export const PRODUCTION_TYPES = ['digital', 'offset', 'indoor', 'external'] as const;
export type ProductionType = (typeof PRODUCTION_TYPES)[number];

export const PRODUCTION_TYPE_LABELS: Record<ProductionType, string> = {
  digital: 'ديجيتال',
  offset: 'أوفست',
  indoor: 'اندور',
  external: 'خارجي أو أخرى',
};

export function isProductionType(value: string): value is ProductionType {
  return (PRODUCTION_TYPES as readonly string[]).includes(value);
}

// ─────────────────────── وحدة الاستهلاك حسب نوع الإنتاج ───────────────────────

/**
 * ما الذي يسجّله عامل الإنتاج بعد تنفيذ البند: الطباعة الورقية تُحسب بالشيتات
 * والاندور بالأمتار. الوحدة مشتقّة من نوع الإنتاج فلا يختار العامل شيئًا.
 */
export type ConsumptionUnit = {
  /** يُخزَّن مع الرقم حتى يبقى صحيحًا لو تحوّل البند لنوع آخر لاحقًا */
  key: 'sheet' | 'meter';
  /** تسمية الحقل في النموذج */
  label: string;
  /** لاحقة مختصرة تظهر بجانب الرقم */
  short: string;
  /** الأمتار تقبل الكسور، والشيتات لا */
  step: number;
};

const SHEETS: ConsumptionUnit = {
  key: 'sheet',
  label: 'عدد الشيتات المستخدمة',
  short: 'شيت',
  step: 1,
};

const METERS: ConsumptionUnit = {
  key: 'meter',
  label: 'عدد الأمتار المستخدمة',
  short: 'متر',
  step: 0.5,
};

export const CONSUMPTION_UNITS: Record<ProductionType, ConsumptionUnit> = {
  digital: SHEETS,
  offset: SHEETS,
  indoor: METERS,
  // الشغل الخارجي غالبًا لا يُسجَّل له استهلاك، والحقل اختياري أصلًا
  external: SHEETS,
};

export function consumptionUnitFor(productionType: string): ConsumptionUnit {
  return CONSUMPTION_UNITS[productionType as ProductionType] ?? SHEETS;
}

/**
 * لاحقة العرض. نفضّل الوحدة المخزَّنة وقت الإدخال على المشتقّة من النوع
 * الحالي: بند سُجِّل بالأمتار ثم تحوّل لأوفست يجب أن يظل مكتوبًا "متر".
 */
export function consumptionShortLabel(productionType: string, storedUnit?: string | null): string {
  if (storedUnit === 'meter') return METERS.short;
  if (storedUnit === 'sheet') return SHEETS.short;
  return consumptionUnitFor(productionType).short;
}

// ─────────────────────── خيارات البند حسب نوع الإنتاج ───────────────────────

/**
 * خيارات إضافية يختار منها المستخدم ما شاء لكل بند شغل (اختيار متعدد).
 * الديجيتال والأوفست يشتركان في خيارات التشطيب، والاندور له قائمة ماكيناته.
 *
 * لإضافة خيار جديد: أضِف سطرًا في القائمة المناسبة. المفتاح هو ما يُخزَّن في
 * قاعدة البيانات فلا تغيّره بعد الاستخدام، والتسمية هي ما يظهر في الواجهة.
 */
export type ItemOption = { key: string; label: string };

const FINISHING_OPTIONS: ItemOption[] = [
  { key: 'box', label: 'Box' },
  { key: 'cello_gloss', label: 'سلفان لميع' },
  { key: 'cello_matte', label: 'سلفان مطفي' },
  { key: 'creasing', label: 'تكسير' },
];

const INDOOR_OPTIONS: ItemOption[] = [
  { key: 'dtf', label: 'DTF' },
  { key: 'uv_dtf', label: 'UV-DTF' },
  { key: 'sublimation', label: 'Sublimation' },
  { key: 'orajet_lamination', label: 'Orajet Lamination' },
  { key: 'witcolor_200', label: 'Wit-Color 200' },
  { key: 'cutplotter_130ar', label: '130AR Cutplotter' },
  { key: 'gz_uv', label: 'GZ UV' },
  { key: 'roland', label: 'Roland' },
  { key: 'book_lamination', label: 'Book Lamination' },
  { key: 'gz_320', label: 'GZ 320' },
  { key: 'epson', label: 'Epson' },
  { key: 'lamination', label: 'Lamination' },
];

export const ITEM_OPTIONS: Record<ProductionType, ItemOption[]> = {
  digital: FINISHING_OPTIONS,
  offset: FINISHING_OPTIONS,
  indoor: INDOOR_OPTIONS,
  // الشغل الخارجي أو غير المصنَّف بلا قائمة خيارات — تفاصيله تُكتب في المواصفات
  external: [],
};

/** تسميات الخيارات المختارة، متجاهلةً أي مفتاح لم يعد موجودًا في القائمة. */
export function itemOptionLabels(productionType: string, keys: string[]): string[] {
  const available = ITEM_OPTIONS[productionType as ProductionType] ?? [];
  return keys
    .map((key) => available.find((option) => option.key === key)?.label)
    .filter((label): label is string => Boolean(label));
}

/** يُبقي فقط المفاتيح الصالحة لهذا النوع — الواجهة قد ترسل خيارات نوع آخر بعد التبديل. */
export function sanitizeItemOptions(productionType: string, keys: string[]): string[] {
  const available = ITEM_OPTIONS[productionType as ProductionType] ?? [];
  return available.filter((option) => keys.includes(option.key)).map((option) => option.key);
}

// ───────────────────────────── مراحل الأوردر ─────────────────────────────

export const ORDER_STAGES = [
  'orders',
  'design',
  'production',
  'postpress',
  'completed',
  'review',
  'invoice',
  'delivered',
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  orders: 'الأوردرات',
  design: 'التصميم',
  production: 'تحت الإنتاج',
  postpress: 'ما بعد الطباعة',
  completed: 'الاكتمال',
  review: 'المراجعة',
  invoice: 'الفاتورة وسند التسليم',
  delivered: 'تم التسليم',
};

export function isOrderStage(value: string): value is OrderStage {
  return (ORDER_STAGES as readonly string[]).includes(value);
}

// ──────────────────────────── أعمدة لوحة الكانبان ────────────────────────────

export type BoardColumn = {
  /** مفتاح العمود — هو نفسه معرّف منطقة الإفلات */
  key: string;
  label: string;
  /** order = يعرض كروت أوردرات، item = يعرض كروت بنود شغل */
  kind: 'order' | 'item';
  /** للأعمدة من نوع order */
  stage?: OrderStage;
  /** للأعمدة من نوع item */
  productionType?: ProductionType;
  /** ألوان تمييز العمود */
  accent: string;
  headerBg: string;
  hint?: string;
};

export const BOARD_COLUMNS: BoardColumn[] = [
  {
    key: 'orders',
    label: 'الأوردرات',
    kind: 'order',
    stage: 'orders',
    accent: 'bg-slate-500',
    headerBg: 'bg-slate-50 text-slate-700 border-slate-200',
    hint: 'أوردرات جديدة لم تبدأ بعد',
  },
  {
    key: 'design',
    label: 'التصميم',
    kind: 'order',
    stage: 'design',
    accent: 'bg-violet-500',
    headerBg: 'bg-violet-50 text-violet-700 border-violet-200',
    hint: 'تحت التصميم — بعد الانتهاء يُرسَل للإنتاج',
  },
  {
    key: 'digital',
    label: 'الديجيتال',
    kind: 'item',
    productionType: 'digital',
    accent: 'bg-cyan-500',
    headerBg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    hint: 'بنود الطباعة الديجيتال',
  },
  {
    key: 'offset',
    label: 'الأوفست',
    kind: 'item',
    productionType: 'offset',
    accent: 'bg-amber-500',
    headerBg: 'bg-amber-50 text-amber-700 border-amber-200',
    hint: 'بنود طباعة الأوفست',
  },
  {
    key: 'indoor',
    label: 'الاندور',
    kind: 'item',
    productionType: 'indoor',
    accent: 'bg-emerald-500',
    headerBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hint: 'بنود طباعة الاندور',
  },
  {
    key: 'external',
    label: 'خارجي أو أخرى',
    kind: 'item',
    productionType: 'external',
    accent: 'bg-fuchsia-500',
    headerBg: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    hint: 'بنود تتنفَّذ خارج المطبعة أو لا تندرج تحت نوع محدد',
  },
  {
    key: 'postpress',
    label: 'ما بعد الطباعة',
    kind: 'order',
    stage: 'postpress',
    accent: 'bg-indigo-500',
    headerBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    hint: 'تشطيبات ما بعد الطباعة — يُسحَب إليه الأوردر يدويًا',
  },
  {
    key: 'completed',
    label: 'الاكتمال',
    kind: 'order',
    stage: 'completed',
    accent: 'bg-teal-600',
    headerBg: 'bg-teal-50 text-teal-700 border-teal-200',
    hint: 'أوردرات اكتملت كل بنودها',
  },
  {
    key: 'review',
    label: 'المراجعة',
    kind: 'order',
    stage: 'review',
    accent: 'bg-orange-500',
    headerBg: 'bg-orange-50 text-orange-700 border-orange-200',
    hint: 'مراجعة الجودة قبل الفوترة',
  },
  {
    key: 'invoice',
    label: 'الفاتورة وسند التسليم',
    kind: 'order',
    stage: 'invoice',
    accent: 'bg-rose-500',
    headerBg: 'bg-rose-50 text-rose-700 border-rose-200',
    hint: 'إصدار الفاتورة وتسليم العميل',
  },
];

export const BOARD_COLUMN_KEYS = BOARD_COLUMNS.map((c) => c.key);

export function getColumn(key: string): BoardColumn | undefined {
  return BOARD_COLUMNS.find((c) => c.key === key);
}

/** العمود الذي يعرض أوردرات هذه المرحلة (لو كان لها عمود ظاهر) */
export function columnForStage(stage: string): BoardColumn | undefined {
  return BOARD_COLUMNS.find((c) => c.kind === 'order' && c.stage === stage);
}

// ─────────────────────────── الانتقالات المسموح بها ───────────────────────────

/**
 * من أي مرحلة إلى أي مرحلة يُسمح بنقل كارت الأوردر.
 *
 * ملاحظتان:
 *  - الانتقال من production إلى completed لا يتم بالسحب، بل تلقائيًا عندما
 *    تنتهي كل بنود الأوردر.
 *  - postpress مرحلة يدوية بالكامل: تُدخَل بالسحب من الإنتاج أو رجوعًا من
 *    الاكتمال، وتُغادَر بالسحب. لا شيء ينقل الأوردر إليها أو منها تلقائيًا.
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStage, OrderStage[]> = {
  orders: ['design', 'production'],
  design: ['orders', 'production'],
  production: ['design', 'postpress'],
  postpress: ['production', 'completed'],
  completed: ['review', 'production', 'postpress'],
  review: ['completed', 'invoice', 'design'],
  invoice: ['review', 'delivered'],
  delivered: ['invoice'],
};

export function canTransition(from: string, to: string): boolean {
  if (!isOrderStage(from) || !isOrderStage(to)) return false;
  if (from === to) return true;
  return ALLOWED_ORDER_TRANSITIONS[from].includes(to);
}

// ───────────────────────────── حالات بنود الشغل ─────────────────────────────

export const ITEM_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  pending: 'في الانتظار',
  in_progress: 'جاري التنفيذ',
  done: 'تم',
};

export const ITEM_STATUS_STYLES: Record<ItemStatus, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-green-50 text-green-700 border-green-200',
};

export function isItemStatus(value: string): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value);
}

// ──────────────────────────────── الأولويات ────────────────────────────────

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'مرتفعة',
  urgent: 'عاجل',
};

export const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  normal: 'bg-sky-50 text-sky-700 border-sky-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
};

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

/**
 * قائمة الصلاحيات وأدوات فحصها.
 *
 * الصلاحية في هذا النظام لها ثلاثة أبعاد:
 *  1) الفعل      — هل يقدر يضيف / يعدّل / يشوف / يحذف؟   (permissions)
 *  2) الأعمدة    — أي أعمدة اللوحة يراها أصلًا؟           (visibleStages)
 *  3) نوع الإنتاج — أوفست فقط؟ ديجيتال فقط؟               (productionTypes)
 *
 * البعدان 2 و 3 هما ما يجعل عامل الأوفست يرى بنود الأوفست فقط داخل نفس
 * الأوردر الذي يحتوي أيضًا على بنود ديجيتال.
 *
 * كل الفحوصات تُطبَّق على السيرفر داخل الـ API، والواجهة تخفي ما لا يُسمح به
 * فقط كتحسين لتجربة الاستخدام — إخفاء الزر ليس حماية.
 */

import { BOARD_COLUMNS, type BoardColumn, type ProductionType } from './stages';

export type PermissionGroup = {
  key: string;
  label: string;
  permissions: { key: string; label: string; description?: string }[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'orders',
    label: 'الأوردرات',
    permissions: [
      { key: 'orders.view', label: 'عرض الأوردرات', description: 'رؤية اللوحة وقائمة الأوردرات' },
      { key: 'orders.create', label: 'إضافة أوردر جديد' },
      { key: 'orders.edit', label: 'تعديل بيانات الأوردر' },
      { key: 'orders.move', label: 'نقل الأوردر بين الأعمدة' },
      { key: 'orders.delete', label: 'حذف الأوردر' },
    ],
  },
  {
    key: 'items',
    label: 'بنود الشغل',
    permissions: [
      { key: 'items.create', label: 'إضافة بند شغل للأوردر' },
      { key: 'items.edit', label: 'تعديل بند الشغل' },
      { key: 'items.move', label: 'تغيير حالة البند (بدء / إنهاء)' },
      { key: 'items.assign', label: 'إسناد البند لموظف' },
      { key: 'items.delete', label: 'حذف بند الشغل' },
    ],
  },
  {
    key: 'files',
    label: 'الملفات',
    permissions: [
      { key: 'files.download', label: 'فتح وتحميل الملفات' },
      { key: 'files.upload', label: 'رفع ملفات' },
      { key: 'files.delete', label: 'حذف ملفات' },
    ],
  },
  {
    key: 'comments',
    label: 'التعليقات',
    permissions: [
      { key: 'comments.create', label: 'كتابة تعليق' },
      { key: 'comments.delete', label: 'حذف تعليقات الآخرين' },
    ],
  },
  {
    key: 'customers',
    label: 'العملاء',
    permissions: [
      { key: 'customers.view', label: 'عرض بيانات العملاء' },
      { key: 'customers.manage', label: 'إضافة وتعديل العملاء' },
    ],
  },
  {
    key: 'invoice',
    label: 'الفواتير والتسليم',
    permissions: [
      { key: 'invoice.manage', label: 'إصدار الفاتورة وسند التسليم' },
    ],
  },
  {
    key: 'reports',
    label: 'التقارير',
    permissions: [{ key: 'reports.view', label: 'عرض التقارير والإحصائيات' }],
  },
  {
    key: 'admin',
    label: 'الإدارة',
    permissions: [
      { key: 'users.manage', label: 'إدارة المستخدمين' },
      { key: 'roles.manage', label: 'إدارة الأدوار والصلاحيات' },
      { key: 'settings.manage', label: 'تعديل إعدادات النظام' },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

const PERMISSION_LABELS = new Map(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label] as const)),
);

export function permissionLabel(key: string): string {
  return PERMISSION_LABELS.get(key) ?? key;
}

// ───────────────────────────── نوع المستخدم في الجلسة ─────────────────────────────

export type SessionRole = {
  id: string;
  key: string;
  name: string;
  isAdmin: boolean;
  permissions: string[];
  visibleStages: string[];
  productionTypes: string[];
};

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: SessionRole;
};

// ──────────────────────────────── دوال الفحص ────────────────────────────────

/** هل يملك المستخدم هذه الصلاحية؟ الأدمن يملك كل شيء. */
export function can(user: SessionUser | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.role.isAdmin) return true;
  return user.role.permissions.includes(permission);
}

/** هل يملك المستخدم أيًا من هذه الصلاحيات؟ */
export function canAny(user: SessionUser | null | undefined, permissions: string[]): boolean {
  return permissions.some((p) => can(user, p));
}

/** هل يرى المستخدم هذا العمود من اللوحة؟ */
export function canSeeColumn(user: SessionUser | null | undefined, columnKey: string): boolean {
  if (!user) return false;
  if (user.role.isAdmin) return true;
  return user.role.visibleStages.includes(columnKey);
}

/** هل يرى المستخدم بنود هذا النوع من الإنتاج؟ */
export function canSeeProductionType(
  user: SessionUser | null | undefined,
  type: string,
): boolean {
  if (!user) return false;
  if (user.role.isAdmin) return true;
  return user.role.productionTypes.includes(type);
}

/** أنواع الإنتاج التي يُسمح للمستخدم برؤيتها — تُستخدم كفلتر في استعلامات قاعدة البيانات. */
export function allowedProductionTypes(user: SessionUser): ProductionType[] {
  const all = BOARD_COLUMNS.filter((c) => c.kind === 'item').map(
    (c) => c.productionType as ProductionType,
  );
  if (user.role.isAdmin) return all;
  return all.filter((t) => user.role.productionTypes.includes(t));
}

/** أعمدة اللوحة التي يراها المستخدم، بالترتيب. */
export function visibleColumns(user: SessionUser): BoardColumn[] {
  if (user.role.isAdmin) return BOARD_COLUMNS;
  return BOARD_COLUMNS.filter((c) => {
    if (!user.role.visibleStages.includes(c.key)) return false;
    // عمود إنتاج لا يظهر إلا لمن يملك نوع الإنتاج الخاص به
    if (c.kind === 'item' && c.productionType) {
      return user.role.productionTypes.includes(c.productionType);
    }
    return true;
  });
}

/** مراحل الأوردر التي يراها المستخدم في اللوحة. */
export function visibleOrderStages(user: SessionUser): string[] {
  return visibleColumns(user)
    .filter((c) => c.kind === 'order' && c.stage)
    .map((c) => c.stage as string);
}

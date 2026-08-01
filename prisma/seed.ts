/**
 * بيانات البداية: الأدوار الافتراضية، مستخدم الأدمن، الإعدادات، وأوردرات تجريبية.
 *
 * الأدوار هنا ليست ثابتة — الأدمن يقدر يعدّلها بالكامل من شاشة "الأدوار
 * والصلاحيات". هي مجرد نقطة انطلاق تغطي أدوار المطبعة المعتادة، وأهمها
 * أدوار عمّال الإنتاج: كل واحد يرى عمود نوعه فقط.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { ALL_PERMISSIONS } from '../src/lib/permissions';
import { serializeList } from '../src/lib/serialize';

const prisma = new PrismaClient();

type RoleSeed = {
  key: string;
  name: string;
  description: string;
  isAdmin?: boolean;
  isSystem?: boolean;
  permissions: string[];
  visibleStages: string[];
  productionTypes: string[];
};

const ALL_ORDER_COLUMNS = ['orders', 'design', 'completed', 'review', 'invoice'];
const ALL_PRODUCTION = ['digital', 'offset', 'indoor'];
const ALL_COLUMNS = [...ALL_ORDER_COLUMNS, ...ALL_PRODUCTION];

const ROLES: RoleSeed[] = [
  {
    key: 'admin',
    name: 'مدير النظام',
    description: 'صلاحيات كاملة على كل شيء، ويحدد صلاحيات باقي الأدوار',
    isAdmin: true,
    isSystem: true,
    permissions: ALL_PERMISSIONS,
    visibleStages: ALL_COLUMNS,
    productionTypes: ALL_PRODUCTION,
  },
  {
    key: 'production_manager',
    name: 'مدير الإنتاج',
    description: 'يتابع كل مراحل الشغل ويوزّع البنود على العمال',
    permissions: [
      'orders.view', 'orders.create', 'orders.edit', 'orders.move', 'orders.delete',
      'items.create', 'items.edit', 'items.move', 'items.assign', 'items.delete',
      'files.upload', 'files.download', 'files.delete',
      'comments.create', 'comments.delete',
      'customers.view', 'customers.manage',
      'invoice.manage', 'reports.view',
    ],
    visibleStages: ALL_COLUMNS,
    productionTypes: ALL_PRODUCTION,
  },
  {
    key: 'reception',
    name: 'خدمة العملاء',
    description: 'يستقبل الأوردرات من العملاء ويرفع الملفات ويحدد بنود الشغل',
    permissions: [
      'orders.view', 'orders.create', 'orders.edit', 'orders.move',
      'items.create', 'items.edit',
      'files.upload', 'files.download',
      'comments.create',
      'customers.view', 'customers.manage',
    ],
    // يرى مسار الأوردر لكن لا يرى أعمدة الإنتاج
    visibleStages: ALL_ORDER_COLUMNS,
    productionTypes: ALL_PRODUCTION,
  },
  {
    key: 'designer',
    name: 'مصمم',
    description: 'يشتغل على التصاميم ويرفع الملفات الجاهزة للطباعة',
    permissions: [
      'orders.view', 'orders.edit', 'orders.move',
      'items.edit',
      'files.upload', 'files.download',
      'comments.create',
    ],
    visibleStages: ['orders', 'design'],
    productionTypes: ALL_PRODUCTION,
  },

  // ── أدوار الإنتاج: كل واحد يرى نوعه فقط ──
  {
    key: 'offset_operator',
    name: 'عامل أوفست',
    description: 'يرى بنود الأوفست فقط، حتى داخل أوردر فيه شغل ديجيتال',
    permissions: ['orders.view', 'items.move', 'items.edit', 'files.download', 'comments.create'],
    visibleStages: ['offset'],
    productionTypes: ['offset'],
  },
  {
    key: 'digital_operator',
    name: 'عامل ديجيتال',
    description: 'يرى بنود الديجيتال فقط',
    permissions: ['orders.view', 'items.move', 'items.edit', 'files.download', 'comments.create'],
    visibleStages: ['digital'],
    productionTypes: ['digital'],
  },
  {
    key: 'indoor_operator',
    name: 'عامل اندور',
    description: 'يرى بنود الاندور فقط',
    permissions: ['orders.view', 'items.move', 'items.edit', 'files.download', 'comments.create'],
    visibleStages: ['indoor'],
    productionTypes: ['indoor'],
  },

  {
    key: 'reviewer',
    name: 'مراجع جودة',
    description: 'يراجع الشغل بعد اكتماله قبل الفوترة',
    permissions: ['orders.view', 'orders.move', 'files.download', 'comments.create'],
    visibleStages: ['completed', 'review'],
    productionTypes: ALL_PRODUCTION,
  },
  {
    key: 'accountant',
    name: 'محاسب',
    description: 'يصدر الفواتير وسندات التسليم',
    permissions: [
      'orders.view', 'orders.move',
      'invoice.manage',
      'files.download', 'comments.create',
      'customers.view', 'reports.view',
    ],
    visibleStages: ['review', 'invoice'],
    productionTypes: ALL_PRODUCTION,
  },
  {
    key: 'viewer',
    name: 'مشاهدة فقط',
    description: 'يتابع اللوحة دون أي تعديل',
    permissions: ['orders.view', 'files.download'],
    visibleStages: ALL_COLUMNS,
    productionTypes: ALL_PRODUCTION,
  },
];

async function main() {
  console.log('⏳ جارٍ تجهيز البيانات الأولية...');

  // ── الأدوار ──
  const roleIds = new Map<string, string>();
  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      update: {
        name: role.name,
        description: role.description,
        isAdmin: role.isAdmin ?? false,
        isSystem: role.isSystem ?? false,
        permissions: serializeList(role.permissions),
        visibleStages: serializeList(role.visibleStages),
        productionTypes: serializeList(role.productionTypes),
      },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        isAdmin: role.isAdmin ?? false,
        isSystem: role.isSystem ?? false,
        permissions: serializeList(role.permissions),
        visibleStages: serializeList(role.visibleStages),
        productionTypes: serializeList(role.productionTypes),
      },
    });
    roleIds.set(role.key, saved.id);
  }
  console.log(`✅ ${ROLES.length} أدوار`);

  // ── الإعدادات ──
  await prisma.settings.upsert({
    where: { id: 'settings' },
    update: {},
    create: {
      id: 'settings',
      companyName: 'مطبعة نجد',
      orderNumberPrefix: '',
      orderNumberStart: 1,
      nextOrderNumber: 1,
    },
  });
  console.log('✅ الإعدادات');

  // ── المستخدمون ──
  const users: { username: string; name: string; roleKey: string; password: string }[] = [
    { username: 'admin', name: 'المدير العام', roleKey: 'admin', password: 'admin123' },
    { username: 'manager', name: 'أحمد مدير الإنتاج', roleKey: 'production_manager', password: '123456' },
    { username: 'reception', name: 'سارة خدمة العملاء', roleKey: 'reception', password: '123456' },
    { username: 'designer', name: 'محمود المصمم', roleKey: 'designer', password: '123456' },
    { username: 'offset', name: 'عم رمضان (أوفست)', roleKey: 'offset_operator', password: '123456' },
    { username: 'digital', name: 'كريم (ديجيتال)', roleKey: 'digital_operator', password: '123456' },
    { username: 'indoor', name: 'مصطفى (اندور)', roleKey: 'indoor_operator', password: '123456' },
    { username: 'reviewer', name: 'هدى المراجعة', roleKey: 'reviewer', password: '123456' },
    { username: 'accountant', name: 'إيهاب المحاسب', roleKey: 'accountant', password: '123456' },
  ];

  const userIds = new Map<string, string>();
  for (const u of users) {
    const saved = await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, roleId: roleIds.get(u.roleKey)! },
      create: {
        username: u.username,
        name: u.name,
        passwordHash: await bcrypt.hash(u.password, 10),
        roleId: roleIds.get(u.roleKey)!,
      },
    });
    userIds.set(u.username, saved.id);
  }
  console.log(`✅ ${users.length} مستخدمين`);

  // ── بيانات تجريبية ──
  const existingOrders = await prisma.order.count();
  if (existingOrders > 0) {
    console.log('ℹ️  توجد أوردرات بالفعل — تم تخطي البيانات التجريبية');
    return;
  }

  const customers = await Promise.all(
    [
      { name: 'شركة النور للتجارة', phone: '01001234567', company: 'النور' },
      { name: 'مطعم البيت الشامي', phone: '01112223334', company: 'البيت الشامي' },
      { name: 'صيدليات الحياة', phone: '01223334445', company: 'الحياة' },
    ].map((c) => prisma.customer.create({ data: c })),
  );

  const receptionId = userIds.get('reception')!;

  // أوردر فيه أوفست وديجيتال معًا — يوضّح كيف يرى كل عامل بنده فقط
  const order1 = await prisma.order.create({
    data: {
      number: 1,
      title: 'مطبوعات افتتاح الفرع الجديد',
      description: 'كروت شخصية + بروشورات + بانر للواجهة',
      customerName: customers[0].name,
      customerId: customers[0].id,
      stage: 'production',
      priority: 'high',
      dueDate: new Date(Date.now() + 3 * 864e5),
      createdById: receptionId,
      items: {
        create: [
          {
            productionType: 'offset',
            title: 'كروت شخصية',
            quantity: 1000,
            specs: 'مقاس 9×5 سم، كوشيه 350 جرام، سلوفان مط، وجهين',
            status: 'in_progress',
            position: 0,
          },
          {
            productionType: 'digital',
            title: 'بروشور تعريفي',
            quantity: 200,
            specs: 'A4 مطوي 3 طيات، كوشيه 170 جرام، ألوان كاملة',
            status: 'pending',
            position: 0,
          },
          {
            productionType: 'indoor',
            title: 'بانر واجهة المحل',
            quantity: 2,
            specs: 'فلكس 3×1 متر، طباعة عالية الدقة، بأعين معدنية',
            status: 'pending',
            position: 0,
          },
        ],
      },
    },
  });

  const order2 = await prisma.order.create({
    data: {
      number: 2,
      title: 'قوائم طعام جديدة',
      description: 'منيو بتصميم جديد لفروع المطعم الثلاثة',
      customerName: customers[1].name,
      customerId: customers[1].id,
      stage: 'design',
      priority: 'normal',
      dueDate: new Date(Date.now() + 7 * 864e5),
      createdById: receptionId,
      items: {
        create: [
          {
            productionType: 'digital',
            title: 'منيو A3 مطوي',
            quantity: 60,
            specs: 'كوشيه 300 جرام، سلوفان لامع، وجهين',
            position: 0,
          },
        ],
      },
    },
  });

  const order3 = await prisma.order.create({
    data: {
      number: 3,
      title: 'أكياس ورقية وروشتات',
      customerName: customers[2].name,
      customerId: customers[2].id,
      stage: 'orders',
      priority: 'urgent',
      dueDate: new Date(Date.now() + 864e5),
      createdById: receptionId,
      items: {
        create: [
          { productionType: 'offset', title: 'أكياس ورقية', quantity: 5000, specs: 'ورق كرافت 120 جرام، لون واحد', position: 0 },
          { productionType: 'offset', title: 'روشتات طبية', quantity: 10000, specs: 'A5، ورق أبيض 80 جرام، لونين', position: 1 },
        ],
      },
    },
  });

  await prisma.settings.update({
    where: { id: 'settings' },
    data: { nextOrderNumber: 4 },
  });

  await prisma.activityLog.createMany({
    data: [order1, order2, order3].map((o) => ({
      action: 'created',
      orderId: o.id,
      userId: receptionId,
      toStage: o.stage,
      details: `تم إنشاء الأوردر رقم ${o.number}`,
    })),
  });

  console.log('✅ 3 عملاء و 3 أوردرات تجريبية');
}

main()
  .then(async () => {
    console.log('\n🎉 تم التجهيز. سجّل الدخول بـ  admin / admin123');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ فشل التجهيز:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

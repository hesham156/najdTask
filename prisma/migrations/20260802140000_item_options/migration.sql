-- خيارات بند الشغل (اختيار متعدد) مخزَّنة كنص JSON، والقائمة المتاحة
-- تعتمد على productionType وتُعرَّف في src/lib/stages.ts
ALTER TABLE "OrderItem" ADD COLUMN     "options" TEXT NOT NULL DEFAULT '[]';

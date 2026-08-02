-- استهلاك عامل الإنتاج الفعلي: شيتات للطباعة الورقية وأمتار للاندور.
-- الوحدة تُخزَّن مع الرقم حتى يبقى السجل صحيحًا لو تحوّل البند لنوع آخر.
ALTER TABLE "OrderItem" ADD COLUMN     "consumedQty" DOUBLE PRECISION;
ALTER TABLE "OrderItem" ADD COLUMN     "consumedUnit" TEXT;

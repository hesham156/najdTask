-- إلغاء عنوان الأوردر: الأوردر يُعرَف برقمه واسم عميله، والتفاصيل في
-- description وبنود الشغل. العناوين القديمة تُنقل إلى description حتى لا
-- تضيع ملاحظات كُتبت فيها، ثم يُحذف العمود.
UPDATE "Order"
SET "description" = CASE
  WHEN "description" IS NULL OR "description" = '' THEN "title"
  ELSE "title" || E'\n' || "description"
END
WHERE "title" IS NOT NULL AND "title" <> '';

ALTER TABLE "Order" DROP COLUMN "title";

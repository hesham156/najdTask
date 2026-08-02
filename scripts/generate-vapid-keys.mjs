// يولّد زوج مفاتيح VAPID المطلوب لإشعارات Web Push.
//
//   node scripts/generate-vapid-keys.mjs
//
// انسخ الناتج إلى ملف .env محليًا، وإلى متغيّرات البيئة على Railway.
// المفتاح الخاص سرّ: لا تضعه في الكود ولا ترفعه على git.
//
// تنبيه: تغيير المفاتيح لاحقًا يُبطل كل الاشتراكات القائمة، وسيحتاج كل
// مستخدم إلى إعادة تفعيل الإشعارات من جهازه.

import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('');
console.log('# ── إشعارات Web Push ──');
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
console.log('VAPID_SUBJECT="mailto:you@example.com"   # ضع بريدًا حقيقيًا');
console.log('');

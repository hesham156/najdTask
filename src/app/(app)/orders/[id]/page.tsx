import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { OrderDetail } from '@/components/orders/order-detail';

export const metadata = { title: 'تفاصيل الأوردر — نجد' };

export default function OrderPage({ params }: { params: { id: string } }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <Link
          href="/orders"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع لقائمة الأوردرات
        </Link>

        <div className="card p-4 sm:p-5">
          <OrderDetail orderId={params.id} />
        </div>
      </div>
    </div>
  );
}

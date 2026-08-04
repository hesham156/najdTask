'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { Modal } from '@/components/ui';
import { OrderDetail } from './order-detail';

export function OrderDetailModal({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={orderId !== null}
      onClose={onClose}
      title="تفاصيل الأوردر"
      size="lg"
      footer={
        orderId ? (
          <>
            <Link href={`/orders/${orderId}`} className="btn-secondary">
              <ExternalLink className="h-4 w-4" />
              فتح في صفحة كاملة
            </Link>
            <button type="button" className="btn-primary" onClick={onClose}>
              إغلاق
            </button>
          </>
        ) : null
      }
    >
      {orderId ? <OrderDetail orderId={orderId} onDeleted={onClose} /> : null}
    </Modal>
  );
}

import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';

import './globals.css';
import { Providers } from '@/components/providers';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-arabic',
});

export const metadata: Metadata = {
  title: 'نجد — إدارة أوردرات المطبعة',
  description: 'نظام متابعة أوردرات المطبعة من الاستلام حتى التسليم',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'نجد',
  },
  icons: {
    icon: '/icons/icon-192.png',
    // iOS يستخدم مقاس 180×180 تحديدًا لأيقونة الشاشة الرئيسية
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1f41f5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

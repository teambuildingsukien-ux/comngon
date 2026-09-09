import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/providers/toast-provider';
import InstallPrompt from '@/components/InstallPrompt';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
    title: {
        default: 'Cơm Ngon - Phần mềm quản lý suất ăn doanh nghiệp & Bếp ăn thông minh',
        template: '%s | Cơm Ngon'
    },
    description: 'Phần mềm quản lý suất ăn doanh nghiệp Cơm Ngon v8.3. Đặt cơm 1-chạm, trợ lý AI Lili, đồng bộ bếp ăn real-time, tự động cắt cơm khi nghỉ phép, báo cáo kế toán Excel. Tiết kiệm 80% lãng phí suất ăn.',
    keywords: [
        'quản lý suất ăn',
        'phần mềm quản lý suất ăn',
        'phần mềm chấm cơm',
        'đặt cơm doanh nghiệp',
        'quản lý bếp ăn công nghiệp',
        'chấm cơm nhân viên tự động',
        'phần mềm đặt cơm trưa',
        'tiết kiệm chi phí bếp ăn',
        'quản lý suất ăn theo ca kíp',
        'trợ lý AI đặt cơm',
        'dashboard suất ăn real-time',
        'quản lý cơm văn phòng',
        'phần mềm cơm trưa công ty',
        'báo cơm tự động',
        'mcp server cơm ngon'
    ],
    authors: [{ name: 'Cơm Ngon SaaS Team' }],
    creator: 'Cơm Ngon - VietVision',
    publisher: 'Cơm Ngon',
    formatDetection: {
        email: false,
        address: false,
        telephone: false,
    },
    metadataBase: new URL('https://comngon.io.vn'),
    alternates: {
        canonical: '/',
    },
    openGraph: {
        title: 'Cơm Ngon - Hệ thống quản lý suất ăn thông minh cho doanh nghiệp',
        description: 'Giải pháp đặt cơm 1-chạm, trợ lý AI Lili, quản lý ca kíp, đồng bộ bếp ăn trực tiếp. Giảm 80% lãng phí suất ăn.',
        url: 'https://comngon.io.vn',
        siteName: 'Cơm Ngon SaaS',
        locale: 'vi_VN',
        type: 'website',
        images: [{
            url: '/og-image.png',
            width: 1200,
            height: 630,
            alt: 'Cơm Ngon - Phần mềm quản lý suất ăn doanh nghiệp thế hệ mới',
        }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Cơm Ngon - Quản lý suất ăn doanh nghiệp thông minh',
        description: 'Đăng ký 1-click, trợ lý AI Lili, đồng bộ bếp ăn real-time, tiết kiệm 80% chi phí lãng phí.',
        images: ['/og-image.png'],
    },
    icons: {
        icon: [{ url: '/logo.png', type: 'image/png' }],
        apple: [{ url: '/logo.png', type: 'image/png' }],
    },
    manifest: '/manifest.json',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="vi" suppressHydrationWarning>
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                    rel="stylesheet"
                />
                {/* PWA Meta Tags for iOS */}
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="apple-mobile-web-app-title" content="Cơm Ngon" />
                <link rel="apple-touch-icon" href="/logo.png" />
            </head>
            <body className="antialiased font-[family-name:var(--font-work-sans)]" suppressHydrationWarning>
                <ToastProvider>
                    {children}
                </ToastProvider>
                <InstallPrompt />
                <SpeedInsights />
                <Analytics />
            </body>
        </html>
    );
}

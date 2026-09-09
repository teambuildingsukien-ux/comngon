'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const status = searchParams.get('status');
    const message = searchParams.get('message');

    const statusConfig: Record<string, {
        icon: string;
        title: string;
        description: string;
        color: string;
        bgGradient: string;
    }> = {
        success: {
            icon: '✅',
            title: 'Email đã xác nhận!',
            description: 'Tài khoản của bạn đã được xác nhận thành công. Admin hệ thống sẽ duyệt tài khoản trong vòng 24h.',
            color: '#16a34a',
            bgGradient: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)',
        },
        used: {
            icon: '⚠️',
            title: 'Link đã sử dụng',
            description: message || 'Link xác nhận này đã được sử dụng trước đó.',
            color: '#ca8a04',
            bgGradient: 'linear-gradient(135deg, #fef9c3 0%, #fefce8 100%)',
        },
        expired: {
            icon: '⏰',
            title: 'Link đã hết hạn',
            description: message || 'Link xác nhận đã hết hạn. Vui lòng đăng ký lại.',
            color: '#ea580c',
            bgGradient: 'linear-gradient(135deg, #ffedd5 0%, #fff7ed 100%)',
        },
        invalid: {
            icon: '❌',
            title: 'Link không hợp lệ',
            description: message || 'Link xác nhận không hợp lệ hoặc đã bị thay đổi.',
            color: '#dc2626',
            bgGradient: 'linear-gradient(135deg, #fee2e2 0%, #fef2f2 100%)',
        },
        error: {
            icon: '💥',
            title: 'Lỗi hệ thống',
            description: message || 'Đã xảy ra lỗi. Vui lòng thử lại sau.',
            color: '#dc2626',
            bgGradient: 'linear-gradient(135deg, #fee2e2 0%, #fef2f2 100%)',
        },
    };

    const config = statusConfig[status || 'invalid'] || statusConfig.invalid;

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f7f3ef',
            fontFamily: "'Segoe UI', Arial, sans-serif",
            padding: '20px',
        }}>
            <div style={{
                maxWidth: '480px',
                width: '100%',
                background: '#fff',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
                textAlign: 'center',
            }}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #8B4513 0%, #A0522D 100%)',
                    padding: '28px 32px',
                }}>
                    <h1 style={{ color: '#fff', margin: 0, fontSize: '24px' }}>🍚 Cơm Ngon</h1>
                </div>

                {/* Status Card */}
                <div style={{ padding: '40px 32px' }}>
                    <div style={{
                        background: config.bgGradient,
                        borderRadius: '16px',
                        padding: '32px 24px',
                        marginBottom: '24px',
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>{config.icon}</div>
                        <h2 style={{
                            color: config.color,
                            margin: '0 0 12px',
                            fontSize: '22px',
                            fontWeight: 700,
                        }}>
                            {config.title}
                        </h2>
                        <p style={{
                            color: '#666',
                            lineHeight: 1.6,
                            margin: 0,
                            fontSize: '14px',
                        }}>
                            {config.description}
                        </p>
                    </div>

                    {/* Action Button */}
                    <Link href="/dashboard" style={{
                        display: 'inline-block',
                        background: 'linear-gradient(135deg, #8B4513 0%, #A0522D 100%)',
                        color: '#fff',
                        padding: '14px 36px',
                        textDecoration: 'none',
                        borderRadius: '12px',
                        fontSize: '15px',
                        fontWeight: 600,
                        transition: 'transform 0.2s',
                    }}>
                        🔑 Đăng nhập
                    </Link>

                    {status === 'success' && (
                        <p style={{
                            color: '#999',
                            fontSize: '12px',
                            marginTop: '16px',
                        }}>
                            Sau khi admin duyệt, bạn có thể đăng nhập bình thường.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f7f3ef',
            }}>
                <p>Đang xử lý...</p>
            </div>
        }>
            <VerifyEmailContent />
        </Suspense>
    );
}

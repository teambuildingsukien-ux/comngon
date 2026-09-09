'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSGuide, setShowIOSGuide] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Check if dismissed recently (don't show again for 7 days)
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed) {
            const dismissedDate = new Date(dismissed);
            const now = new Date();
            const diffDays = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays < 7) return;
        }

        // Detect iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        // iOS Safari doesn't support beforeinstallprompt
        if (isIOSDevice) {
            // Check if NOT in standalone mode (not yet installed)
            const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator as any).standalone;
            if (!isInStandaloneMode) {
                setTimeout(() => setShowPrompt(true), 3000); // Show after 3s
            }
            return;
        }

        // Android/Desktop: listen for beforeinstallprompt
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setTimeout(() => setShowPrompt(true), 2000); // Show after 2s
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    // Register Service Worker
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {
                // SW registration failed silently
            });
        }
    }, []);

    const handleInstallClick = async () => {
        if (isIOS) {
            setShowIOSGuide(true);
            return;
        }

        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setShowPrompt(false);
            setIsInstalled(true);
        }
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        setShowIOSGuide(false);
        localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
    };

    if (isInstalled || !showPrompt) return null;

    return (
        <>
            {/* Install Banner */}
            <div style={{
                position: 'fixed',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                width: 'calc(100% - 32px)',
                maxWidth: '420px',
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                animation: 'slideUp 0.4s ease-out',
                backdropFilter: 'blur(20px)',
            }}>
                {/* App Icon */}
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                    <img src="/logo.png" alt="Cơm Ngon" width={48} height={48} style={{ display: 'block' }} />
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '14px',
                        lineHeight: '1.3',
                        marginBottom: '2px',
                    }}>
                        📲 Cài Cơm Ngon lên điện thoại
                    </div>
                    <div style={{
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '12px',
                        lineHeight: '1.3',
                    }}>
                        Truy cập nhanh, nhận thông báo nhắc đăng ký
                    </div>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                        onClick={handleDismiss}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.4)',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '4px',
                            lineHeight: 1,
                        }}
                        aria-label="Đóng"
                    >
                        ✕
                    </button>
                    <button
                        onClick={handleInstallClick}
                        style={{
                            background: 'linear-gradient(135deg, #e67e22, #f39c12)',
                            border: 'none',
                            borderRadius: '10px',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '13px',
                            padding: '8px 16px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 8px rgba(230,126,34,0.4)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(230,126,34,0.6)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(230,126,34,0.4)';
                        }}
                    >
                        Cài đặt
                    </button>
                </div>
            </div>

            {/* iOS Guide Modal */}
            {showIOSGuide && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                }} onClick={handleDismiss}>
                    <div style={{
                        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                        borderRadius: '20px 20px 0 0',
                        padding: '24px',
                        width: '100%',
                        maxWidth: '420px',
                        animation: 'slideUp 0.3s ease-out',
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{
                            width: '40px',
                            height: '4px',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '2px',
                            margin: '0 auto 20px',
                        }} />

                        <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>
                            Cài Cơm Ngon lên iPhone
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Step 1 */}
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: 'rgba(59,130,246,0.2)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    fontSize: '18px',
                                }}>1</div>
                                <div>
                                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                        Nhấn nút Chia sẻ
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                                        Biểu tượng <span style={{ fontSize: '16px' }}>⬆️</span> ở thanh dưới Safari
                                    </div>
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: 'rgba(59,130,246,0.2)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    fontSize: '18px',
                                }}>2</div>
                                <div>
                                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                        Chọn &quot;Thêm vào MH chính&quot;
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                                        Cuộn xuống tìm <span style={{ fontSize: '16px' }}>➕</span> Add to Home Screen
                                    </div>
                                </div>
                            </div>

                            {/* Step 3 */}
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: 'rgba(59,130,246,0.2)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    fontSize: '18px',
                                }}>3</div>
                                <div>
                                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                        Nhấn &quot;Thêm&quot;
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                                        App sẽ xuất hiện trên màn hình chính 🎉
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleDismiss}
                            style={{
                                width: '100%',
                                marginTop: '20px',
                                padding: '14px',
                                background: 'linear-gradient(135deg, #e67e22, #f39c12)',
                                border: 'none',
                                borderRadius: '12px',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '15px',
                                cursor: 'pointer',
                            }}
                        >
                            Đã hiểu!
                        </button>
                    </div>
                </div>
            )}

            {/* Animation keyframes */}
            <style>{`
        @keyframes slideUp {
          from { transform: translateY(100px) translateX(-50%); opacity: 0; }
          to { transform: translateY(0) translateX(-50%); opacity: 1; }
        }
      `}</style>
        </>
    );
}

'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

/**
 * PushNotificationPrompt — Shows a one-time popup asking users to enable push notifications
 * 
 * Renders a banner at the top of the dashboard that:
 * 1. Checks if push notifications are supported
 * 2. Asks user for permission
 * 3. Subscribes to push via service worker
 * 4. Sends subscription to server
 */
export default function PushNotificationPrompt() {
    const [showPrompt, setShowPrompt] = useState(false);
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [status, setStatus] = useState<'idle' | 'granted' | 'denied' | 'error'>('idle');

    useEffect(() => {
        const checkAndShowPrompt = async () => {
            // Check if push is supported
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                return; // Browser doesn't support push
            }

            const dismissed = localStorage.getItem('push_prompt_dismissed');
            const subscribed = localStorage.getItem('push_subscribed');

            // If previously subscribed, verify subscription is still valid
            if (subscribed) {
                try {
                    const registration = await navigator.serviceWorker.ready;
                    const existingSub = await registration.pushManager.getSubscription();

                    if (!existingSub) {
                        // Subscription gone (VAPID key changed, browser cleared, etc.)
                        // Clear old flag and re-show prompt
                        localStorage.removeItem('push_subscribed');
                        console.log('[Push] Subscription expired, re-showing prompt');
                    } else {
                        // Still subscribed, try to re-register with server silently
                        subscribeToPush(true);
                        return;
                    }
                } catch (err) {
                    console.warn('[Push] Error checking subscription:', err);
                    localStorage.removeItem('push_subscribed');
                }
            }

            // If dismissed more than 7 days ago, show again
            if (dismissed) {
                const dismissedAt = parseInt(dismissed);
                if (!isNaN(dismissedAt) && Date.now() - dismissedAt > 7 * 24 * 60 * 60 * 1000) {
                    localStorage.removeItem('push_prompt_dismissed');
                } else {
                    return; // Still within dismiss period
                }
            }

            // Check current permission
            if (Notification.permission === 'granted') {
                // Already granted but not subscribed — try to subscribe silently
                subscribeToPush(true);
                return;
            }

            if (Notification.permission === 'denied') {
                return; // User previously denied
            }

            // Show prompt after 3 seconds
            const timer = setTimeout(() => setShowPrompt(true), 3000);
            return () => clearTimeout(timer);
        };

        checkAndShowPrompt();
    }, []);

    const subscribeToPush = async (silent = false) => {
        try {
            setIsSubscribing(true);

            // Get service worker registration
            const registration = await navigator.serviceWorker.ready;

            // Check existing subscription
            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                // Subscribe new
                const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                if (!vapidKey) {
                    console.error('VAPID key not found');
                    return;
                }

                // Convert VAPID key to Uint8Array
                const urlBase64ToUint8Array = (base64String: string) => {
                    const padding = '='.repeat((4 - base64String.length % 4) % 4);
                    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                    const rawData = window.atob(base64);
                    const outputArray = new Uint8Array(rawData.length);
                    for (let i = 0; i < rawData.length; i++) {
                        outputArray[i] = rawData.charCodeAt(i);
                    }
                    return outputArray;
                };

                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey)
                });
            }

            // Send subscription to server
            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    deviceInfo: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
                })
            });

            if (res.ok) {
                setStatus('granted');
                localStorage.setItem('push_subscribed', 'true');
                if (!silent) {
                    setTimeout(() => setShowPrompt(false), 2000);
                }
            } else {
                throw new Error('Subscribe API failed');
            }

        } catch (err: any) {
            console.error('Push subscribe failed:', err);
            if (!silent) setStatus('error');
        } finally {
            setIsSubscribing(false);
        }
    };

    const handleAllow = async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            await subscribeToPush();
        } else if (permission === 'denied') {
            setStatus('denied');
            localStorage.setItem('push_prompt_dismissed', 'true');
            setTimeout(() => setShowPrompt(false), 3000);
        }
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('push_prompt_dismissed', Date.now().toString());
    };

    if (!showPrompt) return null;

    return (
        <div className="mb-4 md:mb-6 animate-in slide-in-from-top fade-in duration-500">
            <div className="bg-gradient-to-r from-[#B24700] to-[#D4690A] rounded-2xl p-4 shadow-lg text-white relative overflow-hidden">
                {/* Background pattern */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

                <div className="relative flex items-start gap-3">
                    {/* Bell icon */}
                    <div className="size-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon name="notifications_active" className="text-[22px] text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                        {status === 'idle' && (
                            <>
                                <h3 className="font-bold text-sm mb-1">📱 Nhận thông báo trên điện thoại</h3>
                                <p className="text-white/80 text-xs mb-3 leading-relaxed">
                                    Bật thông báo đẩy để nhận tin nhắn ngay lập tức từ quản trị viên, kể cả khi không mở app.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAllow}
                                        disabled={isSubscribing}
                                        className="px-4 py-1.5 bg-white text-[#B24700] rounded-lg text-xs font-bold hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                        {isSubscribing ? (
                                            <Icon name="progress_activity" className="text-[14px] animate-spin" />
                                        ) : (
                                            <Icon name="check" className="text-[14px]" />
                                        )}
                                        {isSubscribing ? 'Đang đăng ký...' : 'Cho phép'}
                                    </button>
                                    <button
                                        onClick={handleDismiss}
                                        className="px-4 py-1.5 bg-white/20 text-white rounded-lg text-xs font-semibold hover:bg-white/30 transition-colors"
                                    >
                                        Để sau
                                    </button>
                                </div>
                            </>
                        )}

                        {status === 'granted' && (
                            <div className="flex items-center gap-2">
                                <Icon name="check_circle" className="text-[20px] text-green-300" />
                                <span className="font-bold text-sm">Đã bật thông báo đẩy! 🎉</span>
                            </div>
                        )}

                        {status === 'denied' && (
                            <div className="flex items-center gap-2">
                                <Icon name="block" className="text-[20px] text-red-300" />
                                <span className="text-sm">Bạn đã từ chối. Có thể bật lại trong cài đặt trình duyệt.</span>
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="flex items-center gap-2">
                                <Icon name="error" className="text-[20px] text-yellow-300" />
                                <span className="text-sm">Lỗi đăng ký. Vui lòng thử lại sau.</span>
                            </div>
                        )}
                    </div>

                    {/* Close button */}
                    {status === 'idle' && (
                        <button
                            onClick={handleDismiss}
                            className="size-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
                        >
                            <Icon name="close" className="text-[16px] text-white/70" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

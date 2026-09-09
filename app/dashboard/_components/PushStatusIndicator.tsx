'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

/**
 * PushStatusIndicator — Small bell icon showing push notification status
 * 🔔 green = subscribed, 🔕 red = not subscribed, click to re-subscribe
 */
export default function PushStatusIndicator() {
    const [status, setStatus] = useState<'checking' | 'subscribed' | 'not_subscribed' | 'unsupported'>('checking');
    const [showTooltip, setShowTooltip] = useState(false);

    useEffect(() => {
        checkPushStatus();
    }, []);

    const checkPushStatus = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setStatus('unsupported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setStatus(subscription ? 'subscribed' : 'not_subscribed');
        } catch {
            setStatus('not_subscribed');
        }
    };

    const handleClick = async () => {
        if (status === 'subscribed') {
            setShowTooltip(true);
            setTimeout(() => setShowTooltip(false), 3000);
            return;
        }

        if (status === 'not_subscribed') {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    const registration = await navigator.serviceWorker.ready;
                    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                    if (!vapidKey) return;

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

                    const subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidKey)
                    });

                    const res = await fetch('/api/push/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            subscription: subscription.toJSON(),
                            deviceInfo: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
                        })
                    });

                    if (res.ok) {
                        setStatus('subscribed');
                        localStorage.setItem('push_subscribed', 'true');
                        setShowTooltip(true);
                        setTimeout(() => setShowTooltip(false), 3000);
                    }
                }
            } catch (err) {
                console.error('Push re-subscribe failed:', err);
            }
        }
    };

    const getConfig = () => {
        switch (status) {
            case 'subscribed':
                return { icon: 'notifications_active', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/30', tooltip: '✅ Thông báo đẩy đang bật' };
            case 'not_subscribed':
                return { icon: 'notifications_off', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/30', tooltip: '❌ Chưa bật thông báo đẩy — bấm để bật' };
            case 'unsupported':
                return { icon: 'notifications_paused', color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900/30', tooltip: 'Trình duyệt không hỗ trợ push' };
            default:
                return { icon: 'notifications', color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900/30', tooltip: 'Đang kiểm tra...' };
        }
    };

    const config = getConfig();

    return (
        <div className="relative inline-flex">
            <button
                onClick={handleClick}
                className={`size-9 md:size-10 ${config.bg} rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95`}
                title={config.tooltip}
            >
                <Icon name={config.icon} className={`text-[20px] md:text-[22px] ${config.color}`} />
                {status === 'not_subscribed' && (
                    <span className="absolute -top-1 -right-1 size-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
                )}
            </button>

            {/* Tooltip */}
            {showTooltip && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg whitespace-nowrap z-50 shadow-lg">
                    {config.tooltip}
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-2 bg-slate-900 dark:bg-slate-700 rotate-45" />
                </div>
            )}
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useRealtimeNotifications } from '@/hooks/use-realtime-notifications';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface NotificationInboxProps {
    tenantId?: string | null;
    userId?: string | null;
}

interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: string;
    target_audience: string;
    created_at: string;
    is_active: boolean;
    is_read?: boolean;
}

/**
 * NotificationInbox — 🔔 Bell icon + Modal Popup kiểu hộp thư Email
 * 
 * ✅ v7.0: Dùng Supabase Realtime thay vì polling 60s
 * - WebSocket subscription cho INSERT/UPDATE trên notifications
 * - Tự động cập nhật khi có thông báo mới (< 1s)
 * - Giảm ~99% API requests so với polling
 */
export default function NotificationInbox({ tenantId = null, userId = null }: NotificationInboxProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

    // 🔔 Realtime hook — thay thế polling setInterval
    const {
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllRead,
    } = useRealtimeNotifications({
        tenantId,
        userId,
        enabled: true,
    });

    // Lock body scroll when modal open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);




    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return 'Vừa xong';
        if (diffMin < 60) return `${diffMin} phút trước`;
        if (diffHr < 24) return `${diffHr} giờ trước`;
        if (diffDay < 7) return `${diffDay} ngày trước`;
        return date.toLocaleDateString('vi-VN');
    };

    const formatFullDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('vi-VN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'urgent': return { icon: 'campaign', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', label: 'Khẩn cấp', labelColor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
            case 'reminder': return { icon: 'alarm', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', label: 'Nhắc nhở', labelColor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
            case 'info': return { icon: 'info', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', label: 'Thông tin', labelColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
            default: return { icon: 'notifications', color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-900/20', label: 'Thông báo', labelColor: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' };
        }
    };

    const handleSelectNotification = (n: AppNotification) => {
        setSelectedNotification(n);
        if (!n.is_read) markAsRead(n.id);
    };

    const handleClose = () => {
        setIsOpen(false);
        setSelectedNotification(null);
    };

    return (
        <>
            {/* Bell Button */}
            <button
                onClick={() => {
                    setIsOpen(true);
                    fetchNotifications();
                }}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                title="Thông báo"
            >
                <Icon name="notifications" className={`text-[24px] ${unreadCount > 0 ? 'text-[#c04b00]' : 'text-[#606e8a]'}`} />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Modal Overlay */}
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={handleClose}
                    />

                    {/* Modal Content */}
                    <div className="relative w-full h-full sm:w-[90vw] sm:max-w-[720px] sm:h-[80vh] sm:max-h-[600px] bg-white dark:bg-slate-900 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden sm:m-4">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#dbdfe6] dark:border-slate-700 bg-gradient-to-r from-[#c04b00]/5 to-transparent flex-shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="size-9 rounded-xl bg-[#c04b00]/10 flex items-center justify-center">
                                    <Icon name="mail" className="text-[#c04b00] text-[20px]" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-base dark:text-white">Hộp thư thông báo</h2>
                                    <p className="text-[11px] text-[#8b95a6]">
                                        {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Tất cả đã đọc'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllRead}
                                        className="text-xs text-[#c04b00] hover:underline font-semibold hidden sm:block"
                                    >
                                        Đọc tất cả
                                    </button>
                                )}
                                <button
                                    onClick={handleClose}
                                    className="size-8 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
                                >
                                    <Icon name="close" className="text-[20px] text-[#606e8a]" />
                                </button>
                            </div>
                        </div>

                        {/* Body — 2 panels on desktop, single panel on mobile */}
                        <div className="flex-1 flex overflow-hidden min-h-0">

                            {/* Left Panel — Notification List */}
                            <div className={`${selectedNotification ? 'hidden sm:flex' : 'flex'} flex-col w-full sm:w-[280px] sm:min-w-[280px] border-r-0 sm:border-r border-[#dbdfe6] dark:border-slate-700 overflow-hidden`}>
                                {/* Mobile: Mark all read */}
                                {unreadCount > 0 && (
                                    <div className="flex items-center justify-between px-4 py-2 border-b border-[#f5f6f8] dark:border-slate-800 sm:hidden">
                                        <span className="text-xs text-[#8b95a6]">{notifications.length} thông báo</span>
                                        <button onClick={markAllRead} className="text-xs text-[#c04b00] font-semibold">
                                            Đọc tất cả
                                        </button>
                                    </div>
                                )}

                                {/* List */}
                                <div className="flex-1 overflow-y-auto">
                                    {loading && notifications.length === 0 ? (
                                        <div className="flex items-center justify-center py-16">
                                            <Icon name="progress_activity" className="text-[28px] text-[#606e8a] animate-spin" />
                                        </div>
                                    ) : notifications.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                                            <div className="size-16 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                                                <Icon name="notifications_none" className="text-[32px] text-[#dbdfe6]" />
                                            </div>
                                            <p className="text-sm text-[#606e8a] font-medium">Chưa có thông báo</p>
                                            <p className="text-xs text-[#8b95a6] mt-1">Khi có thông báo mới sẽ hiển thị ở đây</p>
                                        </div>
                                    ) : (
                                        notifications.map(n => {
                                            const typeInfo = getTypeIcon(n.type);
                                            const isSelected = selectedNotification?.id === n.id;
                                            return (
                                                <button
                                                    key={n.id}
                                                    onClick={() => handleSelectNotification(n)}
                                                    className={`w-full text-left px-4 py-3 border-b border-[#f5f6f8] dark:border-slate-800 transition-all
                                                        ${isSelected ? 'bg-[#c04b00]/5 dark:bg-[#c04b00]/10 border-l-[3px] border-l-[#c04b00]' : 'border-l-[3px] border-l-transparent hover:bg-gray-50 dark:hover:bg-slate-800/50'}
                                                        ${!n.is_read ? 'bg-orange-50/40 dark:bg-orange-900/5' : ''}
                                                    `}
                                                >
                                                    <div className="flex gap-2.5">
                                                        <div className={`size-8 rounded-lg ${typeInfo.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                                            <Icon name={typeInfo.icon} className={`${typeInfo.color} text-[16px]`} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                                <span className={`text-[13px] font-bold truncate ${!n.is_read ? 'text-[#111318] dark:text-white' : 'text-[#606e8a]'}`}>
                                                                    {n.title}
                                                                </span>
                                                                {!n.is_read && (
                                                                    <span className="size-2 rounded-full bg-[#c04b00] flex-shrink-0" />
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] text-[#8b95a6] line-clamp-1">
                                                                {n.message}
                                                            </p>
                                                            <span className="text-[10px] text-[#b0b8c6]">
                                                                {formatTime(n.created_at)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Right Panel — Notification Detail */}
                            <div className={`${selectedNotification ? 'flex' : 'hidden sm:flex'} flex-col flex-1 overflow-hidden`}>
                                {selectedNotification ? (
                                    <>
                                        {/* Mobile back button */}
                                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#f5f6f8] dark:border-slate-800 sm:hidden">
                                            <button
                                                onClick={() => setSelectedNotification(null)}
                                                className="size-8 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center"
                                            >
                                                <Icon name="arrow_back" className="text-[20px] text-[#606e8a]" />
                                            </button>
                                            <span className="text-sm text-[#606e8a] font-medium">Quay lại</span>
                                        </div>

                                        {/* Detail content */}
                                        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                                            {/* Type badge + time */}
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${getTypeIcon(selectedNotification.type).labelColor}`}>
                                                    {getTypeIcon(selectedNotification.type).label}
                                                </span>
                                                <span className="text-[11px] text-[#8b95a6]">
                                                    {formatFullDate(selectedNotification.created_at)}
                                                </span>
                                            </div>

                                            {/* Title */}
                                            <h3 className="text-lg sm:text-xl font-bold text-[#111318] dark:text-white mb-4 leading-snug">
                                                {selectedNotification.title}
                                            </h3>

                                            {/* Divider */}
                                            <div className="h-px bg-[#dbdfe6] dark:bg-slate-700 mb-4" />

                                            {/* Message body */}
                                            <div className="text-sm text-[#3c4257] dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                                {selectedNotification.message}
                                            </div>

                                            {/* Target audience */}
                                            <div className="mt-6 pt-4 border-t border-[#f5f6f8] dark:border-slate-800">
                                                <div className="flex items-center gap-1.5 text-[11px] text-[#8b95a6]">
                                                    <Icon name="group" className="text-[14px]" />
                                                    <span>Gửi đến: {selectedNotification.target_audience === 'all' ? 'Tất cả' : selectedNotification.target_audience}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    /* Empty state — desktop only */
                                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                                        <div className="size-20 rounded-full bg-gradient-to-br from-[#c04b00]/10 to-orange-50 dark:from-[#c04b00]/5 dark:to-slate-800 flex items-center justify-center mb-4">
                                            <Icon name="mark_email_read" className="text-[36px] text-[#c04b00]/40" />
                                        </div>
                                        <p className="text-sm text-[#606e8a] font-medium">Chọn thông báo để xem chi tiết</p>
                                        <p className="text-xs text-[#b0b8c6] mt-1">Bấm vào thông báo bên trái để đọc nội dung</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

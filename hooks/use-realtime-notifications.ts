'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * 🔔 useRealtimeNotifications — Supabase Realtime Hook
 * 
 * Thay thế polling 60s bằng WebSocket subscription.
 * Subscribe vào:
 *   - notifications (INSERT) → thông báo mới
 *   - notification_reads (INSERT) → đánh dấu đã đọc (từ tab/device khác)
 * 
 * RLS tự động filter theo tenant_id (user chỉ thấy notifications cùng tenant).
 * 
 * @param tenantId - tenant_id của user hiện tại
 * @param userId - user id hiện tại (để filter notification_reads)
 * @param onNewNotification - callback khi có notification mới
 * @param onNotificationRead - callback khi notification được đọc (từ device khác)
 */

interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    target_audience: string;
    target_id: string | null;
    created_at: string;
    is_active: boolean;
    is_read?: boolean;
}

interface UseRealtimeNotificationsOptions {
    tenantId: string | null;
    userId: string | null;
    enabled?: boolean;
    onNewNotification?: (notification: Notification) => void;
    onNotificationRead?: (notificationId: string) => void;
}

interface UseRealtimeNotificationsReturn {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    fetchNotifications: () => Promise<void>;
    markAsRead: (notificationId: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    isConnected: boolean;
}

export function useRealtimeNotifications({
    tenantId,
    userId,
    enabled = true,
    onNewNotification,
    onNotificationRead,
}: UseRealtimeNotificationsOptions): UseRealtimeNotificationsReturn {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    // Initial fetch — lấy data lần đầu qua API (giữ logic filter audience phía server)
    const fetchNotifications = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/notifications');
            if (res.ok) {
                const result = await res.json();
                setNotifications(result.data || []);
                setUnreadCount(result.unread_count || 0);
            }
        } catch (err) {
            console.error('[Realtime] Error fetching notifications:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Mark single as read
    const markAsRead = useCallback(async (notificationId: string) => {
        try {
            await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_read', notification_id: notificationId })
            });
            setNotifications(prev => prev.map(n =>
                n.id === notificationId ? { ...n, is_read: true } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('[Realtime] Error marking read:', err);
        }
    }, []);

    // Mark all as read
    const markAllRead = useCallback(async () => {
        try {
            await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_all_read' })
            });
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('[Realtime] Error marking all read:', err);
        }
    }, []);

    // Subscribe to Realtime changes
    useEffect(() => {
        if (!tenantId || !userId || !enabled) return;

        const supabase = createClient();

        const channel = supabase
            .channel(`notifications:${tenantId}`, {
                config: { broadcast: { self: true } }
            })
            // Listen for new notifications INSERT
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `tenant_id=eq.${tenantId}`,
                },
                (payload) => {
                    const newNotif = payload.new as Notification;
                    // Re-fetch to get proper audience filtering from server
                    // (Realtime chỉ filter theo tenant_id, audience filtering cần logic server)
                    fetchNotifications();
                    onNewNotification?.(newNotif);
                }
            )
            // Listen for notification_reads INSERT (from other tabs/devices)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notification_reads',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const read = payload.new as { notification_id: string };
                    setNotifications(prev => prev.map(n =>
                        n.id === read.notification_id ? { ...n, is_read: true } : n
                    ));
                    setUnreadCount(prev => Math.max(0, prev - 1));
                    onNotificationRead?.(read.notification_id);
                }
            )
            // Listen for notification deactivation (UPDATE is_active = false)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `tenant_id=eq.${tenantId}`,
                },
                (payload) => {
                    const updated = payload.new as Notification;
                    if (!updated.is_active) {
                        // Notification deactivated → remove from list
                        setNotifications(prev => prev.filter(n => n.id !== updated.id));
                        setUnreadCount(prev => {
                            const wasUnread = notifications.find(n => n.id === updated.id && !n.is_read);
                            return wasUnread ? Math.max(0, prev - 1) : prev;
                        });
                    }
                }
            )
            .subscribe((status) => {
                setIsConnected(status === 'SUBSCRIBED');
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] ✅ Connected to notifications channel');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('[Realtime] ❌ Channel error, will retry...');
                }
            });

        channelRef.current = channel;

        // Initial fetch
        fetchNotifications();

        // Cleanup
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
                setIsConnected(false);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, userId, enabled]);

    return {
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllRead,
        isConnected,
    };
}

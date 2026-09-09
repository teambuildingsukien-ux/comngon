'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Material Symbol Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface UrgentNotificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    unregisteredCount: number;
}

/**
 * Urgent Notification Modal
 * Admin gửi thông báo khẩn cấp cho employees
 * 
 * Features:
 * - Target audience selection (All/Employees/Kitchen/Specific Group)
 * - Rich text message input
 * - Preview before sending
 * - Success/error feedback
 */
export default function UrgentNotificationModal({
    isOpen,
    onClose,
    unregisteredCount
}: UrgentNotificationModalProps) {
    const supabase = createClient();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [targetAudience, setTargetAudience] = useState<'all' | 'employees' | 'kitchen' | 'group'>('employees');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Fetch groups for dropdown
    useEffect(() => {
        if (isOpen) {
            fetchGroups();
            // Set default message
            setMessage(`Nhắc nhở: Hiện có ${unregisteredCount} nhân viên chưa đăng ký suất ăn cho ngày mai. Vui lòng đăng ký trước 3PM hôm nay.`);
        }
    }, [isOpen, unregisteredCount]);

    const fetchGroups = async () => {
        const { data, error } = await supabase
            .from('groups')
            .select('id, name')
            .order('name');

        if (data) {
            setGroups(data);
        }
        if (error) {
            console.error('Error fetching groups:', error);
        }
    };

    const handleSend = async () => {
        // Validation
        if (!title.trim()) {
            setError('Vui lòng nhập tiêu đề thông báo');
            return;
        }
        if (!message.trim()) {
            setError('Vui lòng nhập nội dung thông báo');
            return;
        }
        if (targetAudience === 'group' && !selectedGroup) {
            setError('Vui lòng chọn nhóm nhận thông báo');
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Get user's tenant_id
            const { data: userProfile } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', user.id)
                .single();

            if (!userProfile) throw new Error('User profile not found');

            // Insert notification
            const { error: insertError } = await supabase
                .from('notifications')
                .insert({
                    tenant_id: userProfile.tenant_id,
                    title: title.trim(),
                    message: message.trim(),
                    type: 'urgent',
                    target_audience: targetAudience,
                    target_id: targetAudience === 'group' ? selectedGroup : null,
                    created_by: user.id,
                    is_active: true
                });

            if (insertError) throw insertError;

            // Log activity
            await supabase
                .from('activity_logs')
                .insert({
                    tenant_id: userProfile.tenant_id,  // REQUIRED for RLS
                    action: 'SEND_URGENT_NOTIFICATION',
                    performed_by: user.id,
                    target_type: 'notification',
                    details: {
                        title,
                        target_audience: targetAudience,
                        target_id: targetAudience === 'group' ? selectedGroup : null
                    }
                });

            // 🔔 Send push notifications to subscribers
            // AUDIT-GUARD: Await để biết kết quả push, log ra console
            try {
                const pushRes = await fetch('/api/push/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title.trim(),
                        message: message.trim(),
                        target_audience: targetAudience,
                        target_id: targetAudience === 'group' ? selectedGroup : null
                    })
                });
                const pushData = await pushRes.json();
                console.log('[Push] Result:', pushData);
            } catch (err) {
                console.warn('[Push] Send failed (non-critical):', err);
            }

            // Success!
            setSuccess(true);
            setTimeout(() => {
                handleClose();
            }, 2000);

        } catch (err: any) {
            console.error('Error sending notification:', err);
            setError(err.message || 'Không thể gửi thông báo. Vui lòng thử lại.');
        } finally {
            setIsSending(false);
        }
    };

    const handleClose = () => {
        setTitle('');
        setMessage('');
        setTargetAudience('employees');
        setSelectedGroup('');
        setError(null);
        setSuccess(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                            <Icon name="campaign" className="text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold dark:text-white">Gửi Thông Báo Khẩn</h2>
                            <p className="text-sm text-[#606e8a]">Nhắc nhở nhân viên đăng ký suất ăn</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <Icon name="close" className="text-[#606e8a]" />
                    </button>
                </div>

                {/* Success Message */}
                {success && (
                    <div className="mx-6 mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
                        <Icon name="check_circle" className="text-green-600 dark:text-green-400" />
                        <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                            Thông báo đã được gửi thành công!
                        </span>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="mx-6 mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                        <Icon name="error" className="text-red-600 dark:text-red-400" />
                        <span className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</span>
                    </div>
                )}

                {/* Form */}
                <div className="p-6 space-y-6">
                    {/* Warning Stats */}
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-lg">
                        <div className="flex items-center gap-3 mb-2">
                            <Icon name="warning" className="text-orange-500" />
                            <span className="text-sm font-bold text-orange-700 dark:text-orange-400">
                                {unregisteredCount} nhân viên chưa đăng ký
                            </span>
                        </div>
                        <p className="text-xs text-orange-600 dark:text-orange-300">
                            Gửi thông báo để nhắc nhở họ đăng ký trước deadline.
                        </p>
                    </div>

                    {/* Title Input */}
                    <div>
                        <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                            Tiêu đề thông báo *
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                            placeholder="VD: Nhắc nhở đăng ký suất ăn"
                            maxLength={100}
                        />
                        <p className="text-xs text-[#606e8a] mt-1">{title.length}/100 ký tự</p>
                    </div>

                    {/* Target Audience */}
                    <div>
                        <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                            Đối tượng nhận *
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setTargetAudience('all')}
                                className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${targetAudience === 'all'
                                    ? 'border-[#c04b00] bg-[#c04b00]/10 text-[#c04b00]'
                                    : 'border-[#dbdfe6] dark:border-slate-700 text-[#606e8a] hover:border-[#c04b00]/50'
                                    }`}
                            >
                                <Icon name="groups" className="block mb-1" />
                                Tất cả
                            </button>
                            <button
                                type="button"
                                onClick={() => setTargetAudience('employees')}
                                className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${targetAudience === 'employees'
                                    ? 'border-[#c04b00] bg-[#c04b00]/10 text-[#c04b00]'
                                    : 'border-[#dbdfe6] dark:border-slate-700 text-[#606e8a] hover:border-[#c04b00]/50'
                                    }`}
                            >
                                <Icon name="badge" className="block mb-1" />
                                Nhân viên
                            </button>
                            <button
                                type="button"
                                onClick={() => setTargetAudience('kitchen')}
                                className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${targetAudience === 'kitchen'
                                    ? 'border-[#c04b00] bg-[#c04b00]/10 text-[#c04b00]'
                                    : 'border-[#dbdfe6] dark:border-slate-700 text-[#606e8a] hover:border-[#c04b00]/50'
                                    }`}
                            >
                                <Icon name="restaurant" className="block mb-1" />
                                Bếp
                            </button>
                            <button
                                type="button"
                                onClick={() => setTargetAudience('group')}
                                className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${targetAudience === 'group'
                                    ? 'border-[#c04b00] bg-[#c04b00]/10 text-[#c04b00]'
                                    : 'border-[#dbdfe6] dark:border-slate-700 text-[#606e8a] hover:border-[#c04b00]/50'
                                    }`}
                            >
                                <Icon name="workspaces" className="block mb-1" />
                                Nhóm
                            </button>
                        </div>
                    </div>

                    {/* Group Selection (if target is group) */}
                    {targetAudience === 'group' && (
                        <div>
                            <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                                Chọn nhóm *
                            </label>
                            <select
                                value={selectedGroup}
                                onChange={(e) => setSelectedGroup(e.target.value)}
                                className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-[#c04b00] dark:text-white"
                            >
                                <option value="">-- Chọn nhóm --</option>
                                {groups.map(group => (
                                    <option key={group.id} value={group.id}>{group.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Message Input */}
                    <div>
                        <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">
                            Nội dung thông báo *
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full p-3 rounded-lg bg-[#f5f6f8] dark:bg-slate-800 border-none text-sm min-h-[120px] focus:ring-2 focus:ring-[#c04b00] dark:text-white resize-none"
                            placeholder="Nhập nội dung thông báo..."
                            maxLength={500}
                        />
                        <p className="text-xs text-[#606e8a] mt-1">{message.length}/500 ký tự</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[#dbdfe6] dark:border-slate-800 flex gap-3">
                    <button
                        onClick={handleClose}
                        disabled={isSending}
                        className="flex-1 py-3 px-4 rounded-lg border-2 border-[#dbdfe6] dark:border-slate-700 text-[#606e8a] font-semibold text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={isSending || !title.trim() || !message.trim()}
                        className="flex-1 py-3 px-4 rounded-lg bg-[#c04b00] text-white font-bold text-sm shadow-lg shadow-[#c04b00]/25 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSending ? (
                            <>
                                <Icon name="progress_activity" className="text-[20px] animate-spin" />
                                Đang gửi...
                            </>
                        ) : (
                            <>
                                <Icon name="send" className="text-[20px]" />
                                Gửi thông báo
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/providers/toast-provider';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Announcement {
    id: string;
    content: string;
    active: boolean;
    created_at: string;
}

interface AnnouncementsHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AnnouncementsHistoryModal({ isOpen, onClose }: AnnouncementsHistoryModalProps) {
    const supabase = createClient();
    const { showToast } = useToast();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newContent, setNewContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchAnnouncements();
        }
    }, [isOpen]);

    const fetchAnnouncements = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) {
            setAnnouncements(data);
        }
        setIsLoading(false);
    };

    const handleAdd = async () => {
        if (!newContent.trim()) return;
        setIsSubmitting(true);

        // Get current user and tenant_id
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showToast('Vui lòng đăng nhập lại', 'error');
            setIsSubmitting(false);
            return;
        }

        const { data: userProfile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!userProfile) {
            showToast('Không tìm thấy thông tin người dùng', 'error');
            setIsSubmitting(false);
            return;
        }

        const { error } = await supabase
            .from('announcements')
            .insert({
                tenant_id: userProfile.tenant_id,  // REQUIRED for RLS
                content: newContent.trim(),
                active: true
            });

        if (error) {
            showToast('Lỗi thêm thông báo', 'error');
        } else {
            // ⚠️ v6.1.5 AUDIT: Log tạo thông báo
            await supabase.from('activity_logs').insert({
                tenant_id: userProfile.tenant_id,
                user_id: user.id,
                action: 'create_announcement',
                details: JSON.stringify({ content: newContent.trim().slice(0, 100) }),
            });
            showToast('Đã thêm thông báo mới', 'success');
            setNewContent('');
            fetchAnnouncements();
        }
        setIsSubmitting(false);
    };

    const handleToggle = async (id: string, currentStatus: boolean) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = user ? await supabase.from('users').select('tenant_id').eq('id', user.id).single() : { data: null };

        const { error } = await supabase
            .from('announcements')
            .update({ active: !currentStatus })
            .eq('id', id);

        if (error) {
            showToast('Lỗi cập nhật trạng thái', 'error');
        } else {
            // ⚠️ v6.1.5 AUDIT: Log toggle thông báo
            if (user && profile?.tenant_id) {
                await supabase.from('activity_logs').insert({
                    tenant_id: profile.tenant_id,
                    user_id: user.id,
                    action: 'toggle_announcement',
                    details: JSON.stringify({ announcement_id: id, new_active: !currentStatus }),
                });
            }
            fetchAnnouncements();
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa thông báo này?')) return;

        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = user ? await supabase.from('users').select('tenant_id').eq('id', user.id).single() : { data: null };

        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);

        if (error) {
            showToast('Lỗi xóa thông báo', 'error');
        } else {
            // ⚠️ v6.1.5 AUDIT: Log xóa thông báo
            if (user && profile?.tenant_id) {
                await supabase.from('activity_logs').insert({
                    tenant_id: profile.tenant_id,
                    user_id: user.id,
                    action: 'delete_announcement',
                    details: JSON.stringify({ announcement_id: id }),
                });
            }
            showToast('Đã xóa thông báo', 'success');
            fetchAnnouncements();
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('vi-VN');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-[#dbdfe6] dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                            <Icon name="campaign" className="text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold dark:text-white">Quản lý Thông báo chạy (Marquee)</h2>
                            <p className="text-sm text-[#606e8a]">Các thông báo hiển thị trên màn hình nhân viên</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <Icon name="close" className="text-[#606e8a]" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {/* Add New Section */}
                    <div className="p-6 bg-orange-50 dark:bg-orange-900/10 border-b border-[#dbdfe6] dark:border-slate-800">
                        <label className="block text-sm font-bold text-[#111318] dark:text-white mb-2">Thêm thông báo mới</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                placeholder="Nhập nội dung thông báo chạy..."
                                className="flex-1 px-4 py-2 rounded-lg border border-[#dbdfe6] dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            <button
                                onClick={handleAdd}
                                disabled={isSubmitting || !newContent.trim()}
                                className="px-4 py-2 bg-[#c04b00] text-white rounded-lg font-bold hover:bg-[#a03d00] disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                                <Icon name="add" className="text-[20px]" />
                                Thêm
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-6 bg-[#f8f9fa] dark:bg-slate-950/50">
                        {isLoading ? (
                            <div className="text-center py-10">
                                <Icon name="progress_activity" className="animate-spin text-orange-500 text-3xl" />
                                <p className="text-slate-500 mt-2">Đang tải dữ liệu...</p>
                            </div>
                        ) : announcements.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                Chưa có thông báo nào.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {announcements.map((item) => (
                                    <div key={item.id} className={`p-4 rounded-xl border ${item.active ? 'bg-white border-orange-200 dark:bg-slate-900 dark:border-orange-900/50 shadow-sm' : 'bg-gray-50 border-gray-200 dark:bg-slate-800 dark:border-gray-700 opacity-70'} transition-all`}>
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1">
                                                <p className={`font-medium ${item.active ? 'text-slate-900 dark:text-white' : 'text-slate-500 line-through'}`}>
                                                    {item.content}
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {formatDate(item.created_at)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleToggle(item.id, item.active)}
                                                    className={`p-2 rounded-lg transition-colors ${item.active
                                                        ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-slate-700 dark:text-slate-400'
                                                        }`}
                                                    title={item.active ? "Đang hiện (Click để ẩn)" : "Đang ẩn (Click để hiện)"}
                                                >
                                                    <Icon name={item.active ? "visibility" : "visibility_off"} className="text-[20px]" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 transition-colors"
                                                    title="Xóa"
                                                >
                                                    <Icon name="delete" className="text-[20px]" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

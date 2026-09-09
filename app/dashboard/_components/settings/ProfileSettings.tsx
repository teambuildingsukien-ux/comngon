'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/providers/toast-provider';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface ProfileSettingsProps {
    userId: string;
    onClose: () => void;
}

export default function ProfileSettings({ userId, onClose }: ProfileSettingsProps) {
    const supabase = createClient();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');

    // Password change states
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    useEffect(() => {
        if (userId) {
            loadUserProfile();
        }
    }, [userId]);

    const loadUserProfile = async () => {
        if (!userId) return;

        try {
            const { data, error } = await supabase
                .from('users')
                .select('full_name, email, avatar_url')
                .eq('id', userId)
                .single();

            if (error) throw error;

            if (data) {
                setFullName(data.full_name || '');
                setEmail(data.email || '');
                setAvatarUrl(data.avatar_url || '');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            showToast('❌ Không thể tải thông tin cá nhân', '⚠️', 3000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!fullName.trim()) {
            showToast('⚠️ Vui lòng nhập họ tên', '⚠️', 3000);
            return;
        }

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('users')
                .update({
                    full_name: fullName.trim(),
                    avatar_url: avatarUrl.trim() || null
                })
                .eq('id', userId);

            if (error) throw error;

            showToast('✅ Đã lưu thay đổi!', '✅', 3000);
            onClose();
        } catch (error) {
            console.error('Error saving profile:', error);
            showToast('❌ Không thể lưu thay đổi', '⚠️', 3000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentPassword) {
            showToast('⚠️ Vui lòng nhập mật khẩu hiện tại', '⚠️', 3000);
            return;
        }
        if (!newPassword || !confirmPassword) {
            showToast('⚠️ Vui lòng nhập đầy đủ mật khẩu mới', '⚠️', 3000);
            return;
        }
        if (newPassword.length < 6) {
            showToast('⚠️ Mật khẩu mới phải ít nhất 6 ký tự', '⚠️', 3000);
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('⚠️ Mật khẩu xác nhận không khớp', '⚠️', 3000);
            return;
        }

        setIsChangingPassword(true);
        try {
            // Bước 1: Verify mật khẩu hiện tại bằng signInWithPassword
            const { error: verifyError } = await supabase.auth.signInWithPassword({
                email: email,
                password: currentPassword
            });

            if (verifyError) {
                showToast('❌ Mật khẩu hiện tại không đúng!', '⚠️', 3000);
                return;
            }

            // Bước 2: Đổi mật khẩu mới
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            showToast('✅ Đổi mật khẩu thành công!', '✅', 3000);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setShowPasswordForm(false);
        } catch (error: unknown) {
            console.error('Error changing password:', error);
            const errMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
            showToast(`❌ Đổi mật khẩu thất bại: ${errMsg}`, '⚠️', 4000);
        } finally {
            setIsChangingPassword(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-[#B24700] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">Thông tin cá nhân</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Cập nhật thông tin hồ sơ của bạn</p>
            </div>

            {/* Avatar Preview */}
            <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-[#B24700] flex items-center justify-center text-white font-bold text-2xl overflow-hidden">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        fullName.substring(0, 2).toUpperCase()
                    )}
                </div>
                <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Ảnh đại diện</p>
                    <p className="text-xs text-slate-500">JPG, PNG hoặc GIF. Max 2MB</p>
                </div>
            </div>

            {/* Full Name */}
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#B24700]/20 focus:border-[#B24700] outline-none transition-all"
                    placeholder="Nhập họ và tên"
                />
            </div>

            {/* Email (read-only) */}
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Email
                </label>
                <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 mt-1">Email không thể thay đổi</p>
            </div>

            {/* Avatar URL */}
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    URL ảnh đại diện
                </label>
                <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#B24700]/20 focus:border-[#B24700] outline-none transition-all"
                    placeholder="https://example.com/avatar.jpg"
                />
                <p className="text-xs text-slate-500 mt-1">Hoặc để trống để dùng ảnh mặc định</p>
            </div>

            {/* Change Password Section */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <button
                    onClick={() => setShowPasswordForm(!showPasswordForm)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-[#B24700] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors w-full justify-between"
                >
                    <span className="flex items-center gap-2">
                        <Icon name="lock" className="text-lg" />
                        Đổi mật khẩu
                    </span>
                    <Icon name={showPasswordForm ? "expand_less" : "expand_more"} className="text-lg" />
                </button>

                {showPasswordForm && (
                    <div className="mt-3 space-y-3 p-4 bg-orange-50/50 dark:bg-orange-900/10 rounded-xl border border-orange-200/50 dark:border-orange-800/20">
                        {/* Mật khẩu hiện tại */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                Mật khẩu hiện tại <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showCurrentPassword ? "text" : "password"}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 pr-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#B24700]/20 focus:border-[#B24700] outline-none transition-all"
                                    placeholder="Nhập mật khẩu hiện tại"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <Icon name={showCurrentPassword ? "visibility_off" : "visibility"} className="text-xl" />
                                </button>
                            </div>
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                            <p className="text-xs text-slate-500 mb-3 font-medium">Nhập mật khẩu mới bên dưới:</p>
                        </div>

                        {/* Mật khẩu mới */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                Mật khẩu mới <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showNewPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 pr-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#B24700]/20 focus:border-[#B24700] outline-none transition-all"
                                    placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <Icon name={showNewPassword ? "visibility_off" : "visibility"} className="text-xl" />
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                Xác nhận mật khẩu <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 pr-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#B24700]/20 focus:border-[#B24700] outline-none transition-all"
                                    placeholder="Nhập lại mật khẩu mới"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <Icon name={showConfirmPassword ? "visibility_off" : "visibility"} className="text-xl" />
                                </button>
                            </div>
                        </div>
                        {newPassword && confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-xs text-red-500 font-semibold flex items-center gap-1">
                                <Icon name="error" className="text-sm" /> Mật khẩu không khớp
                            </p>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                            <button
                                onClick={handleChangePassword}
                                disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                                className="px-5 py-2 text-sm font-bold bg-[#B24700] text-white hover:bg-[#8F3900] rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isChangingPassword ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Đang đổi...
                                    </>
                                ) : (
                                    <>
                                        <Icon name="check" className="text-lg" />
                                        Xác nhận đổi
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                                className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                    onClick={onClose}
                    className="px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                    Hủy
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2.5 text-sm font-bold bg-[#B24700] text-white hover:bg-[#8F3900] rounded-lg transition-colors shadow-md shadow-[#B24700]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isSaving ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Đang lưu...
                        </>
                    ) : (
                        <>
                            <Icon name="save" className="text-lg" />
                            Lưu thay đổi
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

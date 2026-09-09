'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ChatActionCardProps {
    messageIndex: number;
    actionType?: string;
    actionArgs?: any;
    confirmationToken?: string;
    chatLoading: boolean;
    onConfirm: (msgIdx: number, token: string, formValues?: any) => Promise<void>;
    onCancel: (msgIdx: number, token: string) => Promise<void>;
}

export const getActionLabel = (type?: string) => {
    switch (type) {
        case 'modify_employee_meal':
        case 'modify_employee_meal_form':
            return 'Chỉnh sửa cơm nhân viên';
        case 'create_new_employee':
            return 'Tạo nhân viên mới';
        case 'change_employee_status':
            return 'Thay đổi trạng thái nhân viên';
        case 'schedule_employee_resignation':
            return 'Lên lịch nghỉ việc / Hủy lịch nghỉ';
        case 'send_emergency_announcement':
            return 'Gửi thông báo khẩn cấp';
        case 'set_cooking_exception':
            return 'Thiết lập ngày ngoại lệ nấu bếp';
        case 'delete_cooking_exception':
            return 'Xóa thiết lập ngày ngoại lệ nấu bếp';
        case 'update_registration_deadline':
            return 'Cập nhật cài đặt hạn chót đăng ký';
        case 'add_guest_meals':
            return 'Đăng ký cơm khách phát sinh';
        case 'delete_guest_meals':
            return 'Hủy đăng ký cơm khách phát sinh';
        case 'update_ai_config':
            return 'Cập nhật cấu hình AI & chi phí';
        default:
            return 'Hành động hệ thống';
    }
};

export const renderActionDetails = (type?: string, args?: any) => {
    if (!args) return null;
    switch (type) {
        case 'modify_employee_meal':
        case 'modify_employee_meal_form':
            return (
                <>
                    <p>• Nhân viên: <strong>{args.employee_name || args.employee_id}</strong></p>
                    <p>• Ngày áp dụng: <strong>{args.date ? args.date.split(',').map((d: string) => {
                        const parts = d.trim().split('-');
                        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d.trim();
                    }).join(', ') : ''}</strong></p>
                    <p>• Trạng thái: <strong className={args.register ? "text-green-600 dark:text-green-400" : "text-rose-600 dark:text-rose-400"}>{args.register ? "Đăng ký ăn" : "Hủy đăng ký ăn"}</strong></p>
                    {args.reason && <p>• Lý do: <i>{args.reason}</i></p>}
                </>
            );
        case 'create_new_employee':
            return (
                <>
                    <p>• Họ tên: <strong>{args.fullName}</strong></p>
                    <p>• Email: <strong>{args.email}</strong></p>
                    {args.employeeCode && <p>• Mã nhân viên: <strong>{args.employeeCode}</strong></p>}
                    {args.department && <p>• Phòng ban: <strong>{args.department}</strong></p>}
                    {args.startDate && <p>• Ngày bắt đầu: <strong>{args.startDate}</strong></p>}
                </>
            );
        case 'change_employee_status':
            return (
                <>
                    <p>• Nhân viên ID: <strong>{args.employee_id}</strong></p>
                    <p>• Trạng thái mới: <strong className="text-purple-600">{args.new_status === 'active' ? 'Hoạt động' : args.new_status === 'paused' ? 'Tạm dừng' : 'Đã nghỉ việc'}</strong></p>
                    {args.reason && <p>• Lý do: <i>{args.reason}</i></p>}
                </>
            );
        case 'schedule_employee_resignation':
            return (
                <>
                    <p>• Nhân viên ID: <strong>{args.employee_id}</strong></p>
                    <p>• Loại yêu cầu: <strong>{args.action_type === 'schedule' ? 'Đặt lịch nghỉ việc' : 'Hủy lịch nghỉ việc'}</strong></p>
                    {args.resigned_date && <p>• Ngày nghỉ việc: <strong>{args.resigned_date}</strong></p>}
                    {args.reason && <p>• Lý do: <i>{args.reason}</i></p>}
                </>
            );
        case 'send_emergency_announcement':
            return (
                <>
                    <p>• Nội dung: <strong>"{args.content}"</strong></p>
                </>
            );
        case 'set_cooking_exception':
            return (
                <>
                    <p>• Ngày ngoại lệ: <strong>{args.date}</strong></p>
                    <p>• Loại ngoại lệ: <strong>{args.exception_type === 'no_cook' ? 'Nghỉ bếp' : 'Nấu bù'}</strong></p>
                    {args.reason && <p>• Lý do: <i>{args.reason}</i></p>}
                </>
            );
        case 'delete_cooking_exception':
            return (
                <>
                    <p>• Ngày cần khôi phục: <strong>{args.date}</strong></p>
                </>
            );
        case 'update_registration_deadline':
            return (
                <>
                    {args.deadline_time !== undefined && <p>• Giờ chốt cơm: <strong>{args.deadline_time}</strong></p>}
                    {args.offset_days !== undefined && <p>• Số ngày lệch (offset): <strong>{args.offset_days} ngày</strong></p>}
                    {args.enabled !== undefined && <p>• Chặn đăng ký muộn: <strong>{args.enabled ? 'Bật' : 'Tắt'}</strong></p>}
                    {args.allow_late !== undefined && <p>• Cho phép đăng ký trễ: <strong>{args.allow_late ? 'Bật' : 'Tắt'}</strong></p>}
                </>
            );
        case 'add_guest_meals':
            return (
                <>
                    <p>• Ngày áp dụng: <strong>{args.date}</strong></p>
                    <p>• Số lượng suất khách: <strong>{args.quantity} suất</strong></p>
                    {args.note && <p>• Ghi chú: <i>{args.note}</i></p>}
                </>
            );
        case 'delete_guest_meals':
            return (
                <>
                    {args.date && <p>• Ngày áp dụng: <strong>{args.date}</strong></p>}
                    {args.guest_meal_id && <p>• ID cơm khách: <strong className="font-mono text-[10px]">{args.guest_meal_id}</strong></p>}
                </>
            );
        case 'update_ai_config':
            return (
                <>
                    {args.meal_price !== undefined && <p>• Giá cơm: <strong>{args.meal_price.toLocaleString('vi-VN')}đ</strong></p>}
                    {args.extra_cost_per_meal !== undefined && <p>• Phụ phí suất ăn: <strong>{args.extra_cost_per_meal.toLocaleString('vi-VN')}đ</strong></p>}
                    {args.monthly_fixed_cost !== undefined && <p>• Chi phí cố định tháng: <strong>{args.monthly_fixed_cost.toLocaleString('vi-VN')}đ</strong></p>}
                    {args.budget_monthly !== undefined && <p>• Ngân sách tháng: <strong>{args.budget_monthly.toLocaleString('vi-VN')}đ</strong></p>}
                    {args.vendor_name !== undefined && <p>• Nhà cung cấp: <strong>"{args.vendor_name}"</strong></p>}
                    {args.special_notes !== undefined && <p>• Ghi chú vận hành: <strong>"{args.special_notes}"</strong></p>}
                    {args.company_size !== undefined && <p>• Quy mô công ty: <strong>"{args.company_size}"</strong></p>}
                    {args.industry !== undefined && <p>• Ngành nghề: <strong>"{args.industry}"</strong></p>}
                </>
            );
        default:
            return <pre className="text-[10px] overflow-x-auto">{JSON.stringify(args, null, 2)}</pre>;
    }
};

export default function ChatActionCard({
    messageIndex,
    actionType,
    actionArgs,
    confirmationToken,
    chatLoading,
    onConfirm,
    onCancel
}: ChatActionCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [employees, setEmployees] = useState<any[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    // Form states
    const [formEmployeeId, setFormEmployeeId] = useState(actionArgs?.employee_id || '');
    const [formDate, setFormDate] = useState(actionArgs?.date || '');
    const [formRegister, setFormRegister] = useState(actionArgs?.register ?? false);
    const [formQuantity, setFormQuantity] = useState(actionArgs?.quantity || 1);
    const [formNote, setFormNote] = useState(actionArgs?.note || '');

    // Reset local submitting when parent chatLoading ends
    useEffect(() => {
        if (!chatLoading) {
            setIsSubmitting(false);
        }
    }, [chatLoading]);

    const loadEmployees = async () => {
        setLoadingEmployees(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: currentUser } = await supabase
                    .from('users')
                    .select('tenant_id')
                    .eq('id', user.id)
                    .single();

                if (currentUser) {
                    const { data: list, error } = await supabase
                        .from('users')
                        .select('id, full_name, email, employee_code')
                        .eq('tenant_id', currentUser.tenant_id)
                        .eq('is_active', true)
                        .order('full_name');

                    if (error) throw error;
                    if (list) {
                        setEmployees(list);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load employees for edit form:', err);
        } finally {
            setLoadingEmployees(false);
        }
    };

    const handleStartEdit = () => {
        setIsEditing(true);
        if (employees.length === 0 && (actionType === 'modify_employee_meal' || actionType === 'modify_employee_meal_form')) {
            loadEmployees();
        }
    };

    const handleSaveAndConfirm = async () => {
        if (isSubmitting || chatLoading) return;
        setIsSubmitting(true);

        const formValues: Record<string, any> = {};
        if (actionType === 'modify_employee_meal' || actionType === 'modify_employee_meal_form') {
            formValues.employee_id = formEmployeeId;
            formValues.date = formDate;
            formValues.register = formRegister;
        } else if (actionType === 'add_guest_meals') {
            formValues.date = formDate;
            formValues.quantity = formQuantity;
            formValues.note = formNote;
        }

        try {
            if (confirmationToken) {
                await onConfirm(messageIndex, confirmationToken, formValues);
            }
        } catch (err) {
            setIsSubmitting(false);
        }
    };

    const handleNormalConfirm = async () => {
        if (isSubmitting || chatLoading || !confirmationToken) return;
        setIsSubmitting(true);
        try {
            await onConfirm(messageIndex, confirmationToken);
        } catch (err) {
            setIsSubmitting(false);
        }
    };

    const handleNormalCancel = async () => {
        if (isSubmitting || chatLoading || !confirmationToken) return;
        setIsSubmitting(true);
        try {
            await onCancel(messageIndex, confirmationToken);
        } catch (err) {
            setIsSubmitting(false);
        }
    };

    const isEditable = actionType === 'modify_employee_meal' || 
                       actionType === 'modify_employee_meal_form' || 
                       actionType === 'add_guest_meals';

    const isDisabled = chatLoading || isSubmitting;

    return (
        <div className="mt-4 relative overflow-hidden rounded-2xl border border-dashed border-[#b24700]/30 dark:border-[#b24700]/20 bg-white/90 dark:bg-slate-900/90 shadow-lg p-5 flex flex-col gap-4">
            {/* Watermark Badge */}
            <div className="absolute right-3 -bottom-3 opacity-[0.03] dark:opacity-[0.02] pointer-events-none select-none">
                <span className="material-symbols-outlined text-[100px] text-[#b24700] font-black">verified_user</span>
            </div>

            {/* Header info */}
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center text-[#b24700] flex-shrink-0 shadow-sm border border-[#b24700]/10">
                    <span className="material-symbols-outlined text-[20px] animate-pulse">lock_person</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {isEditing ? 'Đang chỉnh sửa đề xuất' : 'Xác nhận hành động'}
                        </h4>
                        <span className="text-[9px] font-mono bg-orange-500/10 text-[#b24700] px-1.5 py-0.5 rounded-full font-bold">Lili SecOps</span>
                    </div>
                    <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 mt-1">
                        {getActionLabel(actionType)}
                    </h3>
                </div>
            </div>

            {/* Dashed separator */}
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700/60 my-0.5" />

            {/* Details or Edit Form */}
            {!isEditing ? (
                <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1.5 bg-slate-50/50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 font-mono relative">
                    {renderActionDetails(actionType, actionArgs)}
                </div>
            ) : (
                <div className="text-xs space-y-3 bg-slate-50/50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 font-sans">
                    {(actionType === 'modify_employee_meal' || actionType === 'modify_employee_meal_form') && (
                        <>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Nhân viên</label>
                                {loadingEmployees ? (
                                    <div className="text-xs text-gray-400 py-1.5 flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span> Đang tải...
                                    </div>
                                ) : (
                                    <select
                                        value={formEmployeeId}
                                        onChange={(e) => setFormEmployeeId(e.target.value)}
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12100E] text-slate-700 dark:text-slate-300 focus:border-[#b24700] focus:ring-1 focus:ring-[#b24700] outline-none"
                                    >
                                        <option value="">-- Chọn nhân viên --</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.full_name} ({emp.email} {emp.employee_code ? `• ${emp.employee_code}` : ''})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Ngày áp dụng</label>
                                <input
                                    type="text"
                                    value={formDate}
                                    onChange={(e) => setFormDate(e.target.value)}
                                    placeholder="Ví dụ: 2026-05-25, 2026-05-26"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12100E] text-slate-700 dark:text-slate-300 font-mono text-xs focus:border-[#b24700] outline-none"
                                />
                                <span className="block text-[9px] text-slate-400 dark:text-slate-500 leading-normal">
                                    Định dạng YYYY-MM-DD. Cho phép nhiều ngày phân tách bằng dấu phẩy.
                                </span>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Trạng thái cơm</label>
                                <select
                                    value={formRegister ? "true" : "false"}
                                    onChange={(e) => setFormRegister(e.target.value === "true")}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12100E] text-slate-700 dark:text-slate-300 focus:border-[#b24700] outline-none"
                                >
                                    <option value="true">Đăng ký ăn cơm trưa</option>
                                    <option value="false">Hủy đăng ký ăn cơm trưa</option>
                                </select>
                            </div>
                        </>
                    )}

                    {actionType === 'add_guest_meals' && (
                        <>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Ngày áp dụng</label>
                                <input
                                    type="text"
                                    value={formDate}
                                    onChange={(e) => setFormDate(e.target.value)}
                                    placeholder="2026-05-25"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12100E] text-slate-700 dark:text-slate-300 font-mono text-xs focus:border-[#b24700] outline-none"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Số lượng suất ăn</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={formQuantity}
                                    onChange={(e) => setFormQuantity(parseInt(e.target.value, 10) || 1)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12100E] text-slate-700 dark:text-slate-300 focus:border-[#b24700] outline-none"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Ghi chú</label>
                                <input
                                    type="text"
                                    value={formNote}
                                    onChange={(e) => setFormNote(e.target.value)}
                                    placeholder="Nhập ghi chú phát sinh..."
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12100E] text-slate-700 dark:text-slate-300 focus:border-[#b24700] outline-none"
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Dashed separator footer */}
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700/60 my-0.5" />

            {/* Fake digital signature and timestamp */}
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Chữ ký số: SEC-{confirmationToken?.slice(0, 8).toUpperCase() || 'LILI'}
                </span>
                <span>GMT+7: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
            </div>

            {/* Actions Buttons */}
            <div className="flex items-center gap-2 mt-1 select-none">
                {!isEditing ? (
                    <>
                        <button
                            disabled={isDisabled}
                            onClick={handleNormalConfirm}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#b24700] to-[#e05500] hover:from-[#c04b00] hover:to-[#f06000] disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-slate-800 dark:disabled:to-slate-900 transition-all text-xs font-bold text-white shadow-sm hover:shadow-md hover:shadow-orange-500/10 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            Duyệt
                        </button>
                        {isEditable && (
                            <button
                                disabled={isDisabled}
                                onClick={handleStartEdit}
                                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all text-xs font-bold active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                                title="Chỉnh sửa thông tin nhanh"
                            >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                                Sửa
                            </button>
                        )}
                        <button
                            disabled={isDisabled}
                            onClick={handleNormalCancel}
                            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all text-xs font-bold active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">cancel</span>
                            Từ chối
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            disabled={isDisabled}
                            onClick={handleSaveAndConfirm}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#b24700] hover:bg-[#8d3800] text-white transition-all text-xs font-bold shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">save_as</span>
                            Lưu & Duyệt
                        </button>
                        <button
                            disabled={isDisabled}
                            onClick={() => setIsEditing(false)}
                            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all text-xs font-bold active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                            Hủy bỏ
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

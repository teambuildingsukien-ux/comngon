'use client';

import React from 'react';

export interface ChatPendingFormProps {
    messageIndex: number;
    confirmationToken?: string;
    formFields?: any[];
    chatLoading: boolean;
    activeFormValues: Record<number, any>;
    onFormChange: (msgIdx: number, fieldName: string, value: any) => void;
    onSubmit: (msgIdx: number, token: string, fields: any[]) => Promise<void>;
    onCancel: (msgIdx: number, token: string) => Promise<void>;
}

export default function ChatPendingForm({
    messageIndex,
    confirmationToken,
    formFields,
    chatLoading,
    activeFormValues,
    onFormChange,
    onSubmit,
    onCancel
}: ChatPendingFormProps) {
    if (!formFields || formFields.length === 0) return null;

    const handleFormSubmit = () => {
        if (!confirmationToken) return;
        
        const values: Record<string, any> = {};
        formFields.forEach(f => {
            values[f.name] = activeFormValues[messageIndex]?.[f.name] !== undefined 
                ? activeFormValues[messageIndex][f.name] 
                : f.defaultValue;
        });

        if (formFields.some(f => f.name === 'employee_id' && !values.employee_id)) {
            alert('Vui lòng chọn nhân viên trước khi xác nhận.');
            return;
        }

        onSubmit(messageIndex, confirmationToken, formFields);
    };

    return (
        <div className="mt-4 relative overflow-hidden rounded-2xl border border-dashed border-purple-400/30 dark:border-purple-800/30 bg-white/90 dark:bg-slate-900/90 shadow-lg p-5 flex flex-col gap-4">
            {/* Watermark Badge */}
            <div className="absolute right-3 -bottom-3 opacity-[0.03] dark:opacity-[0.02] pointer-events-none select-none">
                <span className="material-symbols-outlined text-[100px] text-purple-600 font-black">dynamic_form</span>
            </div>

            {/* Header info */}
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center text-purple-600 dark:text-purple-400 flex-shrink-0 shadow-sm border border-purple-500/10">
                    <span className="material-symbols-outlined text-[20px] animate-pulse">dynamic_form</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Thông tin bổ sung</h4>
                        <span className="text-[9px] font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full font-bold">Lili Form</span>
                    </div>
                    <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 mt-1">
                        Làm rõ yêu cầu
                    </h3>
                </div>
            </div>

            {/* Dashed separator */}
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700/60 my-0.5" />

            {/* Description */}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Hệ thống tìm thấy nhiều kết quả trùng hoặc cần làm rõ thông tin. Vui lòng điền vào biểu mẫu sau để tiếp tục:
            </p>

            {/* Form Fields */}
            <div className="space-y-3 bg-slate-50/50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                {formFields.map((field) => {
                    const val = activeFormValues[messageIndex]?.[field.name] !== undefined 
                        ? activeFormValues[messageIndex][field.name] 
                        : field.defaultValue;

                    return (
                        <div key={field.name} className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">{field.label}</label>
                            {field.type === 'select' ? (
                                <select
                                    disabled={chatLoading}
                                    value={val || ''}
                                    onChange={(e) => onFormChange(messageIndex, field.name, e.target.value)}
                                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                                >
                                    <option value="">-- Chọn một tùy chọn --</option>
                                    {field.options?.map((opt: any) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            ) : field.type === 'date' ? (
                                <input
                                    disabled={chatLoading}
                                    type="date"
                                    value={val || ''}
                                    onChange={(e) => onFormChange(messageIndex, field.name, e.target.value)}
                                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                                />
                            ) : (
                                <input
                                    disabled={chatLoading}
                                    type="text"
                                    value={val || ''}
                                    onChange={(e) => onFormChange(messageIndex, field.name, e.target.value)}
                                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Dashed separator footer */}
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700/60 my-0.5" />

            {/* Form Action Buttons */}
            <div className="flex items-center gap-2.5 select-none">
                <button
                    disabled={chatLoading}
                    onClick={handleFormSubmit}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-slate-800 dark:disabled:to-slate-900 transition-all text-xs font-bold text-white shadow-sm hover:shadow-md hover:shadow-purple-500/10 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[16px]">send</span>
                    Gửi xác thực
                </button>
                <button
                    disabled={chatLoading}
                    onClick={() => confirmationToken && onCancel(messageIndex, confirmationToken)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all text-xs font-bold active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                    Hủy bỏ
                </button>
            </div>
        </div>
    );
}

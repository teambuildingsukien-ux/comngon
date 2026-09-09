'use client';

import { useState, useEffect } from 'react';
import AIKeyAndRAGSection from './AIKeyAndRAGSection';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface AIConfig {
    tenant_id: string;
    meal_price: number;
    extra_cost_per_meal: number;
    monthly_fixed_cost: number;
    vendor_name: string;
    budget_monthly: number;
    company_size: string;
    industry: string;
    special_notes: string;
    custom_fields: Record<string, any>;
    ai_model: string;
    ai_function_confirmation_mode?: string;
}

const INDUSTRY_OPTIONS = [
    { value: 'office', label: 'Văn phòng' },
    { value: 'manufacturing', label: 'Sản xuất / Nhà máy' },
    { value: 'construction', label: 'Xây dựng' },
    { value: 'education', label: 'Giáo dục' },
    { value: 'healthcare', label: 'Y tế' },
    { value: 'other', label: 'Khác' },
];

const SIZE_OPTIONS = [
    { value: 'small', label: 'Nhỏ (< 50 NV)' },
    { value: 'medium', label: 'Trung bình (50-200 NV)' },
    { value: 'large', label: 'Lớn (> 200 NV)' },
];

const MODEL_OPTIONS = [
    {
        value: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash 🚀',
        description: 'Mô hình chuẩn 2026 tốc độ cao, cực kỳ ổn định và tối ưu xử lý tác vụ hàng ngày.',
        badge: 'Khuyên dùng (Tối ưu)',
        badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    {
        value: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro 🎯',
        description: 'Mô hình suy luận chuyên sâu 2026, phân tích báo cáo và tính toán số liệu chính xác tuyệt đối.',
        badge: 'Chuyên sâu & Chuẩn xác',
        badgeColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    },
    {
        value: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash ⚡',
        description: 'Thế hệ Flash tiếp theo, tư duy sắc bén cho các yêu cầu tổng hợp dữ liệu lớn.',
        badge: 'Công nghệ mới 2026',
        badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
    {
        value: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro 🧠',
        description: 'Mô hình Frontier tân tiến nhất, giải quyết các bài toán chiến lược chi phí đa chiều.',
        badge: 'Frontier AI',
        badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    },
];

const CONFIRMATION_MODE_OPTIONS = [
    {
        value: 'always_confirm',
        label: 'Yêu cầu xác nhận (Luôn hỏi lại) 🛡️',
        description: 'AI sẽ luôn yêu cầu Admin phê duyệt (Đồng ý/Hủy bỏ) trước khi thực hiện hành động sửa suất ăn. Đảm bảo an toàn 100%.',
        badge: 'Khuyên dùng (An toàn)',
        badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    {
        value: 'auto_execute',
        label: 'Cấp full quyền (Tự động chạy) ⚡',
        description: 'AI tự động cập nhật database ngay khi nhận lệnh từ Admin mà không cần bước phê duyệt trung gian. Tối ưu tốc độ thao tác.',
        badge: 'Cấp quyền tối đa',
        badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
];

export default function AISettingsTab() {
    const [config, setConfig] = useState<AIConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [hasGeminiKey, setHasGeminiKey] = useState(false);
    const [maskedKey, setMaskedKey] = useState<string | null>(null);
    const [lastIndexedAt, setLastIndexedAt] = useState<string | null>(null);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            setIsLoading(true);
            const res = await fetch('/api/admin/ai-config');
            const data = await res.json();
            if (data.success) {
                setConfig({
                    ...data.data,
                    ai_model: data.data.ai_model || 'gemini-3-flash-preview',
                    ai_function_confirmation_mode: data.data.ai_function_confirmation_mode || 'always_confirm',
                });
                setHasGeminiKey(!!data.data.has_gemini_key);
                setMaskedKey(data.data.gemini_api_key || null);
                setLastIndexedAt(data.data.last_indexed_at || null);
            }
        } catch (error) {
            console.error('Failed to fetch AI config:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!config) return;
        try {
            setIsSaving(true);
            setSaveMessage('');
            // ⚠️ IMPORTANT: Loại gemini_api_key (đã mask) + has_gemini_key khỏi payload
            // Key chỉ được gửi từ AIKeyAndRAGSection.saveKey() — KHÔNG BAO GIỜ từ đây
            const { gemini_api_key, has_gemini_key, ...safePayload } = config as any;
            const res = await fetch('/api/admin/ai-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(safePayload),
            });
            const data = await res.json();
            if (data.success) {
                setSaveMessage('✅ Đã lưu thành công!');
                setConfig({
                    ...data.data,
                    ai_model: data.data.ai_model || 'gemini-3-flash-preview',
                    ai_function_confirmation_mode: data.data.ai_function_confirmation_mode || 'always_confirm',
                });
            } else {
                setSaveMessage(`❌ Lỗi: ${data.error}`);
            }
        } catch (error) {
            setSaveMessage('❌ Lỗi kết nối');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    const updateField = (field: keyof AIConfig, value: any) => {
        if (!config) return;
        setConfig({ ...config, [field]: value });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c04b00]"></div>
            </div>
        );
    }

    if (!config) return null;

    const totalCostPerMeal = config.meal_price + config.extra_cost_per_meal;

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Section 1 + 3: API Key + RAG Intelligence */}
            <AIKeyAndRAGSection
                hasKey={hasGeminiKey}
                maskedKey={maskedKey}
                lastIndexedAt={lastIndexedAt}
                onKeySaved={fetchConfig}
            />
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Icon name="smart_toy" className="text-[#c04b00]" />
                        Cài đặt AI
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        AI sẽ dùng thông tin này để tính toán chi phí, lập báo cáo chính xác cho doanh nghiệp
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-[#c04b00] text-white font-bold rounded-xl hover:bg-[#a03f00] transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                    <Icon name={isSaving ? 'hourglass_top' : 'save'} className="text-lg" />
                    {isSaving ? 'Đang lưu...' : 'Lưu cài đặt'}
                </button>
            </div>

            {saveMessage && (
                <div className={`p-3 rounded-lg text-sm font-medium ${saveMessage.includes('✅') ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
                    {saveMessage}
                </div>
            )}

            {/* Model AI */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Icon name="psychology" className="text-indigo-500" />
                    Model AI
                </h3>
                <p className="text-xs text-slate-400">
                    Chọn model AI phù hợp. Model mạnh hơn sẽ trả lời chính xác hơn nhưng tốn nhiều chi phí API hơn.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {MODEL_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => updateField('ai_model', opt.value)}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${config.ai_model === opt.value
                                ? 'border-[#c04b00] bg-orange-50 dark:bg-orange-900/10 shadow-md'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-sm text-slate-800 dark:text-white">
                                    {opt.label}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.badgeColor}`}>
                                    {opt.badge}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {opt.description}
                            </p>
                            {config.ai_model === opt.value && (
                                <div className="mt-2 flex items-center gap-1 text-[#c04b00]">
                                    <Icon name="check_circle" className="text-sm" />
                                    <span className="text-xs font-bold">Đang sử dụng</span>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chế độ phê duyệt hành động AI */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Icon name="verified_user" className="text-amber-500" />
                    Chế độ phê duyệt hành động (Human-in-the-loop)
                </h3>
                <p className="text-xs text-slate-400">
                    Khi Admin ra lệnh cho AI thay đổi suất ăn của nhân viên (VD: Hủy đăng ký ăn cơm của nhân viên A ngày mai):
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {CONFIRMATION_MODE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => updateField('ai_function_confirmation_mode', opt.value)}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${config.ai_function_confirmation_mode === opt.value
                                ? 'border-[#c04b00] bg-orange-50 dark:bg-orange-900/10 shadow-md'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-sm text-slate-800 dark:text-white">
                                    {opt.label}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.badgeColor}`}>
                                    {opt.badge}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {opt.description}
                            </p>
                            {config.ai_function_confirmation_mode === opt.value && (
                                <div className="mt-2 flex items-center gap-1 text-[#c04b00]">
                                    <Icon name="check_circle" className="text-sm" />
                                    <span className="text-xs font-bold">Đang áp dụng</span>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chi phí suất ăn */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Icon name="payments" className="text-emerald-500" />
                    Chi phí suất ăn
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">Giá suất ăn (VND)</label>
                        <input
                            type="number"
                            value={config.meal_price}
                            onChange={(e) => updateField('meal_price', parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                            min={0}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">Chi phí phụ/suất — gas, nước, nhân công (VND)</label>
                        <input
                            type="number"
                            value={config.extra_cost_per_meal}
                            onChange={(e) => updateField('extra_cost_per_meal', parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                            min={0}
                        />
                    </div>
                </div>

                {/* Summary card */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        💰 Tổng chi phí/suất: {totalCostPerMeal.toLocaleString('vi-VN')} VND
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                        = {config.meal_price.toLocaleString('vi-VN')} (giá suất) + {config.extra_cost_per_meal.toLocaleString('vi-VN')} (phụ phí)
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">Chi phí cố định/tháng (VND)</label>
                        <input
                            type="number"
                            value={config.monthly_fixed_cost}
                            onChange={(e) => updateField('monthly_fixed_cost', parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                            min={0}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Thuê bếp, lương bếp trưởng...</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">Ngân sách tháng (VND)</label>
                        <input
                            type="number"
                            value={config.budget_monthly}
                            onChange={(e) => updateField('budget_monthly', parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                            min={0}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">AI sẽ cảnh báo khi vượt ngân sách</p>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Nhà cung cấp thực phẩm</label>
                    <input
                        type="text"
                        value={config.vendor_name}
                        onChange={(e) => updateField('vendor_name', e.target.value)}
                        placeholder="VD: Công ty thực phẩm ABC"
                        className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                    />
                </div>
            </div>

            {/* Thông tin doanh nghiệp */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Icon name="business" className="text-blue-500" />
                    Thông tin doanh nghiệp
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">Quy mô</label>
                        <select
                            value={config.company_size}
                            onChange={(e) => updateField('company_size', e.target.value)}
                            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                        >
                            {SIZE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">Ngành nghề</label>
                        <select
                            value={config.industry}
                            onChange={(e) => updateField('industry', e.target.value)}
                            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                        >
                            {INDUSTRY_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Ghi chú cho AI */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Icon name="edit_note" className="text-purple-500" />
                    Ghi chú đặc biệt cho AI
                </h3>
                <p className="text-xs text-slate-400">AI sẽ đọc ghi chú này để hiểu đặc thù doanh nghiệp. VD: "Ưu tiên món miền Trung", "Không dùng bột ngọt"...</p>
                <textarea
                    value={config.special_notes}
                    onChange={(e) => updateField('special_notes', e.target.value)}
                    rows={4}
                    placeholder="Nhập ghi chú đặc biệt cho AI..."
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none resize-none"
                    maxLength={2000}
                />
                <p className="text-[10px] text-slate-400 text-right">{config.special_notes.length}/2000 ký tự</p>
            </div>
        </div>
    );
}

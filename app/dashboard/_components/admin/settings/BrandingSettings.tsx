'use client';

import { useState, useEffect } from 'react';
import { useTenantFeatures } from '@/hooks/useTenantFeatures';

const GOOGLE_FONTS = [
    'Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins',
    'Noto Sans', 'Lato', 'Nunito', 'Raleway', 'Source Sans 3',
    'Be Vietnam Pro', 'Outfit', 'DM Sans', 'Manrope', 'Plus Jakarta Sans',
];

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface BrandingData {
    name: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    fonts: { heading: string; body: string };
}

export default function BrandingSettings() {
    const { isEnabled } = useTenantFeatures();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [branding, setBranding] = useState<BrandingData>({
        name: '',
        logo_url: null,
        primary_color: '#B24700',
        secondary_color: '#FF6B00',
        fonts: { heading: 'Inter', body: 'Inter' },
    });

    useEffect(() => {
        fetchBranding();
    }, []);

    async function fetchBranding() {
        try {
            const res = await fetch('/api/admin/branding');
            if (res.ok) {
                const data = await res.json();
                setBranding(data);
            }
        } catch (err) {
            console.error('Error fetching branding:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        try {
            setSaving(true);
            const res = await fetch('/api/admin/branding', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    logo_url: branding.logo_url,
                    primary_color: branding.primary_color,
                    secondary_color: branding.secondary_color,
                    fonts: branding.fonts,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            alert('✅ Thương hiệu đã được cập nhật!');
        } catch (err: any) {
            alert('❌ Lỗi: ' + err.message);
        } finally {
            setSaving(false);
        }
    }

    // Feature gate check
    if (!isEnabled('custom_branding')) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] p-6">
                <div className="text-center bg-white dark:bg-slate-800 rounded-3xl p-10 shadow-xl max-w-lg">
                    <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Icon name="palette" className="text-4xl text-[#B24700]" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">Tuỳ chỉnh thương hiệu</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                        Tính năng này cho phép bạn tuỳ chỉnh logo, màu sắc và font chữ cho dashboard.
                        Nâng cấp lên gói <strong>Pro</strong> hoặc <strong>Enterprise</strong> để sử dụng.
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-[#B24700] font-semibold text-sm">
                        <Icon name="lock" className="text-lg" />
                        Yêu cầu gói Pro trở lên
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="w-10 h-10 border-4 border-[#B24700] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                    <Icon name="palette" className="text-[#B24700]" />
                    Tuỳ Chỉnh Thương Hiệu
                </h2>
                <p className="text-slate-500 mt-1">Cá nhân hoá giao diện dashboard cho tổ chức của bạn</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Settings Panel */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Logo */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold dark:text-white mb-4 flex items-center gap-2">
                            <Icon name="image" className="text-[#B24700]" /> Logo
                        </h3>
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-600">
                                {branding.logo_url ? (
                                    <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain" />
                                ) : (
                                    <Icon name="add_photo_alternate" className="text-3xl text-slate-400" />
                                )}
                            </div>
                            <div className="flex-1">
                                <input
                                    type="url"
                                    placeholder="https://example.com/logo.png"
                                    value={branding.logo_url || ''}
                                    onChange={(e) => setBranding({ ...branding, logo_url: e.target.value || null })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-[#B24700] focus:border-transparent outline-none"
                                />
                                <p className="text-xs text-slate-400 mt-1">URL hình ảnh logo (PNG, SVG khuyến nghị)</p>
                            </div>
                        </div>
                    </div>

                    {/* Colors */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold dark:text-white mb-4 flex items-center gap-2">
                            <Icon name="color_lens" className="text-[#B24700]" /> Màu sắc
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Màu chính (Primary)</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={branding.primary_color}
                                        onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                                        className="w-12 h-12 rounded-xl cursor-pointer border-2 border-slate-200 dark:border-slate-600"
                                    />
                                    <input
                                        type="text"
                                        value={branding.primary_color}
                                        onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-sm font-mono"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Màu phụ (Secondary)</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={branding.secondary_color}
                                        onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                                        className="w-12 h-12 rounded-xl cursor-pointer border-2 border-slate-200 dark:border-slate-600"
                                    />
                                    <input
                                        type="text"
                                        value={branding.secondary_color}
                                        onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-sm font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Fonts */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold dark:text-white mb-4 flex items-center gap-2">
                            <Icon name="text_format" className="text-[#B24700]" /> Font chữ
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Font tiêu đề</label>
                                <select
                                    value={branding.fonts.heading}
                                    onChange={(e) => setBranding({ ...branding, fonts: { ...branding.fonts, heading: e.target.value } })}
                                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-sm"
                                >
                                    {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Font nội dung</label>
                                <select
                                    value={branding.fonts.body}
                                    onChange={(e) => setBranding({ ...branding, fonts: { ...branding.fonts, body: e.target.value } })}
                                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-sm"
                                >
                                    {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-3.5 bg-[#B24700] hover:bg-[#8a3700] text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-[#B24700]/25 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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

                {/* Live Preview */}
                <div className="lg:col-span-1">
                    <div className="sticky top-6">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Xem trước</h3>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700">
                            {/* Preview Header */}
                            <div
                                className="p-4 flex items-center gap-3"
                                style={{ backgroundColor: branding.primary_color }}
                            >
                                {branding.logo_url ? (
                                    <img src={branding.logo_url} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/20" />
                                ) : (
                                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                                        <span className="text-white text-xs font-bold">{branding.name?.charAt(0) || 'C'}</span>
                                    </div>
                                )}
                                <span
                                    className="text-white font-bold text-sm"
                                    style={{ fontFamily: branding.fonts.heading }}
                                >
                                    {branding.name || 'Tên tổ chức'}
                                </span>
                            </div>

                            {/* Preview Content */}
                            <div className="p-4 space-y-3">
                                <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 w-3/4"></div>
                                <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 w-1/2"></div>

                                <div className="flex gap-2 mt-4">
                                    <div
                                        className="flex-1 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                                        style={{ backgroundColor: branding.primary_color }}
                                    >
                                        Nút chính
                                    </div>
                                    <div
                                        className="flex-1 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                                        style={{ backgroundColor: branding.secondary_color }}
                                    >
                                        Nút phụ
                                    </div>
                                </div>

                                <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                                    <p
                                        className="text-sm text-slate-700 dark:text-slate-300"
                                        style={{ fontFamily: branding.fonts.body }}
                                    >
                                        Đây là preview font nội dung — {branding.fonts.body}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

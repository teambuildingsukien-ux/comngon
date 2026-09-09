'use client';

import React, { useState } from 'react';
import { X, Sparkles, FlaskConical, CheckCircle2, AlertTriangle, Clock, ExternalLink } from 'lucide-react';

// ============================================
// Feature Status Badge + Info Modal
// Hiển thị nhãn trạng thái: Coming Soon, Beta, Stable, Deprecated
// Click vào → mở modal thông tin chi tiết
// ============================================

export type FeatureStatus = 'coming_soon' | 'alpha' | 'beta' | 'stable' | 'deprecated';

interface FeatureRegistryItem {
    key: string;
    label: string;
    description?: string;
    icon?: string;
    status: FeatureStatus;
    status_note?: string;
    changelog?: string;
    released_at?: string;
}

const STATUS_CONFIG: Record<FeatureStatus, {
    label: string;
    emoji: string;
    color: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
    description: string;
    icon: React.ElementType;
}> = {
    coming_soon: {
        label: 'Sắp ra mắt',
        emoji: '🔮',
        color: 'text-purple-300',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/30',
        textColor: 'text-purple-400',
        description: 'Tính năng đang được phát triển và sẽ ra mắt sớm.',
        icon: Clock,
    },
    alpha: {
        label: 'Alpha',
        emoji: '🧪',
        color: 'text-orange-300',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/30',
        textColor: 'text-orange-400',
        description: 'Phiên bản thử nghiệm nội bộ, có thể thay đổi lớn.',
        icon: FlaskConical,
    },
    beta: {
        label: 'Beta',
        emoji: '🟡',
        color: 'text-amber-300',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        textColor: 'text-amber-400',
        description: 'Tính năng đang thử nghiệm. Có thể có lỗi nhỏ, phản hồi của bạn rất quan trọng!',
        icon: Sparkles,
    },
    stable: {
        label: 'Ổn định',
        emoji: '✅',
        color: 'text-emerald-300',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        textColor: 'text-emerald-400',
        description: 'Tính năng đã ổn định và hoạt động tốt.',
        icon: CheckCircle2,
    },
    deprecated: {
        label: 'Ngừng hỗ trợ',
        emoji: '⚠️',
        color: 'text-red-300',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        textColor: 'text-red-400',
        description: 'Tính năng sẽ bị gỡ trong phiên bản tới. Vui lòng chuyển sang giải pháp thay thế.',
        icon: AlertTriangle,
    },
};

// ============================================
// Badge Component — hiện cạnh tên tính năng
// ============================================
export function FeatureStatusBadge({
    status,
    size = 'sm',
    onClick,
}: {
    status: FeatureStatus;
    size?: 'xs' | 'sm' | 'md';
    onClick?: () => void;
}) {
    // Stable thì không hiện badge
    if (status === 'stable') return null;

    const config = STATUS_CONFIG[status];
    const sizeClasses = {
        xs: 'text-[10px] px-1.5 py-0.5 gap-0.5',
        sm: 'text-xs px-2 py-0.5 gap-1',
        md: 'text-sm px-2.5 py-1 gap-1.5',
    };

    return (
        <button
            onClick={onClick}
            className={`
                inline-flex items-center font-semibold rounded-full border
                transition-all duration-200
                ${config.bgColor} ${config.borderColor} ${config.textColor}
                ${sizeClasses[size]}
                ${onClick ? 'cursor-pointer hover:brightness-125 hover:scale-105' : 'cursor-default'}
            `}
            title={`${config.emoji} ${config.label}`}
        >
            <span>{config.emoji}</span>
            <span>{config.label}</span>
        </button>
    );
}

// ============================================
// Info Modal — hiện khi click vào badge hoặc feature card
// ============================================
export function FeatureInfoModal({
    feature,
    isOpen,
    onClose,
}: {
    feature: FeatureRegistryItem;
    isOpen: boolean;
    onClose: () => void;
}) {
    if (!isOpen) return null;

    const config = STATUS_CONFIG[feature.status];
    const StatusIcon = config.icon;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-md mx-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with status color */}
                <div className={`px-6 py-4 border-b ${config.borderColor} ${config.bgColor}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{feature.icon || '📦'}</span>
                            <div>
                                <h3 className="text-lg font-bold text-slate-100">{feature.label}</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <StatusIcon className={`w-3.5 h-3.5 ${config.textColor}`} />
                                    <span className={`text-xs font-semibold ${config.textColor}`}>
                                        {config.emoji} {config.label}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    {/* Description */}
                    <div>
                        <p className="text-sm text-slate-300 leading-relaxed">
                            {feature.description || config.description}
                        </p>
                    </div>

                    {/* Status Note */}
                    {feature.status_note && (
                        <div className={`p-3 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
                            <p className={`text-sm font-medium ${config.textColor}`}>
                                💡 {feature.status_note}
                            </p>
                        </div>
                    )}

                    {/* Status description */}
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                        <div className="flex items-start gap-2">
                            <StatusIcon className={`w-4 h-4 mt-0.5 ${config.textColor} flex-shrink-0`} />
                            <p className="text-xs text-slate-400 leading-relaxed">{config.description}</p>
                        </div>
                    </div>

                    {/* Changelog */}
                    {feature.changelog && (
                        <div>
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📋 Changelog</h4>
                            <p className="text-sm text-slate-300 whitespace-pre-wrap">{feature.changelog}</p>
                        </div>
                    )}

                    {/* Released date */}
                    {feature.released_at && (
                        <p className="text-xs text-slate-500">
                            📅 Ra mắt: {new Date(feature.released_at).toLocaleDateString('vi-VN')}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50">
                    <button
                        onClick={onClose}
                        className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                    >
                        Đã hiểu
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================
// Hook: useFeatureInfoModal
// ============================================
export function useFeatureInfoModal() {
    const [selectedFeature, setSelectedFeature] = useState<FeatureRegistryItem | null>(null);

    return {
        selectedFeature,
        isOpen: !!selectedFeature,
        open: (feature: FeatureRegistryItem) => setSelectedFeature(feature),
        close: () => setSelectedFeature(null),
    };
}

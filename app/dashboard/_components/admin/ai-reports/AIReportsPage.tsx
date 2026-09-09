'use client';

import { useState, useRef, useEffect } from 'react';
import { useAIChat } from '@/hooks/useAIChat';
import ChatActionCard from '@/components/ai/ChatActionCard';
import ChatPendingForm from '@/components/ai/ChatPendingForm';

// Simple markdown renderer (handles headers, bold, lists, tables, emoji)
function renderMarkdown(text: string) {
    const lines = text.split('\n');
    const html: string[] = [];
    let inTable = false;
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Close list if line is not a list item
        if (inList && !line.match(/^[\s]*[-*•]\s/) && !line.match(/^[\s]*\d+\.\s/) && line.trim() !== '') {
            html.push('</ul>');
            inList = false;
        }

        // Headers
        if (line.startsWith('#### ')) {
            html.push(`<h4 class="text-sm font-bold text-slate-700 dark:text-slate-300 mt-4 mb-1">${line.slice(5)}</h4>`);
            continue;
        }
        if (line.startsWith('### ')) {
            html.push(`<h3 class="text-base font-bold text-slate-800 dark:text-slate-200 mt-5 mb-2">${line.slice(4)}</h3>`);
            continue;
        }
        if (line.startsWith('## ')) {
            html.push(`<h2 class="text-lg font-extrabold text-slate-900 dark:text-white mt-6 mb-3 flex items-center gap-2">${line.slice(3)}</h2>`);
            continue;
        }
        if (line.startsWith('# ')) {
            html.push(`<h1 class="text-xl font-black text-slate-900 dark:text-white mt-4 mb-4">${line.slice(2)}</h1>`);
            continue;
        }

        // Table rows
        if (line.includes('|') && line.trim().startsWith('|')) {
            if (!inTable) {
                html.push('<div class="overflow-x-auto my-3"><table class="w-full text-sm border-collapse">');
                inTable = true;
            }
            // Skip separator rows
            if (line.match(/^\|[\s-:|]+\|$/)) continue;

            const cells = line.split('|').filter(c => c.trim() !== '');
            const isHeader = i + 1 < lines.length && lines[i + 1]?.match(/^\|[\s-:|]+\|$/);
            const tag = isHeader ? 'th' : 'td';
            const cellClass = isHeader
                ? 'px-3 py-2 text-left font-bold text-xs uppercase text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700'
                : 'px-3 py-2 text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800';
            html.push(`<tr>${cells.map(c => `<${tag} class="${cellClass}">${formatInline(c.trim())}</${tag}>`).join('')}</tr>`);
            continue;
        } else if (inTable) {
            html.push('</table></div>');
            inTable = false;
        }

        // Unordered list items
        if (line.match(/^[\s]*[-*•]\s/)) {
            if (!inList) {
                html.push('<ul class="space-y-1.5 my-2">');
                inList = true;
            }
            const content = line.replace(/^[\s]*[-*•]\s/, '');
            const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
            const ml = indent > 0 ? ' ml-4' : '';
            html.push(`<li class="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300${ml}"><span class="text-[#c04b00] mt-0.5 flex-shrink-0">•</span><span>${formatInline(content)}</span></li>`);
            continue;
        }

        // Ordered list items
        if (line.match(/^[\s]*\d+\.\s/)) {
            if (!inList) {
                html.push('<ul class="space-y-1.5 my-2">');
                inList = true;
            }
            const match = line.match(/^[\s]*(\d+)\.\s(.*)/);
            if (match) {
                html.push(`<li class="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"><span class="text-[#c04b00] font-bold mt-0.5 flex-shrink-0 min-w-[20px]">${match[1]}.</span><span>${formatInline(match[2])}</span></li>`);
            }
            continue;
        }

        // Empty lines
        if (line.trim() === '') {
            html.push('<div class="h-2"></div>');
            continue;
        }

        // Horizontal rule
        if (line.match(/^---+$/)) {
            html.push('<hr class="my-4 border-slate-200 dark:border-slate-700" />');
            continue;
        }

        // Regular paragraph
        html.push(`<p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed my-1">${formatInline(line)}</p>`);
    }

    if (inList) html.push('</ul>');
    if (inTable) html.push('</table></div>');

    return html.join('\n');
}

function formatInline(text: string): string {
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
    // Italic
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    text = text.replace(/`(.+?)`/g, '<code class="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono text-[#c04b00]">$1</code>');
    return text;
}

// Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface AnalysisResult {
    content: string;
    type: string;
    generated_at: string;
    data_summary: {
        total_employees: number;
        total_eating: number;
        total_not_eating: number;
        cancel_rate: string;
        date_range: string;
    };
}

const REPORT_TYPES = [
    {
        id: 'waste' as const,
        title: 'Phân tích lãng phí',
        description: 'AI phân tích pattern cancel, tìm anomaly, đề xuất giảm lãng phí',
        icon: 'analytics',
        gradient: 'from-rose-500 to-orange-500',
        bgGradient: 'from-rose-50 to-orange-50 dark:from-rose-900/20 dark:to-orange-900/20',
        borderColor: 'border-rose-200 dark:border-rose-800/30',
    },
    {
        id: 'menu' as const,
        title: 'Gợi ý menu',
        description: 'AI đề xuất thực đơn dựa trên trend đăng ký và feedback',
        icon: 'restaurant_menu',
        gradient: 'from-emerald-500 to-teal-500',
        bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20',
        borderColor: 'border-emerald-200 dark:border-emerald-800/30',
    },
    {
        id: 'monthly_report' as const,
        title: 'Báo cáo tháng',
        description: 'AI tạo báo cáo executive chuyên nghiệp gửi cho sếp',
        icon: 'summarize',
        gradient: 'from-blue-500 to-indigo-500',
        bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20',
        borderColor: 'border-blue-200 dark:border-blue-800/30',
    },
];

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    form_pending?: boolean;
    form_fields?: Array<{
        name: string;
        type: 'select' | 'date' | 'text';
        label: string;
        options?: Array<{ label: string; value: string }>;
        defaultValue?: string;
    }>;
    action_pending?: boolean;
    action_type?: string;
    action_args?: any;
    confirmation_token?: string;
    action_resolved?: boolean;
}

interface ChatSession {
    id: string;
    title: string;
    summary: string | null;
    message_count: number;
    updated_at: string;
}

const getActionLabel = (type?: string) => {
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

const renderActionDetails = (type?: string, args?: any) => {
    if (!args) return null;
    switch (type) {
        case 'modify_employee_meal':
        case 'modify_employee_meal_form':
            return (
                <>
                    <p>• Nhân viên: <strong>{args.employee_name || args.employee_id}</strong></p>
                    <p>• Ngày áp dụng: <strong>{args.date}</strong></p>
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

export default function AIReportsPage() {
    const [activeTab, setActiveTab] = useState<'reports' | 'chat'>('reports');
    const [activeType, setActiveType] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Feature gate state
    const [aiDisabled, setAiDisabled] = useState(false);
    const [aiDisabledMessage, setAiDisabledMessage] = useState('');

    const {
        chatMessages,
        chatInput,
        chatLoading,
        sessions,
        activeSessionId,
        isRecording,
        recordingTime,
        isMuted,
        activeFormValues,
        showSessions,
        setChatInput,
        setShowSessions,
        setIsMuted,
        handleChat,
        handleConfirmAction,
        handleCancelAction,
        handleSubmitForm,
        handleFormChange,
        handleCreateSession,
        handleDeleteSession,
        handleSwitchSession,
        handleClearChat,
        startRecording,
        stopRecording,
        speakText,
        stopSpeaking,
        chatEndRef,
        chatInputRef
    } = useAIChat();

    const handleAnalyze = async (type: string) => {
        setActiveType(type);
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            });

            if (!response.ok) {
                const data = await response.json();
                if (response.status === 403 && data.upgrade_required) {
                    setAiDisabled(true);
                    setAiDisabledMessage(data.error || 'Tính năng AI chưa được kích hoạt.');
                }
                throw new Error(data.error || 'Lỗi khi gọi AI');
            }

            const data = await response.json();
            setResult(data);
        } catch (err: any) {
            setError(err.message || 'Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (result?.content) {
            navigator.clipboard.writeText(result.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25">
                        <Icon name="auto_awesome" className="text-[28px]" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                            AI Báo cáo
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Gemini AI phân tích dữ liệu 30 ngày gần nhất
                        </p>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                    <button
                        onClick={() => setActiveTab('reports')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'reports'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        <Icon name="summarize" className="text-[16px]" />
                        Báo cáo
                    </button>
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'chat'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        <Icon name="chat" className="text-[16px]" />
                        Chat AI
                    </button>
                </div>
            </div>

            {/* ========= REPORTS TAB ========= */}
            {activeTab === 'reports' && (
                <>
                    {/* Report Type Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {REPORT_TYPES.map((report) => (
                            <button
                                key={report.id}
                                onClick={() => handleAnalyze(report.id)}
                                disabled={loading}
                                className={`
                            relative overflow-hidden p-5 rounded-xl border text-left
                            transition-all duration-200 group
                            ${activeType === report.id
                                        ? `bg-gradient-to-br ${report.bgGradient} ${report.borderColor} shadow-md ring-2 ring-offset-2 ring-[#c04b00]/30`
                                        : `bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-[#c04b00]/30`
                                    }
                            ${loading ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
                        `}
                            >
                                {/* Gradient accent bar */}
                                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${report.gradient} opacity-0 group-hover:opacity-100 transition-opacity ${activeType === report.id ? 'opacity-100' : ''}`} />

                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-lg bg-gradient-to-br ${report.gradient} text-white shadow-sm`}>
                                        <Icon name={report.icon} className="text-[22px]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1">
                                            {report.title}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                            {report.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Loading indicator on active card */}
                                {loading && activeType === report.id && (
                                    <div className="mt-3 flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#c04b00] animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#c04b00] animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#c04b00] animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        <span className="text-xs text-[#c04b00] font-medium">AI đang phân tích...</span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl p-4 flex items-start gap-3">
                            <Icon name="error" className="text-red-500 text-[22px] flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-sm font-bold text-red-800 dark:text-red-300">Lỗi</h4>
                                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Loading Skeleton */}
                    {loading && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                            <div className="animate-pulse space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
                                    <div className="space-y-2 flex-1">
                                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
                                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-4/6" />
                                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                                </div>
                                <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded" />
                                <div className="space-y-3">
                                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {result && !loading && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                            {/* Result Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                                        <Icon name="auto_awesome" className="text-[18px]" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                            {REPORT_TYPES.find(r => r.id === result.type)?.title}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {result.data_summary.date_range} · {result.data_summary.total_employees} nhân viên
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-medium text-slate-600 dark:text-slate-400"
                                    >
                                        <Icon name={copied ? "check" : "content_copy"} className="text-[16px]" />
                                        {copied ? 'Đã copy' : 'Copy'}
                                    </button>
                                    <button
                                        onClick={() => handleAnalyze(result.type)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c04b00]/10 hover:bg-[#c04b00]/20 transition-colors text-xs font-bold text-[#c04b00]"
                                    >
                                        <Icon name="refresh" className="text-[16px]" />
                                        Tạo lại
                                    </button>
                                </div>
                            </div>

                            {/* Data Summary Pills */}
                            <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium">
                                    <Icon name="group" className="text-[14px]" />
                                    {result.data_summary.total_employees} NV
                                </span>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-medium">
                                    <Icon name="restaurant" className="text-[14px]" />
                                    {result.data_summary.total_eating} suất ăn
                                </span>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs font-medium">
                                    <Icon name="cancel" className="text-[14px]" />
                                    {result.data_summary.total_not_eating} huỷ
                                </span>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs font-medium">
                                    <Icon name="trending_down" className="text-[14px]" />
                                    {result.data_summary.cancel_rate}% lãng phí
                                </span>
                            </div>

                            {/* AI Generated Content */}
                            <div
                                className="px-6 py-5 prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(result.content) }}
                            />

                            {/* Footer */}
                            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                    <Icon name="smart_toy" className="text-[14px]" />
                                    Powered by Gemini AI · {new Date(result.generated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                    ⚠️ AI có thể sai, hãy kiểm chứng số liệu
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {!loading && !result && !error && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                            <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 mb-4">
                                <Icon name="auto_awesome" className="text-[40px] text-purple-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
                                Chọn loại báo cáo để bắt đầu
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                                AI sẽ đọc dữ liệu 30 ngày gần nhất từ hệ thống và tạo báo cáo phân tích chi tiết cho bạn.
                            </p>
                        </div>
                    )}
                </>
            )}

            {/* ========= CHAT TAB ========= */}
            {activeTab === 'chat' && (
                <div className="flex gap-4" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
                    {/* Session Sidebar */}
                    <div className={`${showSessions ? 'block' : 'hidden'} md:block w-full md:w-64 flex-shrink-0`}>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm h-full flex flex-col">
                            {/* Sessions Header */}
                            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Phiên chat</h3>
                                    <button
                                        onClick={() => handleCreateSession()}
                                        className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-600 transition-colors"
                                        title="Tạo phiên mới"
                                    >
                                        <Icon name="add" className="text-[16px]" />
                                    </button>
                                </div>
                            </div>

                            {/* Sessions List */}
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {/* Default session */}
                                <button
                                    onClick={() => handleSwitchSession('default')}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-xs ${activeSessionId === 'default'
                                        ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-700'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon name="chat" className="text-[14px]" />
                                        <span className="truncate">Chat chung</span>
                                    </div>
                                </button>

                                {/* Custom sessions */}
                                {sessions.map(session => (
                                    <div
                                        key={session.id}
                                        className={`group w-full text-left px-3 py-2.5 rounded-lg transition-all text-xs cursor-pointer ${activeSessionId === session.id
                                            ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-700'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                        onClick={() => handleSwitchSession(session.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Icon name="forum" className="text-[14px] flex-shrink-0" />
                                                <span className="truncate">{session.title}</span>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-all"
                                                title="Xoá phiên"
                                            >
                                                <Icon name="close" className="text-[14px]" />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                            {session.message_count} tin · {new Date(session.updated_at).toLocaleDateString('vi-VN')}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Storage info */}
                            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800">
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    🧠 Auto-summarize khi {'>'} 20 tin
                                </p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    🗑️ Tự dọn dẹp mỗi quý
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                        {/* Chat Header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                            <div className="flex items-center gap-2.5">
                                {/* Mobile session toggle */}
                                <button
                                    onClick={() => setShowSessions(!showSessions)}
                                    className="md:hidden p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500"
                                >
                                    <Icon name="menu" className="text-[16px]" />
                                </button>
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                                    <Icon name="smart_toy" className="text-[16px] text-white" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                        {activeSessionId === 'default'
                                            ? 'Cơm Ngon AI'
                                            : sessions.find(s => s.id === activeSessionId)?.title || 'Cơm Ngon AI'
                                        }
                                    </h3>
                                    <p className="text-[11px] text-green-500 font-medium flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                        Sẵn sàng · {chatMessages.length} tin nhắn
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        const newMute = !isMuted;
                                        setIsMuted(newMute);
                                        if (newMute) {
                                            stopSpeaking();
                                        }
                                    }}
                                    className={`flex items-center justify-center p-2 rounded-lg transition-all ${
                                        !isMuted 
                                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-bold' 
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
                                    }`}
                                    title={isMuted ? "Bật đọc giọng nói (TTS)" : "Tắt đọc giọng nói (TTS)"}
                                >
                                    <Icon name={isMuted ? "volume_off" : "volume_up"} className="text-[18px]" />
                                </button>

                                {chatMessages.length > 0 && (
                                    <button
                                        onClick={handleClearChat}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-xs font-medium text-slate-500 hover:text-red-500"
                                    >
                                        <Icon name="delete_sweep" className="text-[16px]" />
                                        Xoá
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            {/* AI Disabled Banner */}
                            {aiDisabled && (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl p-4 flex items-start gap-3">
                                    <span className="material-symbols-outlined text-amber-500 text-[22px] flex-shrink-0 mt-0.5">block</span>
                                    <div>
                                        <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300">Tính năng AI đã bị tắt</h4>
                                        <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">{aiDisabledMessage}</p>
                                        <p className="text-xs text-amber-500 dark:text-amber-500 mt-2">Liên hệ quản trị viên hệ thống hoặc nâng cấp gói dịch vụ để sử dụng.</p>
                                    </div>
                                </div>
                            )}

                            {/* Welcome message */}
                            {chatMessages.length === 0 && !aiDisabled && (
                                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                    <div className="inline-flex p-5 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 mb-4">
                                        <Icon name="chat" className="text-[48px] text-purple-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
                                        Chat với AI về suất ăn
                                    </h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6">
                                        Hỏi bất kỳ câu hỏi nào về suất ăn, lãng phí, menu, chi phí... AI sẽ phân tích dữ liệu và trả lời.
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                                        {[
                                            'Ai nghỉ nhiều nhất tháng này?',
                                            'Phòng ban nào hủy nhiều?',
                                            'Tỷ lệ lãng phí tháng này?',
                                            'Viết báo cáo cho sếp ngắn gọn',
                                        ].map(suggestion => (
                                            <button
                                                key={suggestion}
                                                onClick={() => { setChatInput(suggestion); chatInputRef.current?.focus(); }}
                                                className="text-left px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all text-xs text-slate-600 dark:text-slate-400"
                                            >
                                                💬 {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Chat Messages */}
                            {chatMessages.map((msg, idx) => (
                                <div key={`${msg.role}-${msg.timestamp || idx}-${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] ${msg.role === 'user'
                                        ? 'bg-gradient-to-br from-[#c04b00] to-[#e05500] text-white rounded-2xl rounded-br-md px-4 py-3'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl rounded-bl-md px-4 py-3'
                                        }`}>
                                        {msg.role === 'user' ? (
                                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                        ) : (
                                            <>
                                                <div
                                                    className="text-sm prose-sm max-w-none [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:ml-4 [&_ol]:mb-2 [&_li]:mb-0.5 [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_strong]:font-bold"
                                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                                />
                                                {/* Action Pending confirmation UI */}
                                                {msg.action_pending && !msg.action_resolved && (
                                                    <ChatActionCard
                                                        messageIndex={idx}
                                                        actionType={msg.action_type}
                                                        actionArgs={msg.action_args}
                                                        confirmationToken={msg.confirmation_token}
                                                        chatLoading={chatLoading}
                                                        onConfirm={handleConfirmAction}
                                                        onCancel={handleCancelAction}
                                                    />
                                                )}

                                                {/* Form Pending UI */}
                                                {msg.form_pending && !msg.action_resolved && (
                                                    <ChatPendingForm
                                                        messageIndex={idx}
                                                        confirmationToken={msg.confirmation_token}
                                                        formFields={msg.form_fields}
                                                        chatLoading={chatLoading}
                                                        activeFormValues={activeFormValues}
                                                        onFormChange={handleFormChange}
                                                        onSubmit={handleSubmitForm}
                                                        onCancel={handleCancelAction}
                                                    />
                                                )}
                                            </>
                                        )}
                                        <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'
                                            }`}>
                                            {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            ))}

                            {/* Typing indicator */}
                            {chatLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex gap-1">
                                                <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">AI đang suy nghĩ...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 bg-slate-50/50 dark:bg-slate-800/30">
                            {/* Inject keyframes animation style */}
                            <style dangerouslySetInnerHTML={{__html: `
                                @keyframes soundWave {
                                    0%, 100% { transform: scaleY(0.4); }
                                    50% { transform: scaleY(1.4); }
                                }
                            `}} />

                            <div className="flex items-end gap-3">
                                {isRecording ? (
                                    <div className="flex-1 flex items-center justify-between bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 px-4 py-3.5 rounded-xl min-h-[46px] mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
                                            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Đang thu âm giọng nói...</span>
                                            <span className="text-xs font-mono font-bold bg-rose-100 dark:bg-rose-900/50 px-2.5 py-0.5 rounded-lg text-rose-700 dark:text-rose-300">
                                                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                                            </span>
                                        </div>
                                        {/* Dynamic Waveform Visualizer */}
                                        <div className="flex items-center gap-1 h-6">
                                            <span className="w-1 bg-rose-500 rounded-full origin-bottom animate-[soundWave_0.6s_ease-in-out_infinite]" style={{ height: '14px', animationDelay: '0.1s' }} />
                                            <span className="w-1 bg-rose-500 rounded-full origin-bottom animate-[soundWave_0.6s_ease-in-out_infinite]" style={{ height: '22px', animationDelay: '0.2s' }} />
                                            <span className="w-1 bg-rose-500 rounded-full origin-bottom animate-[soundWave_0.6s_ease-in-out_infinite]" style={{ height: '10px', animationDelay: '0.3s' }} />
                                            <span className="w-1 bg-rose-500 rounded-full origin-bottom animate-[soundWave_0.6s_ease-in-out_infinite]" style={{ height: '24px', animationDelay: '0.4s' }} />
                                            <span className="w-1 bg-rose-500 rounded-full origin-bottom animate-[soundWave_0.6s_ease-in-out_infinite]" style={{ height: '16px', animationDelay: '0.5s' }} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 relative">
                                        <textarea
                                            ref={chatInputRef}
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleChat();
                                                }
                                            }}
                                            placeholder={aiDisabled ? 'Tính năng AI đã bị tắt...' : 'Hỏi AI về suất ăn, lãng phí, menu...'}
                                            rows={1}
                                            className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            style={{ maxHeight: '120px' }}
                                            disabled={chatLoading || aiDisabled}
                                        />
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 ml-1">
                                            Enter gửi · Shift+Enter xuống dòng · Tối đa 2000 ký tự
                                        </p>
                                    </div>
                                )}

                                {isRecording ? (
                                    <button
                                        onClick={stopRecording}
                                        className="p-3 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all flex-shrink-0 mb-5 cursor-pointer animate-pulse"
                                        title="Dừng và gửi"
                                    >
                                        <Icon name="mic_off" className="text-[20px]" />
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={startRecording}
                                            disabled={chatLoading || aiDisabled}
                                            className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex-shrink-0 mb-5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Nói với AI"
                                        >
                                            <Icon name="mic" className="text-[20px]" />
                                        </button>
                                        <button
                                            onClick={() => handleChat()}
                                            disabled={!chatInput.trim() || chatLoading || aiDisabled}
                                            className={`p-3 rounded-xl transition-all flex-shrink-0 mb-5 ${chatInput.trim() && !chatLoading
                                                ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 cursor-pointer'
                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                                }`}
                                        >
                                            <Icon name="send" className="text-[20px]" />
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2">
                                🔒 AI chỉ trả lời về suất ăn · 🎤 Hỗ trợ voice chat thông minh · 🧠 Đọc phát âm phản hồi tự động
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

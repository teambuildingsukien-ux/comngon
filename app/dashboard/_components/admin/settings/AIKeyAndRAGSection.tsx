'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface Props {
    hasKey: boolean;
    maskedKey: string | null;
    lastIndexedAt: string | null;
    onKeySaved: () => void;
}

export default function AIKeyAndRAGSection({ hasKey, maskedKey, lastIndexedAt, onKeySaved }: Props) {
    const [keyInput, setKeyInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [indexing, setIndexing] = useState(false);
    const [indexMsg, setIndexMsg] = useState('');
    const [stats, setStats] = useState<any>(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [aiLogs, setAiLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);

    // Fetch AI activity logs
    useEffect(() => {
        async function loadAILogs() {
            setLogsLoading(true);
            try {
                const res = await fetch('/api/admin/ai-logs');
                if (res.ok) {
                    const data = await res.json();
                    setAiLogs(data.logs || []);
                }
            } catch { /* ignore */ }
            finally { setLogsLoading(false); }
        }
        loadAILogs();
    }, []);

    const testKey = async () => {
        if (!keyInput) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/admin/ai-config/test-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: keyInput }),
            });
            const data = await res.json();
            setTestResult({ valid: data.valid, message: data.message || data.error });
        } catch {
            setTestResult({ valid: false, message: 'Lỗi kết nối' });
        } finally {
            setTesting(false);
        }
    };

    const saveKey = async () => {
        if (!keyInput) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/ai-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gemini_api_key: keyInput }),
            });
            const data = await res.json();
            if (data.success) {
                setKeyInput('');
                setTestResult({ valid: true, message: '✅ Đã lưu key thành công!' });
                onKeySaved();
            }
        } catch {
            setTestResult({ valid: false, message: 'Lỗi lưu key' });
        } finally {
            setSaving(false);
        }
    };

    const clearKey = async () => {
        if (!confirm('Xóa API key? AI sẽ không hoạt động nếu không có key.')) return;
        setSaving(true);
        try {
            await fetch('/api/admin/ai-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gemini_api_key: null }),
            });
            onKeySaved();
        } finally {
            setSaving(false);
        }
    };

    const fetchStats = async () => {
        setLoadingStats(true);
        try {
            const res = await fetch('/api/admin/ai-index');
            const data = await res.json();
            if (data.success && data.data) {
                setStats({
                    chunks: data.data.rag?.total_chunks || 0,
                    entities: data.data.graph?.entities || 0,
                    relationships: data.data.graph?.relationships || 0,
                    communities: data.data.graph?.communities || 0
                });
            }
        } catch { /* ignore */ } finally {
            setLoadingStats(false);
        }
    };

    const triggerIndex = async (type: string) => {
        setIndexing(true);
        setIndexMsg(`Đang ${type === 'all' ? 'rebuild toàn bộ' : type === 'rag' ? 'index RAG' : 'build Knowledge Graph'}...`);
        try {
            const res = await fetch('/api/admin/ai-index', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            });
            const data = await res.json();
            if (data.success) {
                const summary = [];
                if (data.data?.rag) summary.push(`${data.data.rag.total_chunks} chunks`);
                if (data.data?.graph) summary.push(`${data.data.graph.entities} entities`);
                setIndexMsg(`✅ Hoàn tất! ${summary.length ? summary.join(' | ') : ''}`);
                // Update last_indexed_at
                await fetch('/api/admin/ai-config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ last_indexed_at: new Date().toISOString() }),
                });
                fetchStats();
            } else {
                setIndexMsg(`❌ Lỗi: ${data.error}`);
            }
        } catch (e: any) {
            setIndexMsg(`❌ ${e.message}`);
        } finally {
            setIndexing(false);
            setTimeout(() => setIndexMsg(''), 8000);
        }
    };

    const statCards = [
        { icon: 'description', label: 'RAG Chunks', value: stats?.chunks ?? '—', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
        { icon: 'hub', label: 'KG Entities', value: stats?.entities ?? '—', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
        { icon: 'link', label: 'Relationships', value: stats?.relationships ?? '—', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
        { icon: 'groups', label: 'Communities', value: stats?.communities ?? '—', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    ];

    const mainContent = (
        <>
            {/* Section 1: API Key */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Icon name="key" className="text-amber-500" />
                    API Key — Gemini AI
                </h3>
                <p className="text-xs text-slate-400">
                    Nhập API key để kích hoạt AI. Mỗi doanh nghiệp có key riêng, chi phí tự chịu.{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                        className="text-[#c04b00] underline hover:no-underline">
                        Lấy key miễn phí tại Google AI Studio →
                    </a>
                </p>

                {/* Current status */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${hasKey
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                    <Icon name={hasKey ? 'check_circle' : 'error'} className="text-base" />
                    {hasKey ? `Đã cài đặt key: ${maskedKey}` : 'Chưa cài đặt API key — AI sẽ không hoạt động'}
                </div>

                {/* Input */}
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full px-4 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none font-mono text-sm"
                        />
                        <button onClick={() => setShowKey(!showKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <Icon name={showKey ? 'visibility_off' : 'visibility'} className="text-lg" />
                        </button>
                    </div>
                    <button onClick={testKey} disabled={testing || !keyInput}
                        className="px-4 py-2.5 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 text-sm flex items-center gap-1">
                        <Icon name={testing ? 'hourglass_top' : 'science'} className="text-base" />
                        {testing ? 'Test...' : 'Test'}
                    </button>
                    <button onClick={saveKey} disabled={saving || !keyInput}
                        className="px-4 py-2.5 bg-[#c04b00] text-white font-bold rounded-lg hover:bg-[#a03f00] transition-all disabled:opacity-50 text-sm flex items-center gap-1">
                        <Icon name="save" className="text-base" />
                        Lưu
                    </button>
                </div>

                {hasKey && (
                    <button onClick={clearKey} disabled={saving}
                        className="text-xs text-red-500 hover:text-red-700 underline">
                        Xóa key hiện tại
                    </button>
                )}

                {testResult && (
                    <div className={`p-3 rounded-lg text-sm font-medium ${testResult.valid
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                        }`}>
                        {testResult.message}
                    </div>
                )}
            </div>

            {/* Section 3: RAG Intelligence */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <Icon name="neurology" className="text-violet-500" />
                        RAG Intelligence
                    </h3>
                    <button onClick={fetchStats} disabled={loadingStats}
                        className="text-xs text-slate-500 hover:text-[#c04b00] flex items-center gap-1">
                        <Icon name={loadingStats ? 'hourglass_top' : 'refresh'} className="text-sm" />
                        Tải stats
                    </button>
                </div>
                <p className="text-xs text-slate-400">
                    Hệ thống RAG giúp AI đọc hiểu toàn bộ dữ liệu doanh nghiệp: nhân viên, đơn hàng, thống kê, Knowledge Base.
                </p>

                {/* Stats cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {statCards.map(s => (
                        <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                            <Icon name={s.icon} className={`${s.color} text-2xl`} />
                            <div className="text-xl font-extrabold text-slate-800 dark:text-white mt-1">{s.value}</div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{s.label}</div>
                        </div>
                    ))}
                </div>

                {lastIndexedAt && (
                    <p className="text-xs text-slate-400">
                        🕐 Index gần nhất: {new Date(lastIndexedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => triggerIndex('rag')} disabled={indexing || !hasKey}
                        className="px-4 py-2.5 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 text-sm flex items-center gap-1.5">
                        <Icon name="description" className="text-base" />
                        Index RAG
                    </button>
                    <button onClick={() => triggerIndex('kg')} disabled={indexing || !hasKey}
                        className="px-4 py-2.5 bg-purple-500 text-white font-bold rounded-lg hover:bg-purple-600 transition-all disabled:opacity-50 text-sm flex items-center gap-1.5">
                        <Icon name="hub" className="text-base" />
                        Build Graph
                    </button>
                    <button onClick={() => triggerIndex('all')} disabled={indexing || !hasKey}
                        className="px-4 py-2.5 bg-gradient-to-r from-[#c04b00] to-orange-500 text-white font-bold rounded-lg hover:from-[#a03f00] hover:to-orange-600 transition-all disabled:opacity-50 text-sm flex items-center gap-1.5 shadow-sm">
                        <Icon name="bolt" className="text-base" />
                        Rebuild All
                    </button>
                </div>

                {!hasKey && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Icon name="warning" className="text-sm" /> Cần cài API key trước khi index
                    </p>
                )}

                {indexMsg && (
                    <div className={`p-3 rounded-lg text-sm font-medium ${indexMsg.includes('✅')
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : indexMsg.includes('❌')
                            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                        }`}>
                        {indexing && <span className="inline-block animate-spin mr-2">⏳</span>}
                        {indexMsg}
                    </div>
                )}
            </div>
        </>
    );

    const aiLogIcons: Record<string, string> = {
        'ai_chat_query': '💬',
        'cron_ai_sync': '🤖',
        'cron_ai_sync_summary': '📋',
        'ai_config_update': '⚙️',
    };

    return (
        <>
            {mainContent}

            {/* ===== Section 3: Lịch sử hoạt động AI ===== */}
            <div className="mt-6 p-5 rounded-xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Icon name="history" className="text-lg" />
                        Lịch sử hoạt động AI
                    </h3>
                    <span className="text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {aiLogs.length} entries
                    </span>
                </div>

                {logsLoading ? (
                    <p className="text-sm text-slate-500 text-center py-6">Đang tải...</p>
                ) : aiLogs.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">Chưa có hoạt động AI nào được ghi nhận</p>
                ) : (
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                        {aiLogs.map((log: any) => (
                            <div key={log.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-sm">
                                <span className="text-base flex-shrink-0">{aiLogIcons[log.action] || '🔄'}</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">
                                    {log.action === 'ai_chat_query' ? 'AI Chat' :
                                     log.action === 'cron_ai_sync' ? 'AI Sync' :
                                     log.action === 'cron_ai_sync_summary' ? 'AI Sync (Tổng kết)' :
                                     log.action}
                                </span>
                                <span className="text-xs text-slate-500 truncate max-w-[120px]">
                                    {log.performer_name || 'System'}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">
                                    {new Date(log.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

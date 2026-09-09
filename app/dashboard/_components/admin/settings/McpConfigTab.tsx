'use client';

import { useState, useEffect, useCallback } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    is_active: boolean;
    last_used_at: string | null;
    expires_at: string | null;
    created_at: string;
}

export default function McpConfigTab() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyScope, setNewKeyScope] = useState<'read' | 'read_write'>('read_write');
    const [creating, setCreating] = useState(false);
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [selectedKeyForConfig, setSelectedKeyForConfig] = useState<string>('');
    const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
    const [activeSubTab, setActiveSubTab] = useState<'quickstart' | 'keys' | 'tester' | 'tools'>('quickstart');

    // Tester state
    const [testingTool, setTestingTool] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<string | null>(null);

    const mcpEndpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : 'https://comngon.io.vn/api/mcp';

    const fetchKeys = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/api-keys');
            if (res.ok) {
                const data = await res.json();
                setKeys(data.keys || []);
                if (data.keys?.length > 0 && !selectedKeyForConfig) {
                    setSelectedKeyForConfig(data.keys[0].key_prefix);
                }
            }
        } catch (err) {
            console.error('Error fetching API keys:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedKeyForConfig]);

    useEffect(() => {
        fetchKeys();
    }, [fetchKeys]);

    async function handleCreateKey() {
        if (!newKeyName.trim()) return;
        try {
            setCreating(true);
            const scopes = newKeyScope === 'read' ? ['read'] : ['read', 'write'];
            const res = await fetch('/api/admin/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName.trim(), scopes }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể tạo key');
            setCreatedKey(data.full_key);
            setSelectedKeyForConfig(data.full_key);
            setNewKeyName('');
            setNewKeyScope('read_write');
            setShowCreateModal(false);
            await fetchKeys();
        } catch (err: any) {
            alert('❌ Lỗi: ' + err.message);
        } finally {
            setCreating(false);
        }
    }

    async function handleToggle(id: string, isActive: boolean) {
        try {
            await fetch(`/api/admin/api-keys/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !isActive }),
            });
            fetchKeys();
        } catch (err) {
            console.error('Toggle error:', err);
        }
    }

    async function handleDelete(id: string, name: string) {
        if (!confirm(`Bạn chắc chắn muốn xoá API key "${name}"? Các AI Agent dùng key này sẽ mất kết nối.`)) return;
        try {
            await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
            fetchKeys();
        } catch (err) {
            console.error('Delete error:', err);
        }
    }

    function copyToClipboard(text: string, targetId: string) {
        navigator.clipboard.writeText(text);
        setCopiedTarget(targetId);
        setTimeout(() => setCopiedTarget(null), 2000);
    }

    // Tester execution
    async function runTestTool(toolName: string, args: Record<string, any>) {
        try {
            setTestingTool(toolName);
            setTestResult('⏳ Đang gửi yêu cầu JSON-RPC đến máy chủ...');
            const res = await fetch('/api/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'tools/call',
                    params: { name: toolName, arguments: args }
                })
            });
            const data = await res.json();
            if (data.result?.content?.[0]?.text) {
                setTestResult(data.result.content[0].text);
            } else if (data.result?.isError) {
                setTestResult(`❌ Lỗi: ${data.result.content?.[0]?.text || JSON.stringify(data.result)}`);
            } else {
                setTestResult(JSON.stringify(data, null, 2));
            }
        } catch (err: any) {
            setTestResult(`❌ Lỗi kết nối: ${err.message}`);
        } finally {
            setTestingTool(null);
        }
    }

    const currentKeyPlaceholder = createdKey || (keys.length > 0 ? keys[0].key_prefix.replace('...', '_YOUR_TOKEN') : 'sk_live_YOUR_API_KEY');

    const claudeJson = JSON.stringify({
        mcpServers: {
            "com-ngon": {
                url: mcpEndpoint,
                headers: {
                    "x-api-key": currentKeyPlaceholder
                }
            }
        }
    }, null, 2);

    const cursorJson = JSON.stringify({
        mcpServers: {
            "com-ngon": {
                url: mcpEndpoint,
                headers: {
                    "x-api-key": currentKeyPlaceholder
                }
            }
        }
    }, null, 2);

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
            {/* Header Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1c1917] via-[#141210] to-[#0c0a09] border border-amber-500/20 p-6 sm:p-8 shadow-2xl">
                <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold mb-3">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            Model Context Protocol (MCP) Cloud 2026
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                            <Icon name="hub" className="text-amber-500 text-3xl" />
                            Cấu Hình MCP & API Token
                        </h2>
                        <p className="text-slate-400 text-sm mt-2 max-w-2xl leading-relaxed">
                            Kết nối AI Agent bên ngoài (<strong className="text-slate-200">Claude Desktop, Cursor IDE, Windsurf, n8n</strong>) trực tiếp với máy chủ đám mây Cơm Ngon trên Vercel để tự động hoá tra cứu suất ăn, báo cáo bếp và quản trị nhân sự.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-sm shadow-lg shadow-orange-600/30 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                        >
                            <Icon name="add" className="text-xl" />
                            <span>Tạo API Token Mới</span>
                        </button>
                    </div>
                </div>

                {/* Status Bar */}
                <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <Icon name="dns" className="text-amber-400 text-xl" />
                        <div>
                            <p className="text-slate-500 font-medium">Cloud Server</p>
                            <p className="font-bold text-slate-200">Vercel Serverless (JSON-RPC 2.0)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <Icon name="wifi_tethering" className="text-emerald-400 text-xl" />
                        <div>
                            <p className="text-slate-500 font-medium">Trạng thái Endpoint</p>
                            <p className="font-bold text-emerald-400">Đang hoạt động trực tiếp 🟢</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <Icon name="vpn_key" className="text-sky-400 text-xl" />
                        <div>
                            <p className="text-slate-500 font-medium">Tổng Token hoạt động</p>
                            <p className="font-bold text-slate-200">{keys.filter(k => k.is_active).length} / {keys.length} Tokens</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cloud Endpoint URL Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#1a1816] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                        <Icon name="link" className="text-xl" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Remote MCP Endpoint (Cloud)</p>
                        <p className="font-mono text-sm sm:text-base font-bold text-amber-300 select-all">{mcpEndpoint}</p>
                    </div>
                </div>
                <button
                    onClick={() => copyToClipboard(mcpEndpoint, 'endpoint')}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-bold transition-all border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                    <Icon name={copiedTarget === 'endpoint' ? 'check' : 'content_copy'} className="text-sm" />
                    <span>{copiedTarget === 'endpoint' ? 'Đã sao chép URL!' : 'Sao chép URL'}</span>
                </button>
            </div>

            {/* Navigation Sub-tabs */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
                <button
                    onClick={() => setActiveSubTab('quickstart')}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeSubTab === 'quickstart'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Icon name="rocket_launch" className="text-lg" />
                    <span>Cấu hình AI Agent</span>
                </button>

                <button
                    onClick={() => setActiveSubTab('keys')}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeSubTab === 'keys'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Icon name="key" className="text-lg" />
                    <span>Quản lý API Tokens ({keys.length})</span>
                </button>

                <button
                    onClick={() => setActiveSubTab('tester')}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeSubTab === 'tester'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Icon name="play_circle" className="text-lg" />
                    <span>Kiểm thử Chỉ Đọc (Live Tester)</span>
                </button>

                <button
                    onClick={() => setActiveSubTab('tools')}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeSubTab === 'tools'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Icon name="construction" className="text-lg" />
                    <span>Danh mục 19 Tools</span>
                </button>
            </div>

            {/* TAB 1: QUICKSTART CONFIGS */}
            {activeSubTab === 'quickstart' && (
                <div className="space-y-6">
                    <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-4">
                        <Icon name="info" className="text-2xl text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-slate-300 leading-relaxed">
                            <p className="font-bold text-amber-300 mb-1">Kết nối Đám mây Không Cần Cài Đặt (Zero Local Setup):</p>
                            Sao chép cấu hình JSON dưới đây dán vào tệp cấu hình của AI Agent (Claude Desktop hoặc Cursor IDE). AI Agent sẽ tự động gửi lệnh trực tiếp đến máy chủ Vercel mà không cần chạy bất cứ tiến trình nào trên máy tính bạn.
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Claude Desktop Config */}
                        <div className="rounded-2xl bg-[#141318] border border-white/10 overflow-hidden shadow-xl flex flex-col">
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/5 text-xs text-slate-400">
                                <div className="flex items-center gap-2 font-mono font-bold text-slate-300">
                                    <span>🤖 Claude Desktop (claude_desktop_config.json)</span>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(claudeJson, 'claude')}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold transition-all border border-white/10 flex items-center gap-1 cursor-pointer"
                                >
                                    <Icon name={copiedTarget === 'claude' ? 'check' : 'content_copy'} className="text-sm" />
                                    <span>{copiedTarget === 'claude' ? 'Đã sao chép' : 'Sao chép JSON'}</span>
                                </button>
                            </div>
                            <div className="p-4 bg-black/40 font-mono text-xs text-amber-200/90 overflow-x-auto flex-1">
                                <pre>{claudeJson}</pre>
                            </div>
                            <div className="p-3 bg-white/[0.02] border-t border-white/5 text-[11px] text-slate-500">
                                Vị trí tệp: <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows) hoặc <code>~/Library/Application Support/Claude/...</code> (macOS)
                            </div>
                        </div>

                        {/* Cursor IDE Config */}
                        <div className="rounded-2xl bg-[#141318] border border-white/10 overflow-hidden shadow-xl flex flex-col">
                            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/5 text-xs text-slate-400">
                                <div className="flex items-center gap-2 font-mono font-bold text-slate-300">
                                    <span>⚡ Cursor IDE (.cursor/mcp.json)</span>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(cursorJson, 'cursor')}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold transition-all border border-white/10 flex items-center gap-1 cursor-pointer"
                                >
                                    <Icon name={copiedTarget === 'cursor' ? 'check' : 'content_copy'} className="text-sm" />
                                    <span>{copiedTarget === 'cursor' ? 'Đã sao chép' : 'Sao chép JSON'}</span>
                                </button>
                            </div>
                            <div className="p-4 bg-black/40 font-mono text-xs text-amber-200/90 overflow-x-auto flex-1">
                                <pre>{cursorJson}</pre>
                            </div>
                            <div className="p-3 bg-white/[0.02] border-t border-white/5 text-[11px] text-slate-500">
                                Cài đặt trong Cursor: Mở Settings &gt; Features &gt; MCP &gt; Add New MCP Server.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: API TOKENS MANAGEMENT */}
            {activeSubTab === 'keys' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-white">Danh sách API Tokens</h3>
                            <p className="text-slate-400 text-xs mt-0.5">Mã khóa xác thực bí mật để AI Agent của bạn được phép gọi các hàm nghiệp vụ.</p>
                        </div>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                        >
                            <Icon name="add" className="text-base" />
                            <span>Tạo Token mới</span>
                        </button>
                    </div>

                    {loading ? (
                        <div className="py-16 text-center text-slate-400">
                            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                            <p className="text-sm">Đang tải danh sách Tokens...</p>
                        </div>
                    ) : keys.length === 0 ? (
                        <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 mx-auto mb-4">
                                <Icon name="vpn_key_off" className="text-3xl" />
                            </div>
                            <h4 className="text-base font-bold text-white">Chưa có API Token nào</h4>
                            <p className="text-slate-400 text-xs mt-1 max-w-md mx-auto">
                                Nhấn "Tạo Token mới" ở trên để tạo mã khóa đầu tiên và cấp quyền cho AI Agent bên ngoài.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {keys.map((key) => (
                                <div key={key.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-amber-500/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3.5">
                                        <div className={`w-3.5 h-3.5 rounded-full ${key.is_active ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-600'}`}></div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-white text-sm">{key.name}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                    key.scopes?.includes('write') || key.scopes?.includes('*')
                                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                        : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                                                }`}>
                                                    {key.scopes?.includes('write') || key.scopes?.includes('*') ? '⚡ Cả Đọc & Ghi (Full)' : '👁️ Chỉ đọc (Read-Only)'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                                                <span>{key.key_prefix}••••••••••••</span>
                                                <span>• Tạo: {new Date(key.created_at).toLocaleDateString('vi-VN')}</span>
                                                <span>• Lần dùng cuối: {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString('vi-VN') : 'Chưa dùng'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggle(key.id, key.is_active)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                                key.is_active
                                                    ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300'
                                                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300'
                                            }`}
                                        >
                                            {key.is_active ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(key.id, key.name)}
                                            className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-all cursor-pointer"
                                        >
                                            Xóa vĩnh viễn
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: LIVE TESTER */}
            {activeSubTab === 'tester' && (
                <div className="space-y-6">
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex items-start gap-4">
                        <Icon name="science" className="text-2xl text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-slate-300 leading-relaxed">
                            <p className="font-bold text-emerald-300 mb-1">Kiểm thử Chỉ Đọc Trực Tiếp (Live Inspector):</p>
                            Chọn một công cụ mẫu bên dưới để gửi yêu cầu JSON-RPC trực tiếp tới MCP Server trên Vercel. Dữ liệu trả về sẽ hiển thị ngay lập tức trong bảng điều khiển.
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <button
                            onClick={() => runTestTool('get_meal_statistics', { month: 8, year: 2026 })}
                            disabled={testingTool !== null}
                            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-amber-500/40 text-left transition-all hover:bg-white/[0.05] cursor-pointer disabled:opacity-50"
                        >
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3">
                                <Icon name="query_stats" className="text-2xl" />
                            </div>
                            <h4 className="text-sm font-bold text-white">get_meal_statistics</h4>
                            <p className="text-xs text-slate-400 mt-1">Thống kê tháng 8/2026 chuẩn SSOT.</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-blue-400">
                                Chạy thử ngay &rarr;
                            </span>
                        </button>

                        <button
                            onClick={() => runTestTool('get_employees_list', { search: 'Hải', limit: 5 })}
                            disabled={testingTool !== null}
                            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-amber-500/40 text-left transition-all hover:bg-white/[0.05] cursor-pointer disabled:opacity-50"
                        >
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
                                <Icon name="group" className="text-2xl" />
                            </div>
                            <h4 className="text-sm font-bold text-white">get_employees_list</h4>
                            <p className="text-xs text-slate-400 mt-1">Tìm kiếm nhân sự theo tên "Hải".</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                                Chạy thử ngay &rarr;
                            </span>
                        </button>

                        <button
                            onClick={() => runTestTool('get_employee_detail', { query: 'Hải' })}
                            disabled={testingTool !== null}
                            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-amber-500/40 text-left transition-all hover:bg-white/[0.05] cursor-pointer disabled:opacity-50"
                        >
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-3">
                                <Icon name="person" className="text-2xl" />
                            </div>
                            <h4 className="text-sm font-bold text-white">get_employee_detail</h4>
                            <p className="text-xs text-slate-400 mt-1">Hồ sơ NV và lịch sử ăn 7 ngày.</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-purple-400">
                                Chạy thử ngay &rarr;
                            </span>
                        </button>

                        <button
                            onClick={() => runTestTool('get_daily_order_details', { date: '2026-09-03' })}
                            disabled={testingTool !== null}
                            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-amber-500/40 text-left transition-all hover:bg-white/[0.05] cursor-pointer disabled:opacity-50"
                        >
                            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 mb-3">
                                <Icon name="checklist" className="text-2xl" />
                            </div>
                            <h4 className="text-sm font-bold text-white">get_daily_order_details</h4>
                            <p className="text-xs text-slate-400 mt-1">Chi tiết ai ăn cơm / ai báo nghỉ.</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-orange-400">
                                Chạy thử ngay &rarr;
                            </span>
                        </button>
                    </div>

                    {/* Output Console */}
                    <div className="rounded-2xl bg-[#0e0d10] border border-white/10 overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/5 text-xs text-slate-400">
                            <span className="font-mono">📺 Kết quả phản hồi từ Remote MCP (JSON-RPC)</span>
                            {testResult && (
                                <button
                                    onClick={() => setTestResult(null)}
                                    className="text-[11px] hover:text-white transition-colors cursor-pointer"
                                >
                                    Xóa màn hình
                                </button>
                            )}
                        </div>
                        <div className="p-4 font-mono text-xs sm:text-sm text-amber-200/90 min-h-[140px] whitespace-pre-wrap leading-relaxed">
                            {testResult || 'Chưa chạy kiểm thử. Hãy bấm vào một trong các công cụ ở trên để thử nghiệm.'}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: LIST OF 19 TOOLS */}
            {activeSubTab === 'tools' && (
                <div className="space-y-6">
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-3 flex items-center gap-2">
                            <Icon name="visibility" className="text-sm" />
                            Nhóm 1: Tra Cứu & Báo Cáo (10 Tools - Quyền Đọc)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                { name: 'get_meal_statistics', desc: 'Tra cứu thống kê suất ăn doanh nghiệp (tổng ăn, nghỉ, khách, chi phí) chuẩn SSOT.' },
                                { name: 'get_today_summary', desc: 'Lấy số lượng suất ăn hôm nay theo thời gian thực (ăn, nghỉ, khách, trạng thái bếp).' },
                                { name: 'get_employees_list', desc: 'Danh sách nhân sự, hỗ trợ tìm kiếm theo tên, email, mã NV, phòng ban.' },
                                { name: 'get_employee_detail', desc: 'Xem hồ sơ chi tiết 1 nhân sự và lịch sử đăng ký cơm 7 ngày gần nhất.' },
                                { name: 'get_kitchen_overview', desc: 'Tổng quan bếp ăn: số suất cần nấu, khách đặc biệt theo ngày.' },
                                { name: 'get_daily_order_details', desc: 'Xem chi tiết danh sách ai ăn cơm, ai báo nghỉ ăn ngày cụ thể kèm lý do.' },
                                { name: 'get_guest_meals_list', desc: 'Danh sách các đoàn khách đăng ký ăn cơm theo ngày hoặc theo tháng.' },
                                { name: 'get_cooking_schedule', desc: 'Lịch hoạt động của bếp ăn trong tháng: ngày nấu, ngày nghỉ lễ/bù.' },
                                { name: 'get_departments_list', desc: 'Danh sách tất cả các phòng ban và số lượng nhân sự từng phòng.' },
                                { name: 'get_announcements', desc: 'Xem các thông báo mới nhất từ Ban quản lý hoặc Bếp gửi công ty.' },
                            ].map((t) => (
                                <div key={t.name} className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                        READ
                                    </span>
                                    <div>
                                        <h4 className="font-mono font-bold text-white text-xs">{t.name}</h4>
                                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{t.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
                            <Icon name="bolt" className="text-sm" />
                            Nhóm 2: Vận Hành & Thao Tác (15 Tools - Quyền Ghi / Full Access)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                { name: 'update_meal_registration', desc: 'Đăng ký ăn hoặc hủy cơm cho 1 nhân viên theo tên/email/mã NV.' },
                                { name: 'batch_update_meal_registration', desc: 'Đăng ký ăn hoặc hủy cơm cho NHIỀU nhân viên cùng lúc vào một ngày.' },
                                { name: 'add_guest_meals', desc: 'Báo thêm số lượng suất ăn phát sinh cho đoàn khách.' },
                                { name: 'delete_guest_meals', desc: 'Hủy/xóa một đơn suất ăn khách đoàn đã đăng ký trước đó.' },
                                { name: 'create_employee', desc: 'Thêm mới một nhân viên vào hệ thống công ty.' },
                                { name: 'batch_create_employees', desc: 'Thêm hàng loạt nhân viên mới vào hệ thống từ danh sách.' },
                                { name: 'update_employee_status', desc: 'Cập nhật trạng thái làm việc nhân viên (active, paused, resigned).' },
                                { name: 'update_employee_profile', desc: 'Chỉnh sửa toàn diện hồ sơ: họ tên, phòng ban, mã NV, chức vụ, ăn mặc định.' },
                                { name: 'delete_employee', desc: 'Xóa nhân viên khỏi công ty hoặc đánh dấu nghỉ việc (resigned).' },
                                { name: 'set_cooking_exception', desc: 'Cài đặt ngày bếp nghỉ đột xuất (no_cook) hoặc nấu thêm (extra_cook).' },
                                { name: 'delete_cooking_exception', desc: 'Xóa ngày ngoại lệ để khôi phục lại lịch nấu ăn mặc định của bếp.' },
                                { name: 'send_announcement', desc: 'Đăng thông báo mới từ Quản trị viên/Bếp gửi đến toàn thể nhân viên.' },
                                { name: 'delete_announcement', desc: 'Gỡ bỏ hoặc xóa thông báo đã gửi theo mã ID.' },
                                { name: 'update_company_settings', desc: 'Cài đặt giờ chốt cơm, giờ tự động reset và ngày nấu ăn trong tuần.' },
                                { name: 'trigger_daily_meal_reset', desc: 'Kích hoạt lệnh tự động đồng bộ đơn cơm ngày mai cho toàn công ty.' },
                            ].map((t) => (
                                <div key={t.name} className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        WRITE
                                    </span>
                                    <div>
                                        <h4 className="font-mono font-bold text-white text-xs">{t.name}</h4>
                                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{t.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: CREATE TOKEN */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-[#161412] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Icon name="vpn_key" className="text-amber-400" />
                                Tạo API Token Mới
                            </h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-slate-400 hover:text-white cursor-pointer"
                            >
                                <Icon name="close" className="text-xl" />
                            </button>
                        </div>

                        <p className="text-xs text-slate-400">
                            Đặt tên gợi nhớ để phân biệt mục đích sử dụng (ví dụ: "Claude Desktop MacBook", "Cursor AI Team").
                        </p>

                        <div>
                            <label className="block text-xs font-bold text-slate-300 mb-1.5">Tên gợi nhớ của Token</label>
                            <input
                                type="text"
                                placeholder="VD: Claude Desktop của tôi"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-amber-500"
                                autoFocus
                            />
                        </div>

                        {/* BỘ CHỌN QUYỀN HẠN (SCOPE) */}
                        <div>
                            <label className="block text-xs font-bold text-slate-300 mb-2">Phân quyền thao tác (Scope)</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setNewKeyScope('read')}
                                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                        newKeyScope === 'read'
                                            ? 'bg-cyan-500/10 border-cyan-500/60 shadow-sm shadow-cyan-500/20'
                                            : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Icon name="visibility" className={newKeyScope === 'read' ? 'text-cyan-400' : 'text-slate-500'} />
                                        <span className={`text-xs font-bold ${newKeyScope === 'read' ? 'text-cyan-300' : 'text-slate-300'}`}>
                                            Chỉ đọc (Read-Only)
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                        Chỉ xem báo cáo, tra cứu suất ăn, nhân sự. An toàn tuyệt đối, AI không thể thay đổi dữ liệu.
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setNewKeyScope('read_write')}
                                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                        newKeyScope === 'read_write'
                                            ? 'bg-amber-500/10 border-amber-500/60 shadow-sm shadow-amber-500/20'
                                            : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Icon name="edit_note" className={newKeyScope === 'read_write' ? 'text-amber-400' : 'text-slate-500'} />
                                        <span className={`text-xs font-bold ${newKeyScope === 'read_write' ? 'text-amber-300' : 'text-slate-300'}`}>
                                            Cả Đọc & Ghi (Full)
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                        Cho phép tra cứu và thực hiện đặt/hủy cơm, thêm nhân viên, điều chỉnh lịch bếp tự động.
                                    </p>
                                </button>
                            </div>
                        </div>

                        <div className="pt-2 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={handleCreateKey}
                                disabled={creating || !newKeyName.trim()}
                                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold shadow-md shadow-orange-600/30 transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {creating ? 'Đang tạo...' : 'Tạo Token'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: TOKEN CREATED SUCCESS */}
            {createdKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="w-full max-w-lg bg-[#181614] border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                            <Icon name="check_circle" className="text-3xl" />
                        </div>

                        <div className="text-center">
                            <h3 className="text-xl font-bold text-white">Token Đã Được Tạo Thành Công!</h3>
                            <p className="text-xs text-amber-300/80 mt-1">
                                ⚠️ <strong>LƯU Ý QUAN TRỌNG:</strong> Đây là lần duy nhất mã khóa này hiển thị đầy đủ. Hãy sao chép và lưu vào nơi an toàn ngay bây giờ.
                            </p>
                        </div>

                        <div className="p-4 rounded-2xl bg-black/60 border border-white/10 font-mono text-xs text-amber-300 break-all select-all flex items-center justify-between gap-3">
                            <span>{createdKey}</span>
                            <button
                                onClick={() => copyToClipboard(createdKey, 'createdKey')}
                                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-all flex-shrink-0 cursor-pointer"
                            >
                                {copiedTarget === 'createdKey' ? 'Đã sao chép!' : 'Sao chép'}
                            </button>
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={() => setCreatedKey(null)}
                                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold shadow-lg shadow-orange-600/30 cursor-pointer"
                            >
                                Tôi đã lưu mã khóa này an toàn
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

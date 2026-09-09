'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenantFeatures } from '@/hooks/useTenantFeatures';

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

export default function ApiKeyManagement() {
    const { isEnabled } = useTenantFeatures();
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read']);
    const [creating, setCreating] = useState(false);
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const fetchKeys = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/api-keys');
            if (res.ok) {
                const data = await res.json();
                setKeys(data.keys);
            }
        } catch (err) {
            console.error('Error fetching API keys:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchKeys(); }, [fetchKeys]);

    async function handleCreate() {
        if (!newKeyName.trim()) return;
        try {
            setCreating(true);
            const res = await fetch('/api/admin/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setCreatedKey(data.full_key);
            setNewKeyName('');
            setNewKeyScopes(['read']);
            fetchKeys();
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
        if (!confirm(`Bạn chắc chắn muốn xoá API key "${name}"? Hành động này không thể hoàn tác.`)) return;
        try {
            await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
            fetchKeys();
        } catch (err) {
            console.error('Delete error:', err);
        }
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // Feature gate check
    if (!isEnabled('api_access')) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] p-6">
                <div className="text-center bg-white dark:bg-slate-800 rounded-3xl p-10 shadow-xl max-w-lg">
                    <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Icon name="key" className="text-4xl text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">API & Tích hợp</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                        Tạo API keys để tích hợp hệ thống bên ngoài với platform.
                        Nâng cấp lên gói <strong>Enterprise</strong> để sử dụng.
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 font-semibold text-sm">
                        <Icon name="lock" className="text-lg" />
                        Yêu cầu gói Enterprise
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        <Icon name="key" className="text-blue-600" />
                        API Keys
                    </h2>
                    <p className="text-slate-500 mt-1">Quản lý API keys để tích hợp hệ thống bên ngoài</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/25 flex items-center gap-2"
                >
                    <Icon name="add" className="text-lg" />
                    Tạo API Key
                </button>
            </div>

            {/* API Documentation */}
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-800/30">
                <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                    <Icon name="info" className="text-lg" /> Hướng dẫn sử dụng
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed">
                    Thêm header <code className="bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded text-xs font-mono">x-api-key: sk_live_xxx</code> vào
                    mỗi request gửi tới <code className="bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded text-xs font-mono">/api/v1/*</code> endpoints.
                </p>
            </div>

            {/* Keys List */}
            {keys.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <Icon name="vpn_key_off" className="text-5xl text-slate-300 dark:text-slate-600 mb-4" />
                    <p className="text-slate-500 font-medium">Chưa có API key nào</p>
                    <p className="text-slate-400 text-sm mt-1">Tạo API key đầu tiên để bắt đầu tích hợp</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {keys.map((key) => (
                        <div key={key.id} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-full ${key.is_active ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                                    <div>
                                        <p className="font-bold text-slate-800 dark:text-white">{key.name}</p>
                                        <p className="text-xs font-mono text-slate-400 mt-0.5">{key.key_prefix}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">
                                        {key.last_used_at
                                            ? `Dùng lần cuối: ${new Date(key.last_used_at).toLocaleDateString('vi-VN')}`
                                            : 'Chưa sử dụng'}
                                    </span>
                                    <button
                                        onClick={() => handleToggle(key.id, key.is_active)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${key.is_active
                                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                            }`}
                                    >
                                        {key.is_active ? 'Active' : 'Inactive'}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(key.id, key.name)}
                                        className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                    >
                                        <Icon name="delete" className="text-lg" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-1.5 mt-3">
                                {key.scopes.map((scope) => (
                                    <span key={scope} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                                        {scope}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!createdKey) setShowCreateModal(false); }}>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        {createdKey ? (
                            /* Show created key */
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <Icon name="check_circle" className="text-4xl text-green-600" />
                                    </div>
                                    <h3 className="text-xl font-bold dark:text-white">API Key đã tạo!</h3>
                                </div>

                                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
                                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                        <Icon name="warning" className="text-sm" />
                                        Copy ngay! Key sẽ không hiển thị lại.
                                    </p>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 flex items-center gap-2">
                                    <code className="flex-1 text-xs font-mono text-slate-700 dark:text-slate-300 break-all">{createdKey}</code>
                                    <button
                                        onClick={() => copyToClipboard(createdKey)}
                                        className="p-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600 transition-all shrink-0"
                                    >
                                        <Icon name={copied ? 'check' : 'content_copy'} className="text-lg" />
                                    </button>
                                </div>

                                <button
                                    onClick={() => { setCreatedKey(null); setShowCreateModal(false); }}
                                    className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold text-sm"
                                >
                                    Đã copy, đóng
                                </button>
                            </div>
                        ) : (
                            /* Create form */
                            <div className="space-y-5">
                                <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                                    <Icon name="add_circle" className="text-blue-600" />
                                    Tạo API Key Mới
                                </h3>

                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Tên key</label>
                                    <input
                                        type="text"
                                        placeholder="VD: Integration App, CRM Sync..."
                                        value={newKeyName}
                                        onChange={(e) => setNewKeyName(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Quyền truy cập</label>
                                    <div className="flex gap-3">
                                        {['read', 'write'].map((scope) => (
                                            <label key={scope} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={newKeyScopes.includes(scope)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setNewKeyScopes([...newKeyScopes, scope]);
                                                        } else {
                                                            setNewKeyScopes(newKeyScopes.filter(s => s !== scope));
                                                        }
                                                    }}
                                                    className="w-4 h-4 rounded accent-blue-600"
                                                />
                                                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium capitalize">{scope}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowCreateModal(false)}
                                        className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm"
                                    >
                                        Huỷ
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={creating || !newKeyName.trim()}
                                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {creating ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <Icon name="key" className="text-lg" />
                                                Tạo key
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

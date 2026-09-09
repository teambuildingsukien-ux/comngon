'use client';

import { useState, useEffect } from 'react';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface KBDocument {
    id: string;
    title: string;
    content: string;
    category: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

const CATEGORY_OPTIONS = [
    { value: 'menu', label: '🍽️ Menu / Thực đơn', color: 'text-orange-600 bg-orange-50' },
    { value: 'policy', label: '📋 Chính sách', color: 'text-blue-600 bg-blue-50' },
    { value: 'recipe', label: '👨‍🍳 Công thức', color: 'text-green-600 bg-green-50' },
    { value: 'budget', label: '💰 Ngân sách', color: 'text-emerald-600 bg-emerald-50' },
    { value: 'operations', label: '⚙️ Vận hành', color: 'text-purple-600 bg-purple-50' },
    { value: 'other', label: '📄 Khác', color: 'text-slate-600 bg-slate-50' },
];

export default function KnowledgeBaseTab() {
    const [documents, setDocuments] = useState<KBDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Form state
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newCategory, setNewCategory] = useState('other');
    const [formError, setFormError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            setIsLoading(true);
            const res = await fetch('/api/admin/knowledge-base');
            const data = await res.json();
            if (data.success) {
                setDocuments(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch knowledge base:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdd = async () => {
        setFormError('');
        if (!newTitle.trim()) { setFormError('Vui lòng nhập tiêu đề'); return; }
        if (!newContent.trim()) { setFormError('Vui lòng nhập nội dung'); return; }

        try {
            setIsSubmitting(true);
            const res = await fetch('/api/admin/knowledge-base', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle, content: newContent, category: newCategory }),
            });
            const data = await res.json();
            if (data.success) {
                setDocuments([data.data, ...documents]);
                setNewTitle('');
                setNewContent('');
                setNewCategory('other');
                setShowAddForm(false);
            } else {
                setFormError(data.error);
            }
        } catch (error) {
            setFormError('Lỗi kết nối');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (docId: string) => {
        try {
            const res = await fetch(`/api/admin/knowledge-base?id=${docId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setDocuments(documents.filter(d => d.id !== docId));
                setDeleteConfirm(null);
            }
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    const getCategoryInfo = (cat: string) => {
        return CATEGORY_OPTIONS.find(c => c.value === cat) || CATEGORY_OPTIONS[5];
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c04b00]"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Icon name="menu_book" className="text-[#c04b00]" />
                        Knowledge Base AI
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Thêm tài liệu để AI hiểu rõ hơn về doanh nghiệp ({documents.length}/50)
                    </p>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-5 py-2.5 bg-[#c04b00] text-white font-bold rounded-xl hover:bg-[#a03f00] transition-all flex items-center gap-2 shadow-sm"
                >
                    <Icon name={showAddForm ? 'close' : 'add'} className="text-lg" />
                    {showAddForm ? 'Đóng' : 'Thêm tài liệu'}
                </button>
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-[#c04b00]/30 p-6 space-y-4">
                    <h3 className="font-bold text-slate-700 dark:text-slate-200">Thêm tài liệu mới</h3>

                    {formError && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded-lg">
                            ❌ {formError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5">Tiêu đề</label>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="VD: Quy trình vận hành bếp"
                                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5">Danh mục</label>
                            <select
                                value={newCategory}
                                onChange={(e) => setNewCategory(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none"
                            >
                                {CATEGORY_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">Nội dung</label>
                        <textarea
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                            rows={8}
                            placeholder="Nhập nội dung tài liệu. AI sẽ đọc toàn bộ nội dung này khi trả lời câu hỏi..."
                            className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#c04b00]/30 focus:border-[#c04b00] outline-none resize-none font-mono text-sm"
                            maxLength={50000}
                        />
                        <p className="text-[10px] text-slate-400 text-right mt-1">{newContent.length}/50,000 ký tự</p>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => { setShowAddForm(false); setFormError(''); }}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={isSubmitting}
                            className="px-5 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            <Icon name={isSubmitting ? 'hourglass_top' : 'check'} className="text-lg" />
                            {isSubmitting ? 'Đang lưu...' : 'Thêm tài liệu'}
                        </button>
                    </div>
                </div>
            )}

            {/* Documents List */}
            {documents.length === 0 && !showAddForm ? (
                <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <Icon name="library_books" className="text-5xl text-slate-300 dark:text-slate-600" />
                    <p className="mt-3 text-slate-500 font-medium">Chưa có tài liệu nào</p>
                    <p className="text-xs text-slate-400 mt-1">Thêm tài liệu để AI hiểu doanh nghiệp tốt hơn</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {documents.map((doc) => {
                        const catInfo = getCategoryInfo(doc.category);
                        const isExpanded = expandedDoc === doc.id;
                        const isDeleting = deleteConfirm === doc.id;

                        return (
                            <div
                                key={doc.id}
                                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all"
                            >
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${catInfo.color} dark:bg-opacity-20 whitespace-nowrap`}>
                                            {catInfo.label}
                                        </span>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-sm text-slate-800 dark:text-white truncate">{doc.title}</h4>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                {doc.content.length.toLocaleString()} ký tự • {new Date(doc.created_at).toLocaleDateString('vi-VN')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isDeleting ? (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                                                    className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600"
                                                >
                                                    Xác nhận xóa
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                                                    className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300"
                                                >
                                                    Hủy
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(doc.id); }}
                                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                title="Xóa tài liệu"
                                            >
                                                <Icon name="delete" className="text-lg" />
                                            </button>
                                        )}
                                        <Icon name={isExpanded ? 'expand_less' : 'expand_more'} className="text-slate-400" />
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
                                        <pre className="mt-3 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-auto">
                                            {doc.content}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

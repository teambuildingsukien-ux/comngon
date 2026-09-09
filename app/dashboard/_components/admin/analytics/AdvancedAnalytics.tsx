'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTenantFeatures } from '@/hooks/useTenantFeatures';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface DailyTrend {
    date: string;
    eating: number;
    not_eating: number;
    cancelled: number;
    total: number;
}

interface DepartmentStat {
    department: string;
    eating: number;
    not_eating: number;
    total: number;
    rate: number;
}

interface AnalyticsData {
    overview: {
        totalUsers: number;
        avgDailyRegistration: number;
        overallRate: number;
        totalDays: number;
    };
    dailyTrend: DailyTrend[];
    departmentStats: DepartmentStat[];
}

export default function AdvancedAnalytics() {
    const { isEnabled } = useTenantFeatures();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/analytics');
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Lỗi không xác định');
            }
            const result = await res.json();
            setData(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Draw chart on canvas when data changes
    useEffect(() => {
        if (!data || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const trend = data.dailyTrend;
        if (trend.length === 0) return;

        // Canvas dimension (retina support)
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // Chart dimensions
        const padding = { top: 30, right: 20, bottom: 50, left: 50 };
        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;

        const maxVal = Math.max(...trend.map(d => d.total), 1);
        const stepX = chartW / Math.max(trend.length - 1, 1);

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Grid lines
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + chartH * (1 - i / 4);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            ctx.fillStyle = '#9ca3af';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(String(Math.round(maxVal * i / 4)), padding.left - 8, y + 4);
        }

        // Draw area + line for "eating"
        ctx.beginPath();
        trend.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const y = padding.top + chartH * (1 - d.eating / maxVal);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        // Close area
        const areaPath = new Path2D();
        trend.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const y = padding.top + chartH * (1 - d.eating / maxVal);
            if (i === 0) areaPath.moveTo(x, y);
            else areaPath.lineTo(x, y);
        });
        areaPath.lineTo(padding.left + (trend.length - 1) * stepX, padding.top + chartH);
        areaPath.lineTo(padding.left, padding.top + chartH);
        areaPath.closePath();

        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
        ctx.fillStyle = gradient;
        ctx.fill(areaPath);

        // Line
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Draw dots
        trend.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const y = padding.top + chartH * (1 - d.eating / maxVal);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#10b981';
            ctx.fill();
        });

        // X-axis labels (every 5th)
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        trend.forEach((d, i) => {
            if (i % 5 === 0 || i === trend.length - 1) {
                const x = padding.left + i * stepX;
                const label = d.date.substring(5); // MM-DD
                ctx.fillText(label, x, padding.top + chartH + 20);
            }
        });

    }, [data]);

    // Feature gate
    if (!isEnabled('advanced_analytics')) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] p-6">
                <div className="text-center bg-white dark:bg-slate-800 rounded-3xl p-10 shadow-xl max-w-lg">
                    <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Icon name="analytics" className="text-4xl text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">Phân tích nâng cao</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                        Biểu đồ xu hướng, phân tích phòng ban, và dự báo chi phí.
                        Nâng cấp lên gói <strong>Pro</strong> hoặc <strong>Enterprise</strong> để sử dụng.
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 font-semibold text-sm">
                        <Icon name="lock" className="text-lg" />
                        Yêu cầu nâng cấp
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[40vh] p-6">
                <div className="text-center bg-red-50 dark:bg-red-900/20 rounded-2xl p-8 max-w-md">
                    <Icon name="error_outline" className="text-4xl text-red-500 mb-3" />
                    <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
                    <button onClick={fetchData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold">
                        Thử lại
                    </button>
                </div>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        <Icon name="analytics" className="text-emerald-600" />
                        Phân tích nâng cao
                    </h2>
                    <p className="text-slate-500 mt-1">Dữ liệu 30 ngày gần nhất</p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-xl font-semibold text-sm hover:bg-emerald-100 transition-all flex items-center gap-2"
                >
                    <Icon name="refresh" className="text-lg" />
                    Làm mới
                </button>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                    <p className="text-xs text-slate-500 font-medium mb-1">Tổng nhân viên</p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-white">{data.overview.totalUsers}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 p-5 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                    <p className="text-xs text-slate-500 font-medium mb-1">TB đăng ký/ngày</p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-white">{data.overview.avgDailyRegistration}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-5 rounded-2xl border border-amber-100 dark:border-amber-800/30">
                    <p className="text-xs text-slate-500 font-medium mb-1">Tỉ lệ đăng ký ăn</p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-white">{data.overview.overallRate}%</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 p-5 rounded-2xl border border-purple-100 dark:border-purple-800/30">
                    <p className="text-xs text-slate-500 font-medium mb-1">Số ngày có dữ liệu</p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-white">{data.overview.totalDays}</p>
                </div>
            </div>

            {/* Daily Trend Chart (Canvas) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Icon name="show_chart" className="text-emerald-600" />
                    Xu hướng đăng ký ăn 30 ngày
                </h3>
                {data.dailyTrend.length > 0 ? (
                    <canvas ref={canvasRef} className="w-full h-64" style={{ width: '100%', height: '250px' }}></canvas>
                ) : (
                    <p className="text-center text-slate-400 py-10">Chưa có dữ liệu</p>
                )}
                <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        <span>Đăng ký ăn</span>
                    </div>
                </div>
            </div>

            {/* Department Stats Table */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Icon name="apartment" className="text-blue-600" />
                        Phân tích theo phòng ban
                    </h3>
                </div>
                {data.departmentStats.length > 0 ? (
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-700/50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <th className="px-6 py-3">Phòng ban</th>
                                <th className="px-6 py-3 text-center">Ăn</th>
                                <th className="px-6 py-3 text-center">Không ăn</th>
                                <th className="px-6 py-3 text-center">Tổng</th>
                                <th className="px-6 py-3 text-center">Tỉ lệ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {data.departmentStats.map((dept) => (
                                <tr key={dept.department} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="px-6 py-3.5 font-medium text-slate-700 dark:text-slate-200">{dept.department}</td>
                                    <td className="px-6 py-3.5 text-center text-emerald-600 font-bold">{dept.eating}</td>
                                    <td className="px-6 py-3.5 text-center text-slate-500">{dept.not_eating}</td>
                                    <td className="px-6 py-3.5 text-center text-slate-800 dark:text-white font-semibold">{dept.total}</td>
                                    <td className="px-6 py-3.5 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-20 bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                                                <div
                                                    className="h-2 rounded-full bg-emerald-500"
                                                    style={{ width: `${dept.rate}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{dept.rate}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-center text-slate-400 py-10">Chưa có dữ liệu phòng ban</p>
                )}
            </div>
        </div>
    );
}

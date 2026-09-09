'use client';

import { useState } from 'react';
import ProfileSettings from './settings/ProfileSettings';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    userRole: string;
    userName?: string;
    onLogout?: () => void;
}

export default function SettingsModal({ isOpen, onClose, userId, userRole, userName, onLogout }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState('profile');

    if (!isOpen) return null;

    const canAccessAdminSettings = userRole === 'admin' || userRole === 'hr';

    const tabs = canAccessAdminSettings
        ? [
            { id: 'profile', label: 'Hồ sơ', icon: 'person' },
            { id: 'system', label: 'Hệ thống', icon: 'settings_applications' },
            { id: 'users', label: 'Người dùng', icon: 'groups' },
            { id: 'departments', label: 'Phòng ban', icon: 'corporate_fare' },
            { id: 'shifts', label: 'Ca làm', icon: 'schedule' }
        ]
        : [{ id: 'profile', label: 'Hồ sơ', icon: 'person' }];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            ></div>

            {/* Modal */}
            <div className="relative w-full max-w-3xl mx-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#B24700] flex items-center justify-center">
                            <Icon name="settings" className="text-white text-xl" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Cài đặt</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <Icon name="close" className="text-slate-500" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${activeTab === tab.id
                                ? 'bg-[#B24700] text-white shadow-md'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                                }`}
                        >
                            <Icon name={tab.icon} className="text-lg" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* User info + Logout - chỉ hiện trên mobile */}
                    {userName && onLogout && (
                        <div className="md:hidden mb-6 flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl border border-orange-200 dark:border-orange-800/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#B24700] flex items-center justify-center text-white font-bold text-sm">
                                    {userName.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-slate-800 dark:text-white">{userName}</p>
                                    <p className="text-xs text-slate-500">{userRole}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { onLogout(); onClose(); }}
                                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors border border-red-200 dark:border-red-800/30"
                            >
                                <Icon name="logout" className="text-lg" />
                                Đăng xuất
                            </button>
                        </div>
                    )}

                    {activeTab === 'profile' && <ProfileSettings userId={userId} onClose={onClose} />}
                    {activeTab === 'system' && (
                        <div className="text-center py-12">
                            <Icon name="construction" className="text-6xl text-slate-300 dark:text-slate-700 mb-4" />
                            <p className="text-slate-500">Tính năng đang phát triển...</p>
                        </div>
                    )}
                    {activeTab === 'users' && (
                        <div className="text-center py-12">
                            <Icon name="construction" className="text-6xl text-slate-300 dark:text-slate-700 mb-4" />
                            <p className="text-slate-500">Tính năng đang phát triển...</p>
                        </div>
                    )}
                    {activeTab === 'departments' && (
                        <div className="text-center py-12">
                            <Icon name="construction" className="text-6xl text-slate-300 dark:text-slate-700 mb-4" />
                            <p className="text-slate-500">Tính năng đang phát triển...</p>
                        </div>
                    )}
                    {activeTab === 'shifts' && (
                        <div className="text-center py-12">
                            <Icon name="construction" className="text-6xl text-slate-300 dark:text-slate-700 mb-4" />
                            <p className="text-slate-500">Tính năng đang phát triển...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

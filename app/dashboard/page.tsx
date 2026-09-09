'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import EmployeeDashboard from './_components/EmployeeDashboard';
import KitchenDashboard from './kitchen/_components/KitchenDashboard';
import AdminManagerDashboard from './_components/admin/AdminManagerDashboard';
import DashboardHeader from './_components/DashboardHeader';
import FloatingChat from '@/components/ai/FloatingChat';

/**
 * Dashboard Page - Role-based routing với tab support cho Admin
 * Route: /dashboard
 */
function DashboardPageContent() {
    const router = useRouter();
    const supabase = createClient();
    const [role, setRole] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>('User');
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'employee' | 'manager'>('employee');

    useEffect(() => {
        const checkUserRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/login');
                return;
            }

            const { data: profile } = await supabase
                .from('users')
                .select('role, full_name, status')
                .eq('id', user.id)
                .single();

            // ✅ Redirect resigned users to login
            if (profile?.status === 'resigned') {
                await supabase.auth.signOut();
                router.push('/login');
                return;
            }

            setRole(profile?.role || 'employee');
            setUserName(profile?.full_name || 'User');
            setIsLoading(false);
        };

        checkUserRole();
    }, [router, supabase]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#b74b0c] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 dark:text-slate-400 font-medium">Đang tải...</p>
                </div>
            </div>
        );
    }

    const showFloatingChat = role && ['admin', 'manager', 'hr'].includes(role);

    // Admin/HR: Có 2 tabs
    if (role === 'admin' || role === 'hr') {
        return (
            <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
                <DashboardHeader
                    userName={userName}
                    userRole={role}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />
                {activeTab === 'employee' ? (
                    <EmployeeDashboard hideHeader={true} />
                ) : (
                    <AdminManagerDashboard />
                )}
                {showFloatingChat && <FloatingChat />}
            </div>
        );
    }

    // Kitchen staff: Kitchen Dashboard
    if (role === 'kitchen') {
        return <KitchenDashboard />;
    }

    // Employee/Manager: Employee Dashboard with FloatingChat for manager
    return (
        <>
            <EmployeeDashboard />
            {showFloatingChat && <FloatingChat />}
        </>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-[#b74b0c] border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
        }>
            <DashboardPageContent />
        </Suspense>
    );
}

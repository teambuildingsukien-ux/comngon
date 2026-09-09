import React from 'react';
import { GreenLeaderboardPage } from '../_components/green-leaderboard/GreenLeaderboardPage';

export const metadata = {
    title: 'Đấu Trường Phòng Ban Xanh & Quà Thưởng | Cơm Ngốn',
    description: 'Bảng xếp hạng thi đua phòng ban xanh và cửa hàng đổi quà thưởng Green Points.'
};

export default function GreenLeaderboardRoute() {
    return (
        <div className="min-h-screen bg-[#0d1117] text-slate-100 py-6">
            <GreenLeaderboardPage userRole="admin" />
        </div>
    );
}

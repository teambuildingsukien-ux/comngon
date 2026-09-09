'use client'

import React from 'react'
import { StatusDot } from './status-dot'

interface FlowStep {
    id: number
    time: string
    title: string
    description: string
    icon: string
    status: 'completed' | 'active' | 'pending'
    automated: boolean
}

const automationSteps: FlowStep[] = [
    {
        id: 1,
        time: '00:00',
        title: 'Tự động đăng ký',
        description: 'Hệ thống tự động đăng ký ăn cơm cho tất cả nhân viên',
        icon: '🤖',
        status: 'completed',
        automated: true
    },
    {
        id: 2,
        time: '00:00 - 06:00',
        title: 'Deadline cho phép thay đổi',
        description: 'Nhân viên có thể hủy hoặc đăng ký lại',
        icon: '⏰',
        status: 'active',
        automated: false
    },
    {
        id: 3,
        time: '06:00',
        title: 'Khóa deadline',
        description: 'Hệ thống tự động khóa, không cho phép thay đổi',
        icon: '🔒',
        status: 'pending',
        automated: true
    },
    {
        id: 4,
        time: '06:01',
        title: 'Gửi danh sách cho bếp',
        description: 'Tự động gửi số lượng suất ăn cho bộ phận bếp',
        icon: '📧',
        status: 'pending',
        automated: true
    },
    {
        id: 5,
        time: '10:00',
        title: 'Chuẩn bị bữa trưa',
        description: 'Bếp chuẩn bị đúng số lượng, tiết kiệm chi phí',
        icon: '🍚',
        status: 'pending',
        automated: false
    }
]

export function AutomationFlowViz() {
    return (
        <div className="glass squircle p-8">
            {/* Header */}
            <div className="mb-6">
                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                    <span>⚙️</span>
                    <span>Quy trình tự động hóa</span>
                </h3>
                <p className="text-sm text-gray-600">
                    Hệ thống VV-Rice tự động xử lý mọi bước để tối ưu chi phí và giảm lãng phí
                </p>
            </div>

            {/* Flow Timeline */}
            <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-orange-400 via-orange-300 to-gray-300" />

                {/* Steps */}
                <div className="space-y-6">
                    {automationSteps.map((step, index) => (
                        <div
                            key={step.id}
                            className={`
                                relative pl-16 
                                transition-all duration-500 hover:translate-x-2
                                ${step.status === 'active' ? 'animate-pulse-soft' : ''}
                            `}
                        >
                            {/* Icon bubble */}
                            <div className={`
                                absolute left-0 w-12 h-12 rounded-full
                                flex items-center justify-center text-2xl
                                transition-all duration-300
                                ${step.status === 'completed' ? 'bg-green-100 border-2 border-green-400' : ''}
                                ${step.status === 'active' ? 'bg-orange-100 border-2 border-orange-400 shadow-lg shadow-orange-200' : ''}
                                ${step.status === 'pending' ? 'bg-gray-100 border-2 border-gray-300' : ''}
                            `}>
                                {step.icon}
                            </div>

                            {/* Content card */}
                            <div className={`
                                glass squircle p-4 border-l-4
                                transition-all duration-300 hover:shadow-lg
                                ${step.status === 'completed' ? 'border-green-400' : ''}
                                ${step.status === 'active' ? 'border-orange-400' : ''}
                                ${step.status === 'pending' ? 'border-gray-300' : ''}
                            `}>
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                {step.time}
                                            </span>
                                            {step.automated && (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                                    Tự động
                                                </span>
                                            )}
                                        </div>
                                        <h4 className="font-bold text-gray-800">{step.title}</h4>
                                    </div>
                                    <StatusDot
                                        status={
                                            step.status === 'completed' ? 'eating' :
                                                step.status === 'active' ? 'eating' :
                                                    'cancelled'
                                        }
                                        size="sm"
                                    />
                                </div>
                                <p className="text-sm text-gray-600">
                                    {step.description}
                                </p>
                            </div>

                            {/* Connector arrow for last step */}
                            {index === automationSteps.length - 1 && (
                                <div className="absolute left-6 -bottom-6 text-gray-400 text-2xl">
                                    ✓
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Summary stats */}
            <div className="mt-8 grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                    <div className="text-2xl mb-1">⚡</div>
                    <div className="text-sm text-gray-600">Tự động</div>
                    <div className="text-lg font-bold text-blue-700">3/5 bước</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                    <div className="text-2xl mb-1">💰</div>
                    <div className="text-sm text-gray-600">Tiết kiệm</div>
                    <div className="text-lg font-bold text-green-700">~20%</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-xl">
                    <div className="text-2xl mb-1">♻️</div>
                    <div className="text-sm text-gray-600">Giảm lãng phí</div>
                    <div className="text-lg font-bold text-orange-700">~15kg/tháng</div>
                </div>
            </div>
        </div>
    )
}

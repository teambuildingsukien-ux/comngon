import React from 'react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
    title: string
    value: string | number
    subtitle?: string
    trend?: string
    icon?: string
    variant?: 'primary' | 'success' | 'warning' | 'danger'
    className?: string
    children?: React.ReactNode
}

export function StatsCard({
    title,
    value,
    subtitle,
    trend,
    icon = '📊',
    variant = 'primary',
    className,
    children
}: StatsCardProps) {
    const variantStyles = {
        primary: 'border-l-orange-500 shadow-primary',
        success: 'border-l-green-500',
        warning: 'border-l-yellow-500',
        danger: 'border-l-red-500'
    }

    const valueColors = {
        primary: 'text-orange-600',
        success: 'text-green-600',
        warning: 'text-yellow-600',
        danger: 'text-red-600'
    }

    return (
        <div className={cn(
            'glass squircle p-6 border-l-4 transition-all hover:scale-105',
            variantStyles[variant],
            className
        )}>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">
                        {title}
                    </p>
                    {trend && (
                        <p className="text-xs text-gray-500">{trend}</p>
                    )}
                </div>
                <span className="text-3xl floating">{icon}</span>
            </div>

            {/* Value */}
            <div className={cn(
                'text-4xl font-bold mb-2 counter',
                valueColors[variant]
            )}>
                {value}
            </div>

            {/* Subtitle */}
            {subtitle && (
                <p className="text-sm text-gray-600">{subtitle}</p>
            )}

            {/* Custom children */}
            {children}
        </div>
    )
}

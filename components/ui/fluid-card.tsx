import React from 'react'
import { cn } from '@/lib/utils'

interface FluidCardProps {
    status: 'eating' | 'cancelled'
    title: string
    subtitle?: string
    icon?: string
    onStatusChange?: () => void
    children?: React.ReactNode
    className?: string
}

export function FluidCard({
    status,
    title,
    subtitle,
    icon = '🍚',
    children,
    className
}: FluidCardProps) {
    const cardClass = cn(
        'fluid-card',
        status === 'cancelled' && 'state-cancelled',
        'p-8 min-h-[300px] flex flex-col items-center justify-center text-white',
        className
    )

    return (
        <div className={cardClass}>
            {/* 3D Floating Icon */}
            <div className="icon-3d floating mb-6">
                {status === 'eating' ? icon : '☕'}
            </div>

            {/* Title */}
            <h2 className="text-3xl font-bold mb-2 text-center">
                {title}
            </h2>

            {/* Subtitle */}
            {subtitle && (
                <p className="text-white/90 text-center mb-6 max-w-md">
                    {subtitle}
                </p>
            )}

            {/* Children (for slide interaction, etc) */}
            {children}
        </div>
    )
}

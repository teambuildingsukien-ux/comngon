import React from 'react'
import { cn } from '@/lib/utils'

type StatusType = 'eating' | 'cancelled' | 'on-leave'

interface StatusDotProps {
    status: StatusType
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

export function StatusDot({ status, size = 'md', className }: StatusDotProps) {
    const sizeClasses = {
        sm: 'w-2 h-2',
        md: 'w-3 h-3',
        lg: 'w-4 h-4'
    }

    const statusClasses = {
        eating: 'status-dot eating',
        cancelled: 'status-dot cancelled',
        'on-leave': 'status-dot on-leave'
    }

    return (
        <span
            className={cn(
                'status-dot',
                statusClasses[status],
                sizeClasses[size],
                className
            )}
            aria-label={`Status: ${status}`}
        />
    )
}

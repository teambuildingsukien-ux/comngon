'use client'

import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface SlideToActionProps {
    onComplete: () => void
    text: string
    icon?: string
    successIcon?: string
    disabled?: boolean
    className?: string
}

export function SlideToAction({
    onComplete,
    text,
    icon = '→',
    successIcon = '✓',
    disabled = false,
    className
}: SlideToActionProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [position, setPosition] = useState(0)
    const [isCompleted, setIsCompleted] = useState(false)
    const trackRef = useRef<HTMLDivElement>(null)
    const thumbRef = useRef<HTMLDivElement>(null)

    const COMPLETION_THRESHOLD = 0.85 // 85% slide to complete

    const handleStart = (clientX: number) => {
        if (disabled || isCompleted) return
        setIsDragging(true)
    }

    const handleMove = (clientX: number) => {
        if (!isDragging || !trackRef.current || disabled) return

        const track = trackRef.current
        const trackRect = track.getBoundingClientRect()
        const thumbWidth = 56 // 48px + 8px padding

        let newPosition = clientX - trackRect.left - thumbWidth / 2
        newPosition = Math.max(0, Math.min(newPosition, trackRect.width - thumbWidth))

        const progress = newPosition / (trackRect.width - thumbWidth)
        setPosition(progress)

        if (progress >= COMPLETION_THRESHOLD && !isCompleted) {
            setIsCompleted(true)
            setIsDragging(false)
            onComplete()
        }
    }

    const handleEnd = () => {
        if (!isCompleted) {
            setPosition(0)
        }
        setIsDragging(false)
    }

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX)
        const handleTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX)
        const handleMouseUp = () => handleEnd()
        const handleTouchEnd = () => handleEnd()

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
            document.addEventListener('touchmove', handleTouchMove)
            document.addEventListener('touchend', handleTouchEnd)
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleTouchEnd)
        }
    }, [isDragging, isCompleted])

    const thumbStyle = {
        transform: `translateX(${position * (trackRef.current?.clientWidth ? trackRef.current.clientWidth - 56 : 0)}px)`,
    }

    return (
        <div
            ref={trackRef}
            className={cn(
                'slide-track',
                disabled && 'opacity-50 cursor-not-allowed',
                className
            )}
            onMouseDown={(e) => handleStart(e.clientX)}
            onTouchStart={(e) => handleStart(e.touches[0].clientX)}
            role="slider"
            aria-label={text}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position * 100)}
            aria-disabled={disabled || isCompleted}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (!disabled && !isCompleted) {
                        setIsCompleted(true)
                        onComplete()
                    }
                }
            }}
        >
            {/* Background Text */}
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white/70 text-sm font-medium select-none">
                    {text}
                </span>
            </div>

            {/* Thumb */}
            <div
                ref={thumbRef}
                className={cn(
                    'slide-thumb',
                    isDragging && 'cursor-grabbing scale-110',
                    isCompleted && 'bg-green-500'
                )}
                style={thumbStyle}
            >
                {isCompleted ? successIcon : icon}
            </div>
        </div>
    )
}

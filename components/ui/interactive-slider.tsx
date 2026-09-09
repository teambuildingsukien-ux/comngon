'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface InteractiveSliderProps {
    onComplete: () => Promise<void>
    text: string
    disabled?: boolean
    variant?: 'eating' | 'not_eating'
}

export function InteractiveSlider({
    onComplete,
    text,
    disabled = false,
    variant = 'not_eating'
}: InteractiveSliderProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [offsetX, setOffsetX] = useState(0)
    const [isCompleting, setIsCompleting] = useState(false)
    const [startX, setStartX] = useState(0)
    const sliderRef = useRef<HTMLDivElement>(null)
    const thumbRef = useRef<HTMLDivElement>(null)

    const THUMB_WIDTH = 56 // w-14 = 3.5rem = 56px
    const PADDING = 6 // p-1.5 = 6px
    const THRESHOLD = 0.7 // 70% to trigger

    const handleStart = (clientX: number) => {
        if (disabled || isCompleting) return

        setIsDragging(true)
        setStartX(clientX - offsetX)
    }

    const handleMove = (clientX: number) => {
        if (!isDragging || !sliderRef.current) return

        const containerWidth = sliderRef.current.offsetWidth
        const maxOffset = containerWidth - THUMB_WIDTH - (PADDING * 2)
        const newOffset = clientX - startX

        // Constrain within bounds
        const clampedOffset = Math.min(Math.max(0, newOffset), maxOffset)
        setOffsetX(clampedOffset)
    }

    const handleEnd = async () => {
        if (!isDragging || !sliderRef.current) return

        setIsDragging(false)

        const containerWidth = sliderRef.current.offsetWidth
        const maxOffset = containerWidth - THUMB_WIDTH - (PADDING * 2)
        const progress = offsetX / maxOffset

        if (progress >= THRESHOLD) {
            // Success! Trigger action
            setIsCompleting(true)

            try {
                await onComplete()
                // Success animation - slide to end
                setOffsetX(maxOffset)

                // Reset after animation
                setTimeout(() => {
                    setOffsetX(0)
                    setIsCompleting(false)
                }, 800)
            } catch (error) {
                // Error - reset immediately
                setOffsetX(0)
                setIsCompleting(false)
            }
        } else {
            // Not enough - spring back
            setOffsetX(0)
        }
    }

    // Mouse events
    const handleMouseDown = (e: React.MouseEvent) => {
        handleStart(e.clientX)
    }

    // Touch events
    const handleTouchStart = (e: React.TouchEvent) => {
        handleStart(e.touches[0].clientX)
    }

    // Global event listeners
    useEffect(() => {
        if (!isDragging) return

        const handleGlobalMouseMove = (e: MouseEvent) => {
            handleMove(e.clientX)
        }

        const handleGlobalTouchMove = (e: TouchEvent) => {
            handleMove(e.touches[0].clientX)
        }

        const handleGlobalEnd = () => {
            handleEnd()
        }

        window.addEventListener('mousemove', handleGlobalMouseMove)
        window.addEventListener('touchmove', handleGlobalTouchMove)
        window.addEventListener('mouseup', handleGlobalEnd)
        window.addEventListener('touchend', handleGlobalEnd)

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove)
            window.removeEventListener('touchmove', handleGlobalTouchMove)
            window.removeEventListener('mouseup', handleGlobalEnd)
            window.removeEventListener('touchend', handleGlobalEnd)
        }
    }, [isDragging, offsetX, startX])

    // Calculate completion percentage for visual feedback
    const containerWidth = sliderRef.current?.offsetWidth || 0
    const maxOffset = containerWidth - THUMB_WIDTH - (PADDING * 2)
    const completionPercent = maxOffset > 0 ? (offsetX / maxOffset) * 100 : 0
    const isNearComplete = completionPercent > 60

    return (
        <div className="w-full relative group" ref={sliderRef}>
            <div
                className={cn(
                    'relative overflow-hidden rounded-2xl py-4 px-3 h-16',
                    'bg-black/20 backdrop-blur-md',
                    'border-2 transition-all duration-300',
                    isNearComplete
                        ? 'border-white/50 shadow-lg shadow-white/20'
                        : 'border-white/30',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
            >
                {/* Progress bar background */}
                <div
                    className="absolute inset-0 bg-white/10 transition-all duration-200"
                    style={{
                        width: `${completionPercent}%`,
                    }}
                />

                {/* Text */}
                <div className="flex items-center justify-center relative z-10 pointer-events-none">
                    <span
                        className={cn(
                            'text-xs font-black whitespace-nowrap tracking-wider transition-opacity',
                            completionPercent > 50 ? 'opacity-60' : 'opacity-90'
                        )}
                    >
                        {text}
                    </span>
                    {!disabled && (
                        <span
                            className={cn(
                                'material-icons-round text-lg ml-2 transition-transform',
                                isNearComplete && 'scale-125 animate-bounce'
                            )}
                        >
                            arrow_forward
                        </span>
                    )}
                </div>

                {/* Draggable thumb */}
                <div
                    ref={thumbRef}
                    className={cn(
                        'absolute left-1.5 top-1.5 bottom-1.5 w-14',
                        'bg-white rounded-xl flex items-center justify-center',
                        'shadow-xl transition-all duration-200',
                        isDragging ? 'scale-110 shadow-2xl' : 'scale-100',
                        isCompleting && 'animate-pulse',
                        !disabled && 'cursor-grab active:cursor-grabbing',
                        disabled && 'cursor-not-allowed'
                    )}
                    style={{
                        transform: `translateX(${offsetX}px)`,
                        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                >
                    <span
                        className={cn(
                            'material-icons-round font-bold text-2xl transition-all',
                            variant === 'eating' ? 'text-red-600' : 'text-primary',
                            isCompleting && 'animate-spin'
                        )}
                    >
                        {isCompleting ? 'sync' : 'touch_app'}
                    </span>
                </div>
            </div>

            {/* Helper text */}
            {!disabled && (
                <p className="text-xs mt-3 text-center text-white/75 font-medium">
                    {isNearComplete ? '🔥 Thả ra để xác nhận!' : 'Trượt phải để thay đổi trạng thái'}
                </p>
            )}
        </div>
    )
}

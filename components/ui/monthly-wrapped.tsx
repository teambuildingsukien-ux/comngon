'use client'

import React, { useState, useEffect } from 'react'
import { StatusDot } from './status-dot'

interface MonthlyStats {
    totalDays: number
    eatingDays: number
    skippedDays: number
    complianceRate: number
    costSaved: number
    co2Saved: number
    topStreak: number
}

interface MonthlyWrappedProps {
    stats?: MonthlyStats
    isOpen: boolean
    onClose: () => void
}

const defaultStats: MonthlyStats = {
    totalDays: 22,
    eatingDays: 18,
    skippedDays: 4,
    complianceRate: 95,
    costSaved: 450000,
    co2Saved: 12,
    topStreak: 14
}

export function MonthlyWrapped({ stats = defaultStats, isOpen, onClose }: MonthlyWrappedProps) {
    const [currentSlide, setCurrentSlide] = useState(0)
    const [isAnimating, setIsAnimating] = useState(false)

    // Use default stats if null or undefined
    const safeStats = stats || defaultStats

    const slides = [
        {
            title: 'Tháng này của bạn',
            subtitle: 'Cùng xem lại những con số đặc biệt! 🎉',
            type: 'intro' as const
        },
        {
            title: `${safeStats.eatingDays}/${safeStats.totalDays} ngày`,
            subtitle: 'Bạn đã báo cơm',
            icon: '🍚',
            stat: safeStats.eatingDays,
            total: safeStats.totalDays,
            type: 'stat' as const
        },
        {
            title: `${safeStats.complianceRate}%`,
            subtitle: 'Tỷ lệ tuân thủ deadline',
            icon: '⏰',
            stat: safeStats.complianceRate,
            type: 'stat' as const
        },
        {
            title: `${(safeStats.costSaved / 1000).toFixed(0)}K VNĐ`,
            subtitle: 'Tiết kiệm cho công ty',
            icon: '💰',
            stat: safeStats.costSaved,
            type: 'stat' as const
        },
        {
            title: `${safeStats.co2Saved} kg`,
            subtitle: 'CO₂ tiết kiệm được',
            icon: '🌱',
            stat: safeStats.co2Saved,
            type: 'stat' as const
        },
        {
            title: `${safeStats.topStreak} ngày`,
            subtitle: 'Streak dài nhất',
            icon: '🔥',
            stat: safeStats.topStreak,
            type: 'stat' as const
        },
        {
            title: 'Tuyệt vời! 🎊',
            subtitle: 'Cảm ơn bạn đã đồng hành cùng VV-Rice',
            type: 'outro' as const
        }
    ]

    useEffect(() => {
        if (!isOpen) {
            setCurrentSlide(0)
            return
        }

        // Auto-advance slides
        const timer = setTimeout(() => {
            if (currentSlide < slides.length - 1) {
                setIsAnimating(true)
                setTimeout(() => {
                    setCurrentSlide(prev => prev + 1)
                    setIsAnimating(false)
                }, 300)
            }
        }, 3000)

        return () => clearTimeout(timer)
    }, [isOpen, currentSlide, slides.length])

    if (!isOpen) return null

    const currentSlideData = slides[currentSlide]

    return (
        <div
            className="fixed inset-0 z-[999999] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="relative max-w-md w-full aspect-[9/16] rounded-3xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Background gradient based on slide type */}
                <div className={`
                    absolute inset-0 transition-all duration-1000
                    ${currentSlideData.type === 'intro' ? 'bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600' : ''}
                    ${currentSlideData.type === 'stat' ? 'bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600' : ''}
                    ${currentSlideData.type === 'outro' ? 'bg-gradient-to-br from-green-500 via-teal-500 to-blue-600' : ''}
                `} />

                {/* Content */}
                <div className={`
                    relative z-10 h-full flex flex-col items-center justify-center p-8 text-white text-center
                    transition-all duration-500
                    ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
                `}>
                    {currentSlideData.type === 'stat' && currentSlideData.icon && (
                        <div className="text-8xl mb-8 animate-bounce-soft">
                            {currentSlideData.icon}
                        </div>
                    )}

                    <h1 className="text-6xl font-bold mb-4 drop-shadow-lg">
                        {currentSlideData.title}
                    </h1>

                    <p className="text-2xl opacity-90 drop-shadow">
                        {currentSlideData.subtitle}
                    </p>

                    {/* Progress bar */}
                    {currentSlideData.type === 'stat' && currentSlideData.total && (
                        <div className="mt-12 w-full max-w-xs">
                            <div className="h-3 bg-white/20 rounded-full overflow-hidden backdrop-blur">
                                <div
                                    className="h-full bg-white rounded-full transition-all duration-1000"
                                    style={{
                                        width: `${(currentSlideData.stat / currentSlideData.total) * 100}%`
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Slide indicators */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                    {slides.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentSlide(index)}
                            className={`
                                h-2 rounded-full transition-all duration-300
                                ${index === currentSlide ? 'w-8 bg-white' : 'w-2 bg-white/50'}
                            `}
                        />
                    ))}
                </div>

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                    ✕
                </button>

                {/* Navigation buttons */}
                <div className="absolute bottom-20 left-0 right-0 flex justify-between px-4 z-20">
                    {currentSlide > 0 && (
                        <button
                            onClick={() => setCurrentSlide(prev => prev - 1)}
                            className="px-6 py-2 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors"
                        >
                            ← Trước
                        </button>
                    )}
                    <div className="flex-1" />
                    {currentSlide < slides.length - 1 && (
                        <button
                            onClick={() => setCurrentSlide(prev => prev + 1)}
                            className="px-6 py-2 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors"
                        >
                            Tiếp →
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

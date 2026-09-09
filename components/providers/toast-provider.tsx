'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'

interface Toast {
    id: number
    message: string
    icon?: string
    duration?: number
}

interface ToastContextType {
    showToast: (message: string, icon?: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

let toastCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const showToast = useCallback((message: string, icon = '✨', duration = 3000) => {
        const id = ++toastCounter

        setToasts(prev => [...prev, { id, message, icon, duration }])

        // Auto remove after duration
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
    }, [])

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container - Fixed at top with max z-index */}
            <div
                className="fixed top-8 left-1/2 -translate-x-1/2 z-[999999] pointer-events-none flex flex-col gap-3"
                style={{ zIndex: 999999 }}
            >
                {toasts.map(toast => (
                    <ToastItem
                        key={toast.id}
                        message={toast.message}
                        icon={toast.icon}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    )
}

function ToastItem({ message, icon, onClose }: { message: string; icon?: string; onClose: () => void }) {
    const [isVisible, setIsVisible] = useState(false)

    React.useEffect(() => {
        // Trigger animation
        requestAnimationFrame(() => setIsVisible(true))
    }, [])

    return (
        <div
            className={`
                bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900
                text-white px-6 py-4 rounded-3xl
                backdrop-blur-xl shadow-2xl
                flex items-center gap-4
                transition-all duration-300 ease-out
                ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95'}
            `}
        >
            {icon && (
                <span className="text-3xl floating">{icon}</span>
            )}
            <span className="font-semibold text-lg">{message}</span>
        </div>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within ToastProvider')
    }
    return context
}

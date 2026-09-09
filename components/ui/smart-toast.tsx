'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface SmartToastProps {
    message: string
    icon?: string
    duration?: number
    onClose?: () => void
}

let toastId = 0
const activeToasts = new Map<number, () => void>()

export function useToast() {
    const [, forceUpdate] = useState({})

    const showToast = (message: string, icon?: string, duration = 3000) => {
        const id = ++toastId

        const timeoutId = setTimeout(() => {
            activeToasts.delete(id)
            forceUpdate({})
        }, duration)

        activeToasts.set(id, () => {
            clearTimeout(timeoutId)
            activeToasts.delete(id)
            forceUpdate({})
        })

        forceUpdate({})
    }

    return { showToast }
}

export function SmartToastContainer() {
    const [toasts, setToasts] = useState<Array<{ id: number; message: string; icon?: string }>>([])

    return (
        <>
            {Array.from(activeToasts.keys()).map((id) => (
                <SmartToast
                    key={id}
                    message={`Toast ${id}`}
                    onClose={() => activeToasts.get(id)?.()}
                />
            ))}
        </>
    )
}

function SmartToast({ message, icon = '✨', duration = 3000, onClose }: SmartToastProps) {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        // Show toast after mount
        requestAnimationFrame(() => setIsVisible(true))

        // Auto hide
        const timer = setTimeout(() => {
            setIsVisible(false)
            setTimeout(() => onClose?.(), 300)
        }, duration)

        return () => clearTimeout(timer)
    }, [duration, onClose])

    return (
        <div className={cn('smart-toast', isVisible && 'show')}>
            <div className="flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
                <span className="font-medium">{message}</span>
            </div>
        </div>
    )
}

// Standalone toast function for easy use
export function showSmartToast(message: string, icon?: string) {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const root = (window as any).__smartToastRoot || ((window as any).__smartToastRoot = (window as any).React?.createRoot?.(container))

    if (!root) {
        // Fallback for non-React 18
        console.log('[Toast]', icon, message)
        return
    }

    const handleClose = () => {
        document.body.removeChild(container)
    }

    root.render(<SmartToast message={message} icon={icon} onClose={handleClose} />)
}

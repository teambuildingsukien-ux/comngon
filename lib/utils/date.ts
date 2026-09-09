// Date utility functions cho GMT+7 timezone handling

const TIMEZONE = 'Asia/Ho_Chi_Minh'

/**
 * Get current date/time trong GMT+7 timezone
 */
export function getNow(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }))
}

/**
 * Get today's date string (YYYY-MM-DD) trong GMT+7
 */
export function getTodayDate(): string {
    const now = getNow()
    return formatDate(now)
}

/**
 * Format Date object to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * Format time to HH:MM:SS
 */
export function formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
}

/**
 * Check if current time is before the daily deadline (6:00 AM GMT+7)
 * @returns {boolean} True if before deadline, false otherwise
 */
export function isBeforeDeadline(): boolean {
    // TEMPORARILY DISABLED FOR TESTING - Always allow changes
    return true

    // const now = new Date()
    // const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))

    // const hour = vietnamTime.getHours()

    // // Allow changes before 6:00 AM GMT+7
    // return hour < 6
}

/**
 * Get time remaining until deadline (6:00 AM)
 * Returns null if deadline passed
 */
export function getTimeUntilDeadline(): { hours: number; minutes: number; seconds: number } | null {
    if (!isBeforeDeadline()) {
        return null
    }

    const now = getNow()
    const deadline = new Date(now)
    deadline.setHours(5, 0, 0, 0)

    const diff = deadline.getTime() - now.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    return { hours, minutes, seconds }
}

/**
 * Format datetime for display (Vietnamese format)
 */
export function formatDateTimeVN(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: TIMEZONE,
    }).format(date)
}

/**
 * Parse YYYY-MM-DD string to Date
 */
export function parseDate(dateString: string): Date {
    return new Date(dateString + 'T00:00:00')
}

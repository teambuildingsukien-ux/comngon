// Get time-based header gradient class
export function getTimeBasedHeaderClass() {
    const hour = new Date().getHours()

    if (hour >= 5 && hour < 12) {
        // Morning: Rose gold gradient
        return 'bg-gradient-to-r from-orange-50 via-pink-50 to-orange-100'
    } else if (hour >= 12 && hour < 18) {
        // Afternoon: Bright sunny gradient
        return 'bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50'
    } else {
        // Evening/Night: Deep purple gradient
        return 'bg-gradient-to-r from-indigo-100 via-purple-100 to-pink-100'
    }
}

// Get time-based greeting emoji
export function getTimeEmoji() {
    const hour = new Date().getHours()

    if (hour >= 5 && hour < 12) return '🌅'
    if (hour >= 12 && hour < 18) return '☀️'
    return '🌙'
}

// API response types

export interface ApiResponse<T = any> {
    data?: T
    error?: ApiError
}

export interface ApiError {
    code: string
    message: string
    details?: Record<string, any>
}

// Order types
export interface Order {
    id: string
    user_id: string
    date: string
    status: 'eating' | 'not_eating'
    locked: boolean
    created_at: string
    updated_at: string
}

export interface OrderWithUser extends Order {
    user: {
        full_name: string
        department: string
    }
}

// User types
export interface User {
    id: string
    email: string
    full_name: string
    department: string
    role: 'Employee' | 'Kitchen Admin' | 'Manager'
    telegram_chat_id: string | null
    created_at: string
    updated_at: string
}

// Dashboard types
export interface KitchenSummary {
    total_employees: number
    total_eating: number
    total_not_eating: number
}

export interface ManagerKPIs {
    waste_rate: number
    cost_savings: number
    compliance_rate: number
}

export interface TrendDataPoint {
    date: string
    total_employees: number
    total_eating: number
    waste_rate: number
}

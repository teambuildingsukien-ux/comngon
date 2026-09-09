export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            users: {
                Row: {
                    id: string
                    email: string
                    full_name: string
                    department: string
                    role: string
                    telegram_chat_id: string | null
                    created_at: string
                    updated_at: string
                    deleted_at: string | null
                    created_by: string | null
                    metadata: Json | null
                }
                Insert: {
                    id?: string
                    email: string
                    full_name: string
                    department: string
                    role?: string
                    telegram_chat_id?: string | null
                    created_at?: string
                    updated_at?: string
                    deleted_at?: string | null
                    created_by?: string | null
                    metadata?: Json | null
                }
                Update: {
                    id?: string
                    email?: string
                    full_name?: string
                    department?: string
                    role?: string
                    telegram_chat_id?: string | null
                    created_at?: string
                    updated_at?: string
                    deleted_at?: string | null
                    created_by?: string | null
                    metadata?: Json | null
                }
            }
            orders: {
                Row: {
                    id: string
                    user_id: string
                    date: string
                    status: string
                    locked: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    date: string
                    status?: string
                    locked?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    date?: string
                    status?: string
                    locked?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            notification_logs: {
                Row: {
                    id: string
                    recipient_id: string
                    notification_type: string
                    channel: string
                    content: string | null
                    status: string
                    sent_at: string | null
                    error_message: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    recipient_id: string
                    notification_type: string
                    channel: string
                    content?: string | null
                    status?: string
                    sent_at?: string | null
                    error_message?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    recipient_id?: string
                    notification_type?: string
                    channel?: string
                    content?: string | null
                    status?: string
                    sent_at?: string | null
                    error_message?: string | null
                    created_at?: string
                }
            }
            import_logs: {
                Row: {
                    id: string
                    imported_by: string
                    file_name: string
                    total_rows: number
                    success_count: number
                    error_count: number
                    error_details: Json | null
                    status: string
                    created_at: string
                    completed_at: string | null
                }
                Insert: {
                    id?: string
                    imported_by: string
                    file_name: string
                    total_rows: number
                    success_count?: number
                    error_count?: number
                    error_details?: Json | null
                    status?: string
                    created_at?: string
                    completed_at?: string | null
                }
                Update: {
                    id?: string
                    imported_by?: string
                    file_name?: string
                    total_rows?: number
                    success_count?: number
                    error_count?: number
                    error_details?: Json | null
                    status?: string
                    created_at?: string
                    completed_at?: string | null
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
    }
}

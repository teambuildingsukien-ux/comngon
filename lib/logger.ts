/**
 * 📋 Structured Logger — Cơm Ngon AI System
 * Thay thế console.log rải rác bằng structured logs có context đầy đủ.
 *
 * Format: [LEVEL] [SERVICE] [reqId?] message | context_json
 * Vercel sẽ tự collect và hiển thị trong Dashboard → Functions → Logs
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
    reqId?: string;       // Request ID để trace 1 request xuyên suốt
    tenantId?: string;    // Multi-tenant context
    userId?: string;      // User thực hiện action
    model?: string;       // AI model đang dùng
    durationMs?: number;  // Thời gian xử lý
    [key: string]: unknown; // Extra context
}

class AILogger {
    private service: string;

    constructor(service: string) {
        this.service = service;
    }

    private format(level: LogLevel, message: string, ctx?: LogContext): string {
        const ts = new Date().toISOString();
        const prefix = `[${level.toUpperCase()}] [${this.service}]`;
        const reqPart = ctx?.reqId ? ` [${ctx.reqId}]` : '';
        const ctxStr = ctx && Object.keys(ctx).length > 0
            ? ` | ${JSON.stringify(ctx)}`
            : '';
        return `${ts} ${prefix}${reqPart} ${message}${ctxStr}`;
    }

    debug(message: string, ctx?: LogContext) {
        // Chỉ log debug trong development
        if (process.env.NODE_ENV === 'development') {
            console.debug(this.format('debug', message, ctx));
        }
    }

    info(message: string, ctx?: LogContext) {
        console.log(this.format('info', message, ctx));
    }

    warn(message: string, ctx?: LogContext) {
        console.warn(this.format('warn', message, ctx));
    }

    error(message: string, error?: unknown, ctx?: LogContext) {
        const errStr = error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
        console.error(this.format('error', `${message} — ${errStr}`, ctx));
    }

    /**
     * Tạo child logger với reqId cố định — dùng trong 1 request handler
     */
    child(ctx: LogContext): ChildLogger {
        return new ChildLogger(this, ctx);
    }
}

export class ChildLogger {
    private parent: AILogger;
    private ctx: LogContext;

    constructor(parent: AILogger, ctx: LogContext) {
        this.parent = parent;
        this.ctx = ctx;
    }

    debug(message: string, extra?: LogContext) {
        this.parent.debug(message, { ...this.ctx, ...extra });
    }

    info(message: string, extra?: LogContext) {
        this.parent.info(message, { ...this.ctx, ...extra });
    }

    warn(message: string, extra?: LogContext) {
        this.parent.warn(message, { ...this.ctx, ...extra });
    }

    error(message: string, error?: unknown, extra?: LogContext) {
        this.parent.error(message, error, { ...this.ctx, ...extra });
    }

    /** Tạo request ID ngắn để trace */
    static genReqId(): string {
        return Math.random().toString(36).slice(2, 8).toUpperCase();
    }
}

// === Export sẵn logger cho từng service ===
export const chatLogger = new AILogger('AI_CHAT');
export const analyzeLogger = new AILogger('AI_ANALYZE');
export const ragLogger = new AILogger('RAG');
export const cragLogger = new AILogger('CRAG');
export const cronLogger = new AILogger('CRON');
export const rateLimitLogger = new AILogger('RATE_LIMIT');

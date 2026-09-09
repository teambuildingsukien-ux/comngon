import * as Sentry from "@sentry/nextjs";

export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        // Khi chạy trên Node.js runtime (server-side)
        await import("./sentry.server.config");
    }

    if (process.env.NEXT_RUNTIME === "edge") {
        // Khi chạy trên Edge runtime (middleware, edge functions)
        await import("./sentry.edge.config");
    }
}

export const onRequestError = Sentry.captureRequestError;

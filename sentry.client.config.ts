import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Client-side BẮT BUỘC dùng NEXT_PUBLIC_ prefix
    // Cần thêm NEXT_PUBLIC_SENTRY_DSN trên Vercel

    // Performance Monitoring
    tracesSampleRate: 1.0,

    // Session Replay - ghi lại phiên người dùng khi có lỗi
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
        Sentry.replayIntegration(),
    ],

    // Chỉ gửi errors trong production
    enabled: process.env.NODE_ENV === "production",
});

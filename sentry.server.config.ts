import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,

    // Performance Monitoring
    tracesSampleRate: 1.0,

    // Chỉ gửi errors trong production
    enabled: process.env.NODE_ENV === "production",
});

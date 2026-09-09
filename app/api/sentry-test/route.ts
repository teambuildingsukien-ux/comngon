import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// API endpoint để test Sentry error reporting
// Truy cập: GET /api/sentry-test

export async function GET() {
    try {
        // Tạo lỗi giả để Sentry bắt
        throw new Error("🧪 [TEST] Sentry Error Test - Nếu bạn thấy lỗi này trên Sentry dashboard, nghĩa là Sentry đang hoạt động đúng!");
    } catch (error) {
        // Gửi lỗi đến Sentry
        Sentry.captureException(error);

        // Flush để đảm bảo lỗi được gửi ngay
        await Sentry.flush(2000);

        return NextResponse.json({
            success: true,
            message: "✅ Test error đã được gửi đến Sentry! Kiểm tra Sentry dashboard để xác nhận.",
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
        });
    }
}

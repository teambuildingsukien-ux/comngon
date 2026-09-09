"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Gửi lỗi lên Sentry
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="vi">
            <body>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "100vh",
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                        color: "#fff",
                        padding: "2rem",
                        textAlign: "center",
                    }}
                >
                    <div
                        style={{
                            fontSize: "4rem",
                            marginBottom: "1rem",
                        }}
                    >
                        😵
                    </div>
                    <h1
                        style={{
                            fontSize: "1.5rem",
                            fontWeight: 600,
                            marginBottom: "0.5rem",
                        }}
                    >
                        Có lỗi xảy ra
                    </h1>
                    <p
                        style={{
                            color: "#a0a0b0",
                            marginBottom: "1.5rem",
                            maxWidth: "400px",
                        }}
                    >
                        Hệ thống gặp sự cố không mong muốn. Đội kỹ thuật đã được thông báo và đang xử lý.
                    </p>
                    <button
                        onClick={reset}
                        style={{
                            padding: "0.75rem 2rem",
                            borderRadius: "8px",
                            border: "none",
                            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                            color: "#fff",
                            fontSize: "1rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "transform 0.2s",
                        }}
                        onMouseOver={(e) =>
                            (e.currentTarget.style.transform = "scale(1.05)")
                        }
                        onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
                    >
                        Thử lại
                    </button>
                </div>
            </body>
        </html>
    );
}

import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Tự upload sourcemaps để Sentry hiển thị đúng dòng code lỗi
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Tắt log khi build (chỉ hiện trong CI)
  silent: !process.env.CI,

  // Sử dụng tunnel route để tránh ad-blocker chặn Sentry requests
  tunnelRoute: "/monitoring",

  // Sourcemaps config
  sourcemaps: {
    // Ẩn sourcemaps khỏi client (bảo mật)
    deleteSourcemapsAfterUpload: true,
  },

  // Tối ưu bundle size — loại bỏ Sentry debug statements
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
  },
});

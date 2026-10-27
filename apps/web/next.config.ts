import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/db"],
  /**
   * The Daytona SDK loads `busboy` through a dynamic `require` when it parses
   * a file download. Bundled, that require cannot resolve and every
   * `sandbox.fs.downloadFile` throws, so the SDK runs as a plain Node package.
   */
  serverExternalPackages: ["@daytona/sdk"],
  devIndicators: false,
  allowedDevOrigins: ['192.168.1.234'],
}

const withNextIntl = createNextIntlPlugin()

export default withNextIntl(nextConfig)

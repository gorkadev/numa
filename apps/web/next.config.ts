import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/db"],
  devIndicators: false,
  allowedDevOrigins: ['192.168.1.234'],
}

const withNextIntl = createNextIntlPlugin()

export default withNextIntl(nextConfig)

import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/db"],
  devIndicators: false,
  allowedDevOrigins: ['192.168.1.234'],
}

export default nextConfig

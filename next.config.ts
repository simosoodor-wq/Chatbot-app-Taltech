import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Attachments are capped at 10 MB by the API route; this leaves room for form overhead.
  experimental: { proxyClientMaxBodySize: "11mb" },
};

export default nextConfig;

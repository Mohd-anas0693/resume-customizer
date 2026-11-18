import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These rely on Node built-ins / native assets; keep them out of the bundle.
  serverExternalPackages: ["@prisma/client", "mammoth", "unpdf", "@react-pdf/renderer"],
};

export default nextConfig;

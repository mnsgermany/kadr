import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a native binary, so it must not be bundled.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;

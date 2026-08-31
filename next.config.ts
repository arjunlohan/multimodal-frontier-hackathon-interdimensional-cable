import path from "node:path";

import { withWorkflow } from "workflow/next";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.mux.com",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/ffmpeg-static/**/*"],
    "/workflows/**": ["./node_modules/ffmpeg-static/**/*"],
  },
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default withWorkflow(nextConfig);

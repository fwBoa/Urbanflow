import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the frontend app dir so `.next/standalone` emits a flat
  // `server.js` (not nested under the repo path). The Dockerfile copies
  // `/app/.next/standalone ./` and runs `node server.js`, which requires
  // the flat layout. See node_modules/next/dist/docs/.../output.md.
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {},
};

export default nextConfig;

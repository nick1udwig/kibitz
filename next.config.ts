import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: Removed 'output: export' to allow API routes to work
  // Set your base path here. For example: '/kibitz' or '/my-app'
  // Leave it as undefined or remove it to use the root path
  basePath: process.env.NEXT_PUBLIC_BASE_PATH,
  
  // exportPathMap is not compatible with App Router - removed
  // API routes will work normally with the App Router
};

export default nextConfig;

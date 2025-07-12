import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // Set your base path here. For example: '/kibitz' or '/my-app'
  // Leave it as undefined or remove it to use the root path
  basePath: process.env.NEXT_PUBLIC_BASE_PATH,
  
  // Exclude the storage API from static export
  exportPathMap: async function (defaultPathMap) {
    const pathMap = { ...defaultPathMap };
    // Remove API routes from static export
    delete pathMap['/api/storage'];
    return pathMap;
  },
};

export default nextConfig;

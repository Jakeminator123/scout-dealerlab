import type { NextConfig } from 'next';
const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  experimental: { cpus: 4 },
};
export default config;

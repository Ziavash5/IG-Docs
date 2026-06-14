/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow PDF uploads through server actions.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.danmurphys.com.au",
        port: "",
        pathname: "/dmo/product/**",
      },
    ],
  },
};

module.exports = nextConfig;

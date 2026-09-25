/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The legacy Web app serves no image assets. Disable Next's built-in image
  // optimizer so its /_next/image route cannot be reached on this runtime.
  images: {
    unoptimized: true,
  },
  // Workspace packages ship untranspiled-for-the-browser ESM (ES2022 + JSON
  // import attributes). Let Next compile them with the app's own toolchain.
  transpilePackages: ["@benten/registry", "@benten/solana", "@benten/solana-rpc-relay", "@benten/purchase"],
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@storees/shared'],
  experimental: {
    // Disable build workers to reduce memory usage on low-RAM servers
    workerThreads: false,
    cpus: 1,
  },
}

export default nextConfig

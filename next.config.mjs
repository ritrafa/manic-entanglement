/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
      WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
      PINATA_API_KEY: process.env.PINATA_API_KEY,
      NEXT_PUBLIC_COLLECTION_ADDRESS: process.env.NEXT_PUBLIC_COLLECTION_ADDRESS,
      PINATA_API_SECRET_KEY: process.env.PINATA_API_SECRET_KEY,
    },
  };
  
  
  export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
    // The NFT image route (E71) reads the 16x16 PFP masters from disk with
    // fs at request time, so the deploy must ship them next to the server
    // bundle: name them here or Next's file tracing drops them.
    outputFileTracingIncludes: {
        "/api/reptile/**": ["./public/images/nft/**"],
    },
};

export default nextConfig;

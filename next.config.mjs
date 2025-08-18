// /** @type {import('next').NextConfig} */
// const nextConfig = {};

// export default nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
    async headers() {
        return [
            {
                source: '/(.*)', // match all routes
                headers: [
                    {
                        key: 'ngrok-skip-browser-warning',
                        value: 'true',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;

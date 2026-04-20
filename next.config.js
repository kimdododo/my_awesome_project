/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // 리빌드 후 옛 HTML이 디스크 캐시에 남아 해시된 CSS만 404 나는 경우 방지
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;

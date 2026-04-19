import './globals.css';

export const metadata = {
  title: '주간 대시보드',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

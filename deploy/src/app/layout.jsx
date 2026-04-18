import './globals.css';

export const metadata = {
  title: 'K-Beauty SEA · Weekly Report',
  description: 'Caris outbound intelligence desk',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

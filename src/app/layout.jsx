import './globals.css';
import AnalyticsClient from './AnalyticsClient';
import { Suspense } from 'react';

export const metadata = {
  title: '주간 대시보드',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital,wght@0,400;1,400&display=swap"
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <AnalyticsClient />
        </Suspense>
        {children}
      </body>
    </html>
  );
}

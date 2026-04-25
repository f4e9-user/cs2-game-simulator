import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'CS2 电竞选手人生模拟器',
  description: '从青训到职业赛场，经历每一次试训、每一场对枪、每一次破圈。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0d10',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="layout">{children}</div>
      </body>
    </html>
  );
}

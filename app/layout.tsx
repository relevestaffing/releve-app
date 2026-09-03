import './globals.css';
import type { Metadata, Viewport } from 'next';
import Toaster from '@/components/Toast';

export const metadata: Metadata = {
  title: 'Relève — Accounts Center',
  description: 'The Relève Signature, talent matching, and placement management.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Relève',
  appleWebApp: { capable: true, title: 'Relève', statusBarStyle: 'default' },
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  formatDetection: { telephone: false }
};

/* The status bar picks up the fern when it is added to a home screen. */
export const viewport: Viewport = {
  themeColor: '#35443A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'          // lets the safe-area insets in globals.css do their job
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Marcellus&family=WindSong:wght@500&family=Tenor+Sans&display=swap" rel="stylesheet" />
      </head>
      <body>{children}<Toaster /></body>
    </html>
  );
}

import './globals.css';
import type { Metadata, Viewport } from 'next';
import Toaster from '@/components/Toast';
import SWRegister from '@/components/SWRegister';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';
const TITLE = 'Relève · Accounts Center';
const DESCRIPTION = 'The Relève Signature, talent matching, and placement management.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: 'website', siteName: 'Relève', title: TITLE, description: DESCRIPTION, url: '/',
    images: [{ url: '/icon-1024.png', width: 1024, height: 1024, alt: 'Relève' }]
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION, images: ['/icon-1024.png'] },
  manifest: '/manifest.webmanifest',
  applicationName: 'Relève',
  appleWebApp: { capable: true, title: 'Relève', statusBarStyle: 'default' },
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  formatDetection: { telephone: false }
};

/* The status bar picks up the fern when it is added to a home screen. */
export const viewport: Viewport = {
  /* The top of the app on a phone is the cream topbar, not the fern sidebar —
     which is hidden below 900px. Matching it keeps the status bar seamless. */
  themeColor: '#FAF8F2',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'          // lets the safe-area insets in globals.css do their job
};

/* suppressHydrationWarning sits on <html> below for one specific, intended
   reason: the inline script in <head> adds class="js" to that very element
   before first paint, so by the time React hydrates, the DOM carries an
   attribute the server never rendered. React reported this on every page in
   the app — "a tree hydrated but some attributes of the server rendered HTML
   didn't match" — noise that buried anything real in the console. The flag
   covers this element's own attributes only, never its children, so a genuine
   mismatch anywhere inside the app still surfaces. (12 October pre-launch
   crawl: all 51 routes, this was the only thing it found.) */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Set before first paint. Every reveal in globals.css is gated on
            html.js, so a browser with scripting off — or a script that fails
            to load — renders the whole app visible rather than blank. */}
        <script dangerouslySetInnerHTML={{ __html:
          "var d=document.documentElement;d.classList.add('js');" +
          "setTimeout(function(){if(!d.classList.contains('rv-live'))d.classList.add('rv-off')},6000)"
        }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Marcellus&family=WindSong:wght@500&family=Tenor+Sans&display=swap" rel="stylesheet" />
      </head>
      <body>{children}<Toaster /><SWRegister /></body>
    </html>
  );
}

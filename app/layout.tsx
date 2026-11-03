import './globals.css';
import './evergreen.css';
import type { Metadata, Viewport } from 'next';
import Toaster from '@/components/Toast';
import SaveLock from '@/components/SaveLock';
import SWRegister from '@/components/SWRegister';
import Splash from '@/components/Splash';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

/* [image px width, image px height, CSS width, CSS height, pixel ratio] */
const STARTUP: [number, number, number, number, number][] = [
  [1320, 2868, 440, 956, 3], [1290, 2796, 430, 932, 3], [1206, 2622, 402, 874, 3], [1179, 2556, 393, 852, 3],
  [1170, 2532, 390, 844, 3], [1125, 2436, 375, 812, 3], [1242, 2688, 414, 896, 3], [828, 1792, 414, 896, 2],
  [1242, 2208, 414, 736, 3], [750, 1334, 375, 667, 2],
  [2048, 2732, 1024, 1366, 2], [1668, 2388, 834, 1194, 2], [1640, 2360, 820, 1180, 2], [1620, 2160, 810, 1080, 2], [1488, 2266, 744, 1133, 2]
];
const STARTUP_IMAGES = STARTUP.map(([w, h, cw, ch, r]) => ({
  url: `/splash/${w}x${h}.png`,
  media: `(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`
}));
const TITLE = 'Relève';
const DESCRIPTION = 'The Relève Signature, talent matching, and placement management.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  /* Each page names itself ("Billing · Relève"); the bare name is the
     fallback for anything that does not. */
  title: { default: TITLE, template: '%s · Relève' },
  description: DESCRIPTION,
  openGraph: {
    type: 'website', siteName: 'Relève', title: TITLE, description: DESCRIPTION, url: '/',
    images: [{ url: '/icon-1024.png', width: 1024, height: 1024, alt: 'Relève' }]
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION, images: ['/icon-1024.png'] },
  manifest: '/manifest.webmanifest',
  applicationName: 'Relève',
  /* Added to the Home Screen, iOS shows these between the tap and the first
     paint of the page. Without them it shows a black screen in dark mode for
     as long as the cold launch takes, which on a phone over cellular can be
     most of ten seconds. One image per device size, cream with the wordmark,
     the same picture the in-page splash then takes over. */
  appleWebApp: { capable: true, title: 'Relève', statusBarStyle: 'default', startupImage: STARTUP_IMAGES },
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  formatDetection: { telephone: false }
};

/* The status bar picks up the fern when it is added to a home screen. */
export const viewport: Viewport = {
  /* The top of the app on a phone is the cream topbar, not the fern sidebar —
     which is hidden below 900px. Matching it keeps the status bar seamless. */
  themeColor: '#FAF8F2',
  colorScheme: 'light',          // never a black launch or form controls on a dark phone
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
          "window.__rvSplashStart=Date.now();" +
          "setTimeout(function(){if(!d.classList.contains('rv-live'))d.classList.add('rv-off')},2200);" +
          "setTimeout(function(){var s=document.getElementById('rv-splash');if(s){s.style.display='none'}},8000)"
        }} />
        <style dangerouslySetInnerHTML={{ __html: `
          #rv-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FBF8F1;opacity:1;transition:opacity .4s ease .12s}
          #rv-splash.rv-splash-done{opacity:0;pointer-events:none}
          html:not(.js) #rv-splash{display:none}
          #rv-splash .rv-logo{display:block;width:min(74vw,400px);height:auto;opacity:0;animation:rvFade .45s ease both}
          #rv-splash .rv-bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:rgba(53,68,58,.12)}
          #rv-splash .rv-bar i{display:block;height:100%;width:0;background:#35443A;animation:rvFill 2.6s cubic-bezier(.4,.1,.2,1) .1s forwards}
          #rv-splash.rv-splash-done .rv-logo,#rv-splash.rv-splash-done .rv-bar{animation:rvOut .14s ease forwards}
          @keyframes rvFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
          @keyframes rvFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:.95;transform:none}}
          @keyframes rvOut{to{opacity:0}}
          @keyframes rvFill{0%{width:0}70%{width:82%}100%{width:100%}}
          @media (prefers-reduced-motion: reduce){#rv-splash .rv-logo{animation:none;opacity:1}#rv-splash .rv-bar i{animation:none;width:40%}#rv-splash.rv-splash-done .rv-logo,#rv-splash.rv-splash-done .rv-bar{animation:rvOut .14s ease forwards}}
        ` }} />
        <link rel="preload" as="image" href="/logo-fern.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500&family=Marcellus&family=WindSong:wght@500&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Splash />
        {children}<Toaster /><SaveLock /><SWRegister />
      </body>
    </html>
  );
}

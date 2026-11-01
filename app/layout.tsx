import './globals.css';
import type { Metadata, Viewport } from 'next';
import Toaster from '@/components/Toast';
import SWRegister from '@/components/SWRegister';
import SplashGate from '@/components/SplashGate';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';
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
          "window.__rvSplashStart=Date.now();" +
          "setTimeout(function(){if(!d.classList.contains('rv-live'))d.classList.add('rv-off')},2200);" +
          "setTimeout(function(){var s=document.getElementById('rv-splash');if(s){s.classList.add('rv-splash-done');setTimeout(function(){if(s)s.remove()},600)}},8000)"
        }} />
        <style dangerouslySetInnerHTML={{ __html: `
          #rv-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FBF8F1;opacity:1;transition:opacity .5s ease}
          #rv-splash.rv-splash-done{opacity:0;pointer-events:none}
          #rv-splash .rv-word{font-family:"Marcellus",Georgia,serif;font-size:clamp(40px,12vw,64px);letter-spacing:1px;color:#35443A;line-height:1;position:relative;opacity:0;animation:rvFade .9s ease .1s forwards}
          #rv-splash .rv-word .rv-sheen{position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.85) 50%,transparent 58%);background-size:260% 100%;background-position:160% 0;-webkit-background-clip:text;background-clip:text;color:transparent;animation:rvSweep 1.5s ease 1s forwards}
          #rv-splash .rv-sub{margin-top:16px;font-family:"Tenor Sans","Helvetica Neue",Arial,sans-serif;font-size:11px;letter-spacing:5px;text-transform:uppercase;color:#6E7F71;opacity:0;animation:rvFadeUp .8s ease .55s forwards}
          #rv-splash .rv-bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:rgba(53,68,58,.12)}
          #rv-splash .rv-bar i{display:block;height:100%;width:0;background:#35443A;animation:rvFill 2.6s cubic-bezier(.4,.1,.2,1) .2s forwards}
          @keyframes rvFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
          @keyframes rvFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:.95;transform:none}}
          @keyframes rvSweep{from{background-position:160% 0}to{background-position:-60% 0}}
          @keyframes rvFill{0%{width:0}70%{width:82%}100%{width:100%}}
          @media (prefers-reduced-motion: reduce){#rv-splash .rv-word,#rv-splash .rv-sub{animation:none;opacity:1}#rv-splash .rv-word .rv-sheen{display:none}#rv-splash .rv-bar i{animation:none;width:40%}}
        ` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Marcellus&family=WindSong:wght@500&family=Tenor+Sans&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div id="rv-splash" aria-hidden="true">
          <div className="rv-word">RELÈVE<span className="rv-sheen" aria-hidden="true">RELÈVE</span></div>
          <div className="rv-sub">Executive Staffing</div>
          <div className="rv-bar"><i></i></div>
        </div>
        {children}<Toaster /><SWRegister /><SplashGate />
      </body>
    </html>
  );
}

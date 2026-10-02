'use client';
import { useEffect } from 'react';
import './globals.css';
import BrandedError from '@/components/BrandedError';

/* The last resort: the root layout itself failed, so this page brings its own
   html, body, fonts and styles. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[global]', error); }, [error]);
  return (
    <html lang="en">
      <head>
        <title>Relève</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Tenor+Sans&display=swap" rel="stylesheet" />
      </head>
      <body>
        <BrandedError
          eyebrow="A moment"
          title="Relève did not load"
          line="Something on our side stopped this page from opening. Try again in a moment; if it persists, write to us and a person will reply."
          retry={reset} home="/" digest={error.digest} />
      </body>
    </html>
  );
}

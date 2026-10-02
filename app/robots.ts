import type { MetadataRoute } from 'next';

/* The app is a private accounts center. The sign-in page may be found;
   nothing behind it, and no pay-by-link page, belongs in a search index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/$',
      disallow: ['/app', '/console', '/api', '/auth', '/pay', '/pay-invoice', '/placement-confirmed']
    }]
  };
}

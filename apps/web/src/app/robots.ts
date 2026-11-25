import type { MetadataRoute } from 'next';
import { publicConfig } from '@/lib/public-config';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/login', '/api'],
    },
    ...(publicConfig.siteUrl
      ? { sitemap: `${publicConfig.siteUrl}/sitemap.xml` }
      : {}),
  };
}

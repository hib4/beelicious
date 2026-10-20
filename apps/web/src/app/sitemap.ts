import type { MetadataRoute } from 'next';
import { publicConfig } from '@/lib/public-config';
export default function sitemap(): MetadataRoute.Sitemap {
  return publicConfig.siteUrl
    ? [{ url: publicConfig.siteUrl, changeFrequency: 'monthly', priority: 1 }]
    : [];
}

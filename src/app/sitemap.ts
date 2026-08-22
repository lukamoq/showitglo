import { MetadataRoute } from 'next';

import { getSitemapEntries } from '@/lib/db/store';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

const MAX_POST_ENTRIES = 1000;

/**
 * The public sitemap.
 *
 * Database failures degrade to the static routes rather than propagating: a
 * sitemap that 500s tells crawlers the whole site is broken, while one that
 * lists seven real pages is merely incomplete for as long as the outage lasts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://showitglo.com';
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'always', priority: 1.0 },
    { url: `${baseUrl}/debates`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/wars`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/insights`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/history`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/impressum`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    const { posts, debates } = await getSitemapEntries(MAX_POST_ENTRIES);

    const postRoutes: MetadataRoute.Sitemap = posts.map((entry) => ({
      url: `${baseUrl}/p/${entry.slug}`,
      lastModified: new Date(entry.updated_at),
      changeFrequency: 'hourly',
      priority: 0.8,
    }));

    const debateRoutes: MetadataRoute.Sitemap = debates.map((entry) => ({
      url: `${baseUrl}/d/${entry.slug}`,
      lastModified: new Date(entry.updated_at),
      changeFrequency: 'hourly',
      priority: 0.85,
    }));

    return [...staticRoutes, ...postRoutes, ...debateRoutes];
  } catch (err) {
    log('error', 'sitemap.dynamic_entries_failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return staticRoutes;
  }
}

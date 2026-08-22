import { MetadataRoute } from 'next';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://showitglo.com';
  const now = new Date();

  // Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'always',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/debates`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/wars`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/insights`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/history`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/impressum`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  // Dynamic Post pages
  const posts = db.getAllPosts().filter((p) => p.status === 'live');
  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/p/${post.slug}`,
    lastModified: new Date(post.created_at),
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  // Dynamic Debate pages
  const debates = db.getDebates();
  const debateRoutes: MetadataRoute.Sitemap = debates.map((debate) => ({
    url: `${baseUrl}/d/${debate.slug || debate.id}`,
    lastModified: new Date(debate.created_at),
    changeFrequency: 'hourly',
    priority: 0.85,
  }));

  return [...staticRoutes, ...postRoutes, ...debateRoutes];
}

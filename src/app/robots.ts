import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://showitglo.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/debates',
          '/wars',
          '/insights',
          '/history',
          '/privacy',
          '/impressum',
          '/p/',
          '/d/',
        ],
        disallow: [
          '/admin',
          '/api/',
          '/dashboard',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

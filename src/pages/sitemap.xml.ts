import type { APIRoute } from 'astro';

export const prerender = true;

const publicPages = [
  '/',
  '/affiliate-disclosure/',
  '/creators/',
  '/honey-alternative/',
  '/how-it-works/',
  '/merchants/',
  '/networks/',
  '/privacy/',
  '/stand-down/',
  '/support/',
  '/terms/',
  '/transparency/',
  '/updates/',
] as const;

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character] ?? character);

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error('Astro site URL is required to generate sitemap.xml');

  const urls = publicPages
    .map((path) => `  <url><loc>${escapeXml(new URL(path, site).href)}</loc></url>`)
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};

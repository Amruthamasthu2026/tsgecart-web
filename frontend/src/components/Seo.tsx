import { useEffect } from 'react';

interface SeoProps {
  title: string;
  description?: string;
  image?: string;
  canonicalPath?: string;
  type?: 'website' | 'product' | 'article';
  jsonLd?: Record<string, unknown>;
  noindex?: boolean;
}

const SITE_NAME = 'TSG eCart';
const DEFAULT_DESC = 'Fresh groceries delivered fast across Hyderabad — order fruits, vegetables, dairy and daily essentials in minutes.';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Manages document head SEO tags without an external dependency: title,
 * description, Open Graph, canonical, robots, and optional JSON-LD.
 */
export function Seo({
  title,
  description = DEFAULT_DESC,
  image,
  canonicalPath,
  type = 'website',
  jsonLd,
  noindex = false,
}: SeoProps) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;
    document.title = fullTitle;

    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', type);
    if (image) upsertMeta('property', 'og:image', image);

    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', description);
    if (image) upsertMeta('name', 'twitter:image', image);

    const canonical = `${window.location.origin}${canonicalPath ?? window.location.pathname}`;
    upsertLink('canonical', canonical);
    upsertMeta('property', 'og:url', canonical);

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify(jsonLd);
      script.dataset.seo = 'jsonld';
      document.head.appendChild(script);
    }
    return () => {
      if (script) document.head.removeChild(script);
    };
  }, [title, description, image, canonicalPath, type, jsonLd, noindex]);

  return null;
}

// lib/injector.js
// High-performance HTML string injector for SEO tags, Schema JSON-LD & Crawler content

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const stripHtml = (html) => {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Format Breadcrumbs into Schema.org BreadcrumbList
 */
function buildBreadcrumbsSchema(breadcrumbs, siteUrl = '') {
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0) return null;
  const baseUrl = (siteUrl || '').replace(/\/+$/, '');

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => {
      const itemUrl = item.url.startsWith('http')
        ? item.url
        : `${baseUrl}${item.url.startsWith('/') ? item.url : `/${item.url}`}`;

      return {
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: itemUrl,
      };
    }),
  };
}

/**
 * Automatically generate clean, semantic crawler HTML when bodyContent is omitted
 */
function generateDefaultBodyContent(seoData) {
  const title = seoData.title ? escapeHtml(seoData.title) : '';
  const desc = seoData.description ? escapeHtml(stripHtml(seoData.description)) : '';
  const image = seoData.image ? escapeHtml(seoData.image) : '';

  // Extract price from schema offers if available
  let priceText = '';
  const schemaObj = Array.isArray(seoData.schema)
    ? seoData.schema.find((s) => s && s.offers)
    : seoData.schema;

  if (schemaObj && schemaObj.offers) {
    const offers = schemaObj.offers;
    const price = offers.price !== undefined ? offers.price : '';
    const currency = offers.priceCurrency || 'INR';
    if (price) {
      priceText = `<p class="ssr-price" style="font-size: 16px; font-weight: 600; color: #111827; margin: 8px 0;">Price: ${escapeHtml(currency)} ${escapeHtml(String(price))}</p>`;
    }
  }

  // Breadcrumbs
  let breadcrumbHtml = '';
  if (Array.isArray(seoData.breadcrumbs) && seoData.breadcrumbs.length > 0) {
    const crumbs = seoData.breadcrumbs
      .map((b) => `<a href="${escapeHtml(b.url)}" style="color: inherit; text-decoration: none;">${escapeHtml(b.name)}</a>`)
      .join(' &gt; ');
    breadcrumbHtml = `<nav aria-label="Breadcrumb" style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">${crumbs}</nav>`;
  }

  return `
    <article class="ssr-seo-content" data-ssr="vite-spa-seo" style="max-width: 1200px; margin: 0 auto; padding: 20px; font-family: system-ui, -apple-system, sans-serif; color: #1f2937;">
      ${breadcrumbHtml}
      ${title ? `<h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 12px 0;">${title}</h1>` : ''}
      ${image ? `<img src="${image}" alt="${title}" style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 16px; display: block;" />` : ''}
      ${priceText}
      ${desc ? `<div class="ssr-desc" style="font-size: 14px; line-height: 1.6; color: #374151; margin-top: 12px;">${desc}</div>` : ''}
    </article>
  `;
}

/**
 * Main SEO injection function
 */
function injectSeo(rawHtml, seoData = {}, options = {}) {
  if (!rawHtml) return '';
  if (!seoData) return rawHtml;

  const {
    siteUrl = '',
    siteName = '',
    rootSelector = '<div id="root"></div>',
  } = options;

  const baseUrl = (siteUrl || '').replace(/\/+$/, '');
  const title = seoData.title ? escapeHtml(seoData.title) : '';
  const description = seoData.description ? escapeHtml(stripHtml(seoData.description).slice(0, 160)) : '';

  let canonical = seoData.canonical || '';
  if (canonical && !canonical.startsWith('http')) {
    canonical = `${baseUrl}${canonical.startsWith('/') ? canonical : `/${canonical}`}`;
  }
  canonical = escapeHtml(canonical);

  const image = seoData.image ? escapeHtml(seoData.image) : '';
  const type = seoData.type || 'website';

  const tags = [];
  tags.push('<!-- Dynamic SEO Injected by vite-spa-seo -->');

  if (title) {
    tags.push(`<title>${title}</title>`);
  }

  if (description) {
    tags.push(`<meta name="description" content="${description}">`);
  }

  if (canonical) {
    tags.push(`<link rel="canonical" href="${canonical}">`);
  }

  // OpenGraph Tags
  if (type) tags.push(`<meta property="og:type" content="${escapeHtml(type)}">`);
  if (siteName) tags.push(`<meta property="og:site_name" content="${escapeHtml(siteName)}">`);
  if (title) tags.push(`<meta property="og:title" content="${title}">`);
  if (description) tags.push(`<meta property="og:description" content="${description}">`);
  if (canonical) tags.push(`<meta property="og:url" content="${canonical}">`);
  if (image) tags.push(`<meta property="og:image" content="${image}">`);

  // Extra OpenGraph fields (e.g. 'product:price:amount', 'article:author')
  if (seoData.openGraph && typeof seoData.openGraph === 'object') {
    for (const [key, val] of Object.entries(seoData.openGraph)) {
      if (val !== undefined && val !== null) {
        const prop = key.startsWith('og:') ? key : (key.includes(':') ? key : `og:${key}`);
        tags.push(`<meta property="${escapeHtml(prop)}" content="${escapeHtml(String(val))}">`);
      }
    }
  }

  // Twitter Card Tags
  tags.push(`<meta name="twitter:card" content="${escapeHtml(seoData.twitterCard || (image ? 'summary_large_image' : 'summary'))}">`);
  if (title) tags.push(`<meta name="twitter:title" content="${title}">`);
  if (description) tags.push(`<meta name="twitter:description" content="${description}">`);
  if (image) tags.push(`<meta name="twitter:image" content="${image}">`);

  // Schema.org JSON-LD
  const schemasToInject = [];
  if (seoData.schema) {
    if (Array.isArray(seoData.schema)) {
      schemasToInject.push(...seoData.schema);
    } else {
      schemasToInject.push(seoData.schema);
    }
  }

  // Breadcrumbs Schema auto-generation
  if (seoData.breadcrumbs) {
    const breadcrumbSchema = buildBreadcrumbsSchema(seoData.breadcrumbs, baseUrl);
    if (breadcrumbSchema) {
      schemasToInject.push(breadcrumbSchema);
    }
  }

  // Inject Schemas
  for (const s of schemasToInject) {
    try {
      tags.push(`<script type="application/ld+json">${JSON.stringify(s)}</script>`);
    } catch {
      // Ignore serialization errors
    }
  }

  const headInjectString = tags.join('\n    ');

  let updatedHtml = rawHtml;

  // Clean existing title & meta tags from raw HTML template
  if (title && /<title>.*?<\/title>/i.test(updatedHtml)) {
    updatedHtml = updatedHtml.replace(/<title>.*?<\/title>/i, '');
  }
  if (description && /<meta\s+name=["']description["'][^>]*>/i.test(updatedHtml)) {
    updatedHtml = updatedHtml.replace(/<meta\s+name=["']description["'][^>]*>/i, '');
  }
  if (canonical && /<link\s+rel=["']canonical["'][^>]*>/i.test(updatedHtml)) {
    updatedHtml = updatedHtml.replace(/<link\s+rel=["']canonical["'][^>]*>/i, '');
  }

  // Inject into </head>
  if (updatedHtml.includes('</head>')) {
    updatedHtml = updatedHtml.replace('</head>', `    ${headInjectString}\n  </head>`);
  } else {
    updatedHtml = `${headInjectString}\n${updatedHtml}`;
  }

  // Determine body content: either custom bodyContent or auto-generated semantic HTML
  const contentToInject = (seoData.bodyContent !== undefined && seoData.bodyContent !== null)
    ? String(seoData.bodyContent)
    : generateDefaultBodyContent(seoData);

  if (contentToInject && contentToInject.trim()) {
    // Robust Regex to match <div id="root"> or <div id="app"> even with newlines, spaces, or classes
    const rootContainerRegex = /<([a-zA-Z0-9_-]+)([^>]*?\bid=["'](?:root|app)["'][^>]*)>(.*?)<\/\1>/is;

    if (rootContainerRegex.test(updatedHtml)) {
      updatedHtml = updatedHtml.replace(rootContainerRegex, (match, tag, attrs) => {
        return `<${tag}${attrs}>${contentToInject}</${tag}>`;
      });
    } else if (rootSelector && updatedHtml.includes(rootSelector)) {
      const replacement = rootSelector.replace('>', `>${contentToInject}`);
      updatedHtml = updatedHtml.replace(rootSelector, replacement);
    } else if (updatedHtml.includes('<body')) {
      // Fallback: inject inside body
      updatedHtml = updatedHtml.replace(/<body([^>]*)>/i, `<body$1>\n    <div id="root">${contentToInject}</div>`);
    }
  }

  return updatedHtml;
}

module.exports = {
  injectSeo,
  escapeHtml,
  stripHtml,
  buildBreadcrumbsSchema,
  generateDefaultBodyContent,
};

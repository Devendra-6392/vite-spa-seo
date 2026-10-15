
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

  // Inject semantic content inside root container for crawlers
  if (seoData.bodyContent && updatedHtml.includes(rootSelector)) {
    const replacement = rootSelector.replace('>', `>${seoData.bodyContent}`);
    updatedHtml = updatedHtml.replace(rootSelector, replacement);
  }

  return updatedHtml;
}

module.exports = {
  injectSeo,
  escapeHtml,
  stripHtml,
  buildBreadcrumbsSchema,
};

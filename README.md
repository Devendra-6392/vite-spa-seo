# vite-spa-seo 

[![npm version](https://img.shields.io/npm/v/vite-spa-seo.svg)](https://www.npmjs.com/package/vite-spa-seo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/vite-spa-seo)
[![RAM Usage](https://img.shields.io/badge/RAM%20overhead-0%20MB-success.svg)](https://github.com/ideacraft/vite-spa-seo)

> **The Zero-Overhead, Zero-Dependency Server-Side SEO & Schema.org Injector for Vite SPAs (React, Vue, Svelte) on Express.**

Serve dynamic `<title>`, `<meta>`, OpenGraph, Twitter Cards, Google Shopping **Schema.org JSON-LD**, and semantic crawler content in **~2 milliseconds** — without Puppeteer, without Chromium, and without rewriting your frontend in Next.js!

---

##  The Problem with SPAs & Low-RAM Servers

Single Page Applications (React, Vue, Svelte with Vite) send an empty `<div id="root"></div>` to the client.

- **Next.js SSR**: Requires rewriting your entire frontend application, complex server runtime, and vendor lock-in.
- **Puppeteer / Rendertron**: Spawns heavy Chromium processes at runtime. On low-resource VPS (AWS EC2 `t2.micro`, DigitalOcean $4-6 droplets with 512MB–1GB RAM), it causes **Out-Of-Memory (OOM) crashes and server downtime**.

### The Solution: `vite-spa-seo`

`vite-spa-seo` intercepts requests on your Express server, extracts the requested product/article data from your database or cache in ~2ms, and cleanly injects SEO tags, structured data, and semantic crawler HTML directly into Vite's `dist/index.html`.

- **0 MB Extra RAM** (No Headless Chrome, no browser pool).
- **Zero Runtime Dependencies** (Lightweight, pure Node.js).
- **Googlebot & Social Bots Ready** (Facebook, WhatsApp, Twitter, LinkedIn cards).
- **100% Client-Side Intact** (React/Vue takes over `#root` seamlessly without hydration errors).

---

##  Installation

```bash
npm install vite-spa-seo
```

---

##  Quick Start

```javascript
const express = require('express');
const path = require('path');
const { createSpaSeoMiddleware } = require('vite-spa-seo');

const app = express();

app.use(
  createSpaSeoMiddleware({
    // Path to your Vite built dist directory
    distDir: path.resolve(__dirname, './dist'),
    siteUrl: 'https://myshop.com',
    siteName: 'My Awesome Store',

    // 1. Static Pages
    staticPages: {
      '/': {
        title: 'Home | My Awesome Store',
        description: 'Explore our premium catalog with free shipping nationwide.',
      },
      '/about': {
        title: 'About Us | My Awesome Store',
        description: 'Learn about our journey, vision, and team.',
      },
    },

    // 2. Dynamic Routes (Products, Articles, Categories)
    routes: [
      {
        path: '/product/:sku',
        handler: async ({ params }) => {
          // Fetch from your database or API
          const product = await db.products.findOne({ sku: params.sku });
          if (!product) return null; // Falls back to standard SPA (React handles 404)

          return {
            title: `${product.name} | My Awesome Store`,
            description: product.description,
            canonical: `/product/${product.sku}`,
            image: product.imageUrl,
            openGraph: {
              type: 'product',
              'product:price:amount': product.price,
              'product:price:currency': 'USD',
            },
            // Google Shopping Rich Snippet Schema
            schema: {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: product.name,
              sku: product.sku,
              image: [product.imageUrl],
              offers: {
                '@type': 'Offer',
                price: product.price,
                priceCurrency: 'USD',
                availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              },
            },
            // Auto-generates BreadcrumbList Schema
            breadcrumbs: [
              { name: 'Home', url: '/' },
              { name: product.category, url: `/category/${product.categorySlug}` },
              { name: product.name, url: `/product/${product.sku}` },
            ],
            // Semantic crawler content injected into <div id="root">
            bodyContent: `
              <article>
                <h1>${product.name}</h1>
                <p>Price: $${product.price}</p>
                <img src="${product.imageUrl}" alt="${product.name}" />
                <div>${product.description}</div>
              </article>
            `,
          };
        },
      },
    ],
  })
);

app.listen(3000, () => console.log('Server running on port 3000'));
```

---

##  API Reference

### `createSpaSeoMiddleware(options)`

Returns a standard Express / Connect middleware.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `distDir` | `string` | *(Required)* | Path to the Vite build directory containing `index.html` and `assets/`. |
| `indexHtmlPath` | `string` | `distDir/index.html` | Explicit path to `index.html` template. |
| `siteUrl` | `string` | `''` | Base canonical domain (e.g. `https://example.com`). |
| `siteName` | `string` | `''` | Site branding for `og:site_name`. |
| `rootSelector` | `string` | `<div id="root"></div>` | The HTML container to inject crawler body content into. |
| `cacheTTL` | `number` | `3600000` (1h) | In-memory cache duration in milliseconds. Set `0` to disable caching. |
| `routes` | `Array<DynamicRoute>` | `[]` | List of route patterns (`/product/:id`, `/user/:username`, etc.) and async handlers. |
| `staticPages` | `Object` | `{}` | Key-value map of exact paths to static SEO data. |
| `ignorePaths` | `Array<string \| RegExp>` | `['/api', '/admin', ...]` | Routes to skip (API endpoints, WebSockets, etc.). |
| `serveAssets` | `boolean` | `true` | Automatically serves Vite's `dist/assets` with `1y` immutable cache headers. |
| `assetsMaxAge` | `string` | `'1y'` | Cache-Control max-age for static assets. |

---

### `SeoData` Object Structure

The object returned by route handlers or static pages:

```typescript
interface SeoData {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: string;                     // Default: 'website'
  twitterCard?: string;              // Default: 'summary_large_image' if image present
  openGraph?: Record<string, any>;   // Additional OG meta properties
  schema?: object | object[];        // Schema.org JSON-LD structured data
  breadcrumbs?: Array<{ name: string; url: string }>; // Auto-builds BreadcrumbList schema
  bodyContent?: string;              // Crawlable semantic HTML injected inside #root
}
```

---

## 🧹 Cache Management

The middleware includes a built-in `purgeCache()` method:

```javascript
const seoMiddleware = createSpaSeoMiddleware({ ... });
app.use(seoMiddleware);

// Purge a single route when product is updated in CMS
app.post('/api/products/:sku/updated', (req, res) => {
  seoMiddleware.purgeCache(`/product/${req.params.sku}`);
  res.json({ success: true });
});

// Purge all cached HTML
app.post('/api/cache/purge-all', (req, res) => {
  seoMiddleware.purgeCache();
  res.json({ success: true });
});
```

---

## 🧪 Testing

Run the included test suite:

```bash
npm test
```

Run the example demo server:

```bash
npm run example
```

---

## 📄 License

MIT © [Ideacraft](https://github.com/ideacraft)

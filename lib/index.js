// lib/index.js
// vite-spa-seo: The Zero-Overhead, Zero-Dependency SEO Middleware for Vite SPAs

const fs = require('fs');
const path = require('path');
const { MemoryCache } = require('./cache');
const { compileRoute, matchRoute } = require('./matcher');
const { injectSeo, escapeHtml, stripHtml, buildBreadcrumbsSchema } = require('./injector');

// Optional Express loader for express.static
let expressInstance = null;
try {
  expressInstance = require('express');
} catch {
  // Express not installed in package dev environment
}

/**
 * Simple mime-type map for asset streaming without external dependencies
 */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Helper to safely stream static files
 */
function serveStaticFile(req, res, filePath, maxAge = '1h') {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', `public, max-age=${maxAge === '1y' ? '31536000, immutable' : '3600'}`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  return true;
}

/**
 * Auto-detects Vite dist directory if omitted by developer
 */
function autoDetectDistDir(customDist, customIndexHtml) {
  if (customIndexHtml && fs.existsSync(customIndexHtml)) {
    return {
      distDir: path.dirname(path.resolve(customIndexHtml)),
      indexHtml: path.resolve(customIndexHtml),
    };
  }

  if (customDist) {
    const resolved = path.resolve(customDist);
    return {
      distDir: resolved,
      indexHtml: path.join(resolved, 'index.html'),
    };
  }

  // Auto-detect common project folder layouts
  const candidates = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), '../dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), 'build'),
  ];

  for (const candidate of candidates) {
    const candidateHtml = path.join(candidate, 'index.html');
    if (fs.existsSync(candidateHtml)) {
      return {
        distDir: candidate,
        indexHtml: candidateHtml,
      };
    }
  }

  // Fallback default
  const defaultDist = path.resolve(process.cwd(), 'dist');
  return {
    distDir: defaultDist,
    indexHtml: path.join(defaultDist, 'index.html'),
  };
}

/**
 * Create an Express/Connect compatible middleware for SEO injection on Vite SPAs
 */
function createSpaSeoMiddleware(options = {}) {
  const {
    distDir,
    indexHtmlPath,
    siteUrl = '',
    siteName = '',
    rootSelector = '<div id="root"></div>',
    cacheTTL = 60 * 60 * 1000, // 1 hour
    routes = [],
    staticPages = {},
    ignorePaths = ['/api', '/admin', '/socket.io', '/uploads'],
    serveAssets = true,
    assetsMaxAge = '1y',
  } = options;

  const resolved = autoDetectDistDir(distDir, indexHtmlPath);
  const resolvedDistDir = resolved.distDir;
  const resolvedIndexHtml = resolved.indexHtml;

  const cache = new MemoryCache(cacheTTL);

  // Compile route patterns
  const compiledRoutes = routes.map((r) => ({
    path: r.path,
    compiled: compileRoute(r.path),
    handler: r.handler,
    cacheTTL: r.cacheTTL,
  }));

  // Standard Express / Connect middleware function
  const middleware = async (req, res, next) => {
    // Only handle GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next ? next() : res.end();
    }

    const pathname = (req.path || req.url || '').split('?')[0];

    // Skip ignored paths (APIs, WebSockets, Admin)
    for (const ignored of ignorePaths) {
      if (typeof ignored === 'string' && pathname.startsWith(ignored)) {
        return next ? next() : res.end();
      }
      if (ignored instanceof RegExp && ignored.test(pathname)) {
        return next ? next() : res.end();
      }
    }

    // 1. Serve static assets if requested and enabled
    if (serveAssets) {
      if (pathname.startsWith('/assets/')) {
        const assetFilePath = path.join(resolvedDistDir, pathname);
        if (serveStaticFile(req, res, assetFilePath, assetsMaxAge)) {
          return;
        }
      }

      // Root static files (favicon.ico, robots.txt, sitemap.xml, manifest.json)
      const rootAssetPath = path.join(resolvedDistDir, pathname);
      if (pathname !== '/' && !path.extname(pathname) === '' && fs.existsSync(rootAssetPath)) {
        if (serveStaticFile(req, res, rootAssetPath, '1h')) {
          return;
        }
      }
    }

    // If dist/index.html is missing, pass through
    if (!fs.existsSync(resolvedIndexHtml)) {
      return next ? next() : res.end();
    }

    const cleanPath = pathname.replace(/\/+$/, '') || '/';
    const cacheKey = `html:${cleanPath}`;

    // Check in-memory HTML cache
    const cachedHtml = cache.get(cacheKey);
    if (cachedHtml) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Vite-SPA-SEO', 'cache-hit');
      return res.end(cachedHtml);
    }

    let seoData = null;
    let customTtl = cacheTTL;

    try {
      // A. Check Static Pages Map
      if (staticPages[cleanPath]) {
        seoData = typeof staticPages[cleanPath] === 'function'
          ? await staticPages[cleanPath]({ req, path: cleanPath })
          : staticPages[cleanPath];
      }

      // B. Check Dynamic Routes
      if (!seoData) {
        for (const route of compiledRoutes) {
          const params = matchRoute(route.compiled, cleanPath);
          if (params) {
            seoData = await route.handler({
              params,
              req,
              path: cleanPath,
              query: req.query || {},
            });

            if (route.cacheTTL !== undefined) {
              customTtl = route.cacheTTL;
            }
            break;
          }
        }
      }

      // 0. Check if a build-time prerendered HTML file exists for this route
      let prerenderedFilePath = null;
      if (cleanPath !== '/') {
        const nestedPath = path.join(resolvedDistDir, cleanPath, 'index.html');
        const flatPath = path.join(resolvedDistDir, `${cleanPath.replace(/^\/+/, '').replace(/\//g, '_')}.html`);
        const simpleHtmlPath = path.join(resolvedDistDir, `${cleanPath.replace(/^\/+/, '')}.html`);

        if (fs.existsSync(nestedPath) && fs.statSync(nestedPath).isFile()) {
          prerenderedFilePath = nestedPath;
        } else if (fs.existsSync(flatPath) && fs.statSync(flatPath).isFile()) {
          prerenderedFilePath = flatPath;
        } else if (fs.existsSync(simpleHtmlPath) && fs.statSync(simpleHtmlPath).isFile()) {
          prerenderedFilePath = simpleHtmlPath;
        }
      }

      // If prerendered file exists, serve it (optionally enrich if staticPages/routes has override data)
      if (prerenderedFilePath) {
        let prerenderedHtml = fs.readFileSync(prerenderedFilePath, 'utf8');

        // Optional: if user defined extra static/route SEO data, enrich the prerendered HTML
        if (seoData) {
          prerenderedHtml = injectSeo(prerenderedHtml, seoData, { siteUrl, siteName, rootSelector });
        }

        if (customTtl > 0) {
          cache.set(cacheKey, prerenderedHtml, customTtl);
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Vite-SPA-SEO', 'prerendered');
        return res.end(prerenderedHtml);
      }

      // Read template index.html
      const rawHtml = fs.readFileSync(resolvedIndexHtml, 'utf8');

      if (seoData) {
        const enrichedHtml = injectSeo(rawHtml, seoData, {
          siteUrl,
          siteName,
          rootSelector,
        });

        // Cache the enriched HTML string
        if (customTtl > 0) {
          cache.set(cacheKey, enrichedHtml, customTtl);
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Vite-SPA-SEO', 'injected');
        return res.end(enrichedHtml);
      }

      // C. Normal SPA Fallback (Non-SEO pages like /cart, /checkout, /login)
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Vite-SPA-SEO', 'spa-fallback');
      return res.end(rawHtml);
    } catch (err) {
      console.error(`[vite-spa-seo] Error handling ${cleanPath}:`, err.message);
      const rawHtml = fs.readFileSync(resolvedIndexHtml, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(rawHtml);
    }
  };

  // Attach helper to purge cache programmatically
  middleware.purgeCache = (route) => {
    if (route) {
      const clean = route.replace(/\/+$/, '') || '/';
      return cache.delete(`html:${clean}`);
    }
    cache.clear();
    return true;
  };

  return middleware;
}

// Lazy-load prerender function to keep pure-middleware mode zero-dependency
function prerender(options) {
  const { prerender: runPrerender } = require('./prerender');
  return runPrerender(options);
}

module.exports = {
  createSpaSeoMiddleware,
  injectSeo,
  prerender,
  MemoryCache,
  compileRoute,
  matchRoute,
  escapeHtml,
  stripHtml,
  buildBreadcrumbsSchema,
};

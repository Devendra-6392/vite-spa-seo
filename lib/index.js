
const fs = require('fs');
const path = require('path');
const { MemoryCache } = require('./cache');
const { compileRoute, matchRoute } = require('./matcher');
const { injectSeo, escapeHtml, stripHtml, buildBreadcrumbsSchema } = require('./injector');

let expressInstance = null;
try {
  expressInstance = require('express');
} catch {
}


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

  if (!distDir && !indexHtmlPath) {
    throw new Error('[vite-spa-seo] Either "distDir" or "indexHtmlPath" must be provided.');
  }

  const resolvedDistDir = distDir ? path.resolve(distDir) : path.dirname(path.resolve(indexHtmlPath));
  const resolvedIndexHtml = indexHtmlPath ? path.resolve(indexHtmlPath) : path.join(resolvedDistDir, 'index.html');

  const cache = new MemoryCache(cacheTTL);

  const compiledRoutes = routes.map((r) => ({
    path: r.path,
    compiled: compileRoute(r.path),
    handler: r.handler,
    cacheTTL: r.cacheTTL,
  }));

  const middleware = async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next ? next() : res.end();
    }

    const pathname = (req.path || req.url || '').split('?')[0];

    for (const ignored of ignorePaths) {
      if (typeof ignored === 'string' && pathname.startsWith(ignored)) {
        return next ? next() : res.end();
      }
      if (ignored instanceof RegExp && ignored.test(pathname)) {
        return next ? next() : res.end();
      }
    }

    if (serveAssets) {
      if (pathname.startsWith('/assets/')) {
        const assetFilePath = path.join(resolvedDistDir, pathname);
        if (serveStaticFile(req, res, assetFilePath, assetsMaxAge)) {
          return;
        }
      }

      const rootAssetPath = path.join(resolvedDistDir, pathname);
      if (pathname !== '/' && path.extname(pathname) !== '' && fs.existsSync(rootAssetPath)) {
        if (serveStaticFile(req, res, rootAssetPath, '1h')) {
          return;
        }
      }
    }

    if (!fs.existsSync(resolvedIndexHtml)) {
      return next ? next() : res.end();
    }

    const cleanPath = pathname.replace(/\/+$/, '') || '/';
    const cacheKey = `html:${cleanPath}`;

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

module.exports = {
  createSpaSeoMiddleware,
  injectSeo,
  MemoryCache,
  compileRoute,
  matchRoute,
  escapeHtml,
  stripHtml,
  buildBreadcrumbsSchema,
};

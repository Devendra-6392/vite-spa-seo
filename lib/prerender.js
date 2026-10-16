// lib/prerender.js
// Build-time Prerendering engine for Vite SPAs (React, Vue, Svelte)
// Captures 100% actual client-side rendered body DOM & head tags into static HTML

const fs = require('fs');
const path = require('path');
const http = require('http');

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

const DEFAULT_BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--disable-accelerated-2d-canvas',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
];

/**
 * Start a lightweight zero-dependency HTTP server to serve the built SPA dist folder
 */
function createStaticSpaServer(distDir, port = 4321) {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(`[vite-spa-seo] dist/index.html not found at: ${indexHtmlPath}. Run "vite build" first!`);
  }

  const server = http.createServer((req, res) => {
    const rawPath = (req.url || '/').split('?')[0];
    const filePath = path.join(distDir, rawPath.replace(/^\/+/, ''));

    // Check if real file exists (e.g. assets, favicon)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA Fallback: serve index.html for all routes
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(indexHtmlPath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

/**
 * Prerenders a list of routes using Puppeteer
 *
 * @param {Object} options
 * @param {string} [options.distDir='./dist'] - Path to Vite dist folder
 * @param {string[]} [options.routes=['/']] - Routes to prerender (e.g. ['/', '/about-us', '/product/sku-1'])
 * @param {string} [options.readySelector='#root > *, #app > *'] - CSS selector waiting for React mount
 * @param {string} [options.outDir] - Output directory (defaults to distDir)
 * @param {number} [options.port=4321] - Temporary server port
 * @param {number} [options.concurrency=2] - Parallel browser tabs
 * @param {number} [options.timeout=25000] - Navigation timeout in ms
 * @param {number} [options.settleTime=500] - Additional ms to wait for animations/API calls
 * @param {boolean} [options.saveAsNested=true] - If true, saves /about-us as /about-us/index.html
 */
async function prerender(options = {}) {
  const {
    distDir: customDistDir,
    routes: rawRoutes = ['/'],
    readySelector = '#root > *, #app > *, [data-reactroot], main > *, body > div > *',
    outDir: rawOutDir,
    port = 4321,
    concurrency = 2,
    timeout = 25000,
    settleTime = 500,
    saveAsNested = true,
  } = options;

  let resolvedDistDir = customDistDir ? path.resolve(customDistDir) : null;
  if (!resolvedDistDir) {
    const candidates = [
      path.resolve(process.cwd(), 'dist'),
      path.resolve(process.cwd(), 'build'),
      path.resolve(process.cwd(), '../dist'),
      path.resolve(process.cwd(), 'frontend/dist'),
      path.resolve(process.cwd(), 'client/dist'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'index.html'))) {
        resolvedDistDir = c;
        break;
      }
    }
    if (!resolvedDistDir) {
      resolvedDistDir = path.resolve(process.cwd(), 'dist');
    }
  }

  const outDir = rawOutDir ? path.resolve(rawOutDir) : resolvedDistDir;

  // Resolve routes if passed as an async function
  const routes = typeof rawRoutes === 'function' ? await rawRoutes() : rawRoutes;

  if (!Array.isArray(routes) || routes.length === 0) {
    console.warn('[vite-spa-seo] No routes provided to prerender.');
    return { success: true, count: 0, manifest: {} };
  }

  // Check if puppeteer is installed
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error(
      '[vite-spa-seo] Puppeteer is required for build-time prerendering.\n' +
      'Please install it in your project:\n\n' +
      '  npm install -D puppeteer\n'
    );
  }

  const t0 = Date.now();
  console.log('═══════════════════════════════════════════════════════');
  console.log(' [vite-spa-seo] Build-Time Prerender Started');
  console.log(` Target Dist:    ${resolvedDistDir}`);
  console.log(` Output Dir:     ${outDir}`);
  console.log(` Routes Count:   ${routes.length}`);
  console.log(` Concurrency:    ${concurrency}`);
  console.log('═══════════════════════════════════════════════════════');

  // Start internal static server
  const server = await createStaticSpaServer(resolvedDistDir, port);
  let browser;

  const manifest = {
    generatedAt: new Date().toISOString(),
    routes: {},
  };

  let successCount = 0;
  let failedCount = 0;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: DEFAULT_BROWSER_ARGS,
    });

    const renderRoute = async (route) => {
      const page = await browser.newPage();
      try {
        await page.setExtraHTTPHeaders({
          'x-prerender': 'vite-spa-seo',
          'user-agent': 'Vite-SPA-SEO-Prerender/1.0',
        });

        // Abort non-essential heavy resources (images, fonts, media)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const type = req.resourceType();
          if (['image', 'media', 'font'].includes(type)) {
            req.abort();
          } else {
            req.continue();
          }
        });

        const targetUrl = `http://127.0.0.1:${port}${route.startsWith('/') ? route : `/${route}`}`;
        await page.goto(targetUrl, {
          waitUntil: ['load', 'networkidle2'],
          timeout,
        });

        // Wait for root content (React / Vue render)
        if (readySelector) {
          await page.waitForSelector(readySelector, { timeout: Math.min(timeout, 10000) }).catch(() => {});
        }

        if (settleTime > 0) {
          await new Promise((r) => setTimeout(r, settleTime));
        }

        const html = await page.content();

        // Determine destination file path
        const cleanRoute = route.replace(/^\/+/, '').replace(/\/+$/, '');
        let targetFilePath;
        let relativeUrl;

        if (!cleanRoute) {
          targetFilePath = path.join(outDir, 'index.html');
          relativeUrl = '/';
        } else if (saveAsNested) {
          targetFilePath = path.join(outDir, cleanRoute, 'index.html');
          relativeUrl = `/${cleanRoute}`;
        } else {
          targetFilePath = path.join(outDir, `${cleanRoute.replace(/\//g, '_')}.html`);
          relativeUrl = `/${cleanRoute}`;
        }

        // Ensure target directory exists
        const dirOfFile = path.dirname(targetFilePath);
        if (!fs.existsSync(dirOfFile)) {
          fs.mkdirSync(dirOfFile, { recursive: true });
        }

        fs.writeFileSync(targetFilePath, html, 'utf8');

        manifest.routes[relativeUrl] = {
          file: path.relative(outDir, targetFilePath).replace(/\\/g, '/'),
          size: html.length,
          timestamp: Date.now(),
        };

        const sizeKb = (html.length / 1024).toFixed(1);
        console.log(`  ✓ Prerendered ${route} → ${manifest.routes[relativeUrl].file} (${sizeKb} KB)`);
        successCount++;
      } catch (err) {
        console.error(`  ✗ Failed ${route}: ${err.message}`);
        failedCount++;
      } finally {
        await page.close().catch(() => {});
      }
    };

    // Run in concurrency batches
    for (let i = 0; i < routes.length; i += concurrency) {
      const batch = routes.slice(i, i + concurrency);
      await Promise.all(batch.map((route) => renderRoute(route)));
    }

    // Save prerender manifest
    fs.writeFileSync(
      path.join(outDir, 'prerender-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    const duration = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('───────────────────────────────────────────────────────');
    console.log(` Done in ${duration}s! Success: ${successCount}/${routes.length}`);
    if (failedCount > 0) {
      console.warn(` Warning: ${failedCount} routes failed (will fallback at runtime).`);
    }
    console.log('───────────────────────────────────────────────────────');

    return {
      success: true,
      count: successCount,
      failed: failedCount,
      manifest,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve)).catch(() => {});
    }
  }
}

module.exports = {
  prerender,
  createStaticSpaServer,
};

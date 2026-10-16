// test/test.js
// Automated Test Suite for vite-spa-seo

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  injectSeo,
  compileRoute,
  matchRoute,
  MemoryCache,
  escapeHtml,
  stripHtml,
} = require('../lib');

console.log('🧪 Starting vite-spa-seo Test Suite...\n');

// 1. Test HTML Escaping & Stripping
{
  console.log('Test 1: Utilities (escapeHtml & stripHtml)');
  assert.strictEqual(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.strictEqual(stripHtml('<h1>Hello <b>World</b></h1>'), 'Hello World');
  console.log('  ✅ Passed');
}

// 2. Test Route Matching
{
  console.log('Test 2: Route Matcher');
  const compiled = compileRoute('/product/:sku');
  const match1 = matchRoute(compiled, '/product/BR0007');
  assert.deepStrictEqual(match1, { sku: 'BR0007' });

  const match2 = matchRoute(compiled, '/products');
  assert.strictEqual(match2, null);

  const compiledMulti = compileRoute('/category/:cat/:subcat');
  const matchMulti = matchRoute(compiledMulti, '/category/drinkware/bottles');
  assert.deepStrictEqual(matchMulti, { cat: 'drinkware', subcat: 'bottles' });
  console.log('  ✅ Passed');
}

// 3. Test Memory Cache
{
  console.log('Test 3: Memory Cache');
  const cache = new MemoryCache(100); // 100ms TTL
  cache.set('foo', 'bar');
  assert.strictEqual(cache.get('foo'), 'bar');
  cache.delete('foo');
  assert.strictEqual(cache.get('foo'), null);
  console.log('  ✅ Passed');
}

// 4. Test SEO Injection
{
  console.log('Test 4: SEO String Injection');
  const baseHtml = `<!doctype html><html><head><title>Old Title</title><meta name="description" content="Old desc" /></head><body><div id="root"></div></body></html>`;
  
  const seoData = {
    title: 'New Product Title',
    description: 'Fresh product description',
    canonical: 'https://example.com/product/123',
    image: 'https://example.com/p.jpg',
    schema: {
      '@type': 'Product',
      name: 'New Product Title',
      offers: { price: '100', priceCurrency: 'INR' }
    },
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Products', url: '/products' }
    ],
    bodyContent: '<h1>New Product Title</h1><p>Price: ₹100</p>'
  };

  const output = injectSeo(baseHtml, seoData, { siteUrl: 'https://example.com' });

  assert.ok(output.includes('<title>New Product Title</title>'), 'Missing updated title');
  assert.ok(!output.includes('<title>Old Title</title>'), 'Old title not removed');
  assert.ok(output.includes('<meta name="description" content="Fresh product description">'), 'Missing updated meta description');
  assert.ok(!output.includes('content="Old desc"'), 'Old meta description not removed');
  assert.ok(output.includes('<link rel="canonical" href="https://example.com/product/123">'), 'Missing canonical');
  assert.ok(output.includes('<meta property="og:image" content="https://example.com/p.jpg">'), 'Missing og:image');
  assert.ok(output.includes('"@type":"Product"'), 'Missing Product schema');
  assert.ok(output.includes('"@type":"BreadcrumbList"'), 'Missing BreadcrumbList schema');
  assert.ok(output.includes('<div id="root"><h1>New Product Title</h1><p>Price: ₹100</p></div>'), 'Missing body crawler content');
  console.log('  ✅ Passed');
}

// 5. Test Auto-Generated Semantic Body (when bodyContent is omitted) & Multiline Root
{
  console.log('Test 5: Auto-generated Crawler Content & Multiline <div id="root">');
  const baseHtmlWithNewlines = `<!doctype html><html><head><title>Old</title></head><body>\n  <div id="root" class="app-container">\n  </div>\n</body></html>`;

  const seoDataWithoutBody = {
    title: 'Auto Product',
    description: 'Auto description text',
    image: 'https://example.com/item.png',
    schema: {
      '@type': 'Product',
      offers: { price: '499', priceCurrency: 'INR' }
    },
    breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Shop', url: '/shop' }]
  };

  const output = injectSeo(baseHtmlWithNewlines, seoDataWithoutBody);

  assert.ok(output.includes('<div id="root" class="app-container">'), 'Failed to match multiline root container with attributes');
  assert.ok(output.includes('<h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 12px 0;">Auto Product</h1>'), 'Failed to auto-generate <h1>');
  assert.ok(output.includes('Price: INR 499'), 'Failed to auto-generate price from schema');
  assert.ok(output.includes('Auto description text'), 'Failed to auto-generate description');
  console.log('  ✅ Passed');
}

// 6. Test Prerendered Static HTML Auto-Detection in Middleware
{
  console.log('Test 6: Prerendered HTML Auto-Detection in Middleware');
  const tempDist = path.join(__dirname, 'temp_dist');
  const nestedAboutDir = path.join(tempDist, 'about-us');
  fs.mkdirSync(nestedAboutDir, { recursive: true });

  fs.writeFileSync(path.join(tempDist, 'index.html'), '<html><head></head><body><div id="root">SPA Fallback</div></body></html>');
  fs.writeFileSync(path.join(nestedAboutDir, 'index.html'), '<html><head><title>Actual Prerendered About Page</title></head><body><div id="root"><h1>Actual React DOM About Page</h1></div></body></html>');

  const { createSpaSeoMiddleware } = require('../lib/index');
  const middleware = createSpaSeoMiddleware({
    distDir: tempDist,
  });

  const mockReq = { method: 'GET', url: '/about-us', path: '/about-us' };
  let headerKey = '';
  let headerVal = '';
  let outputHtml = '';

  const mockRes = {
    setHeader: (k, v) => {
      if (k === 'X-Vite-SPA-SEO') {
        headerVal = v;
      }
    },
    end: (content) => {
      outputHtml = content;
    }
  };

  middleware(mockReq, mockRes, () => {});

  assert.strictEqual(headerVal, 'prerendered', 'Expected X-Vite-SPA-SEO header to be "prerendered"');
  assert.ok(outputHtml.includes('Actual React DOM About Page'), 'Expected prerendered file body to be served');

  // Clean up temp dir
  fs.rmSync(tempDist, { recursive: true, force: true });
  console.log('  ✅ Passed');
}

// 7. Test Zero-Config DistDir Auto-Detection
{
  console.log('Test 7: Zero-Config DistDir Auto-Detection');
  const { createSpaSeoMiddleware } = require('../lib/index');
  // Should NOT throw an error when distDir is completely omitted
  assert.doesNotThrow(() => {
    createSpaSeoMiddleware();
  }, 'Middleware should not crash when distDir is omitted');
  console.log('  ✅ Passed');
}

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The package is rock solid.');



const assert = require('assert');
const {
  injectSeo,
  compileRoute,
  matchRoute,
  MemoryCache,
  escapeHtml,
  stripHtml,
} = require('../lib');

console.log(' Starting vite-spa-seo Test Suite...\n');

{
  console.log('Test 1: Utilities (escapeHtml & stripHtml)');
  assert.strictEqual(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.strictEqual(stripHtml('<h1>Hello <b>World</b></h1>'), 'Hello World');
  console.log('   Passed');
}

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
  console.log('   Passed');
}

// 3. Test Memory Cache
{
  console.log('Test 3: Memory Cache');
  const cache = new MemoryCache(100); // 100ms TTL
  cache.set('foo', 'bar');
  assert.strictEqual(cache.get('foo'), 'bar');
  cache.delete('foo');
  assert.strictEqual(cache.get('foo'), null);
  console.log('   Passed');
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
  console.log('   Passed');
}

console.log('\n ALL TESTS PASSED SUCCESSFULLY! The package is rock solid.');

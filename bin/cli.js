#!/usr/bin/env node
// bin/cli.js
// Command-line interface for vite-spa-seo

const path = require('path');
const fs = require('fs');
const { prerender } = require('../lib/prerender');

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h' || command === 'help') {
  console.log(`
vite-spa-seo CLI - Build-time Prerendering & SEO for Vite SPAs

Usage:
  npx vite-spa-seo prerender [options]

Options:
  --config <path>       Path to config file (default: vite-spa-seo.config.js)
  --dist <path>         Path to built Vite dist directory (default: ./dist)
  --routes <r1,r2,...>  Comma-separated routes to prerender
  --port <port>         Temporary server port (default: 4321)
  --concurrency <num>   Number of concurrent browser pages (default: 2)

Example:
  npx vite-spa-seo prerender --routes /,/about-us,/contact,/product/sample-1
  npx vite-spa-seo prerender --config ./prerender.config.js
`);
  process.exit(0);
}

if (command === 'prerender') {
  runPrerender().catch((err) => {
    console.error('\n[vite-spa-seo] Prerender Fatal Error:', err.message);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: "${command}". Run "npx vite-spa-seo --help" for available commands.`);
  process.exit(1);
}

async function runPrerender() {
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const configPath = getArg('--config') || 'vite-spa-seo.config.js';
  const fullConfigPath = path.resolve(process.cwd(), configPath);

  let fileConfig = {};
  if (fs.existsSync(fullConfigPath)) {
    console.log(`[vite-spa-seo] Loaded configuration from: ${fullConfigPath}`);
    fileConfig = require(fullConfigPath);
  }

  const cliDist = getArg('--dist');
  const cliRoutes = getArg('--routes');
  const cliPort = getArg('--port');
  const cliConcurrency = getArg('--concurrency');

  const options = {
    distDir: cliDist || fileConfig.distDir || './dist',
    routes: cliRoutes ? cliRoutes.split(',').map((r) => r.trim()) : fileConfig.routes || ['/'],
    outDir: fileConfig.outDir,
    readySelector: fileConfig.readySelector || '#root > *, #app > *',
    port: cliPort ? parseInt(cliPort, 10) : fileConfig.port || 4321,
    concurrency: cliConcurrency ? parseInt(cliConcurrency, 10) : fileConfig.concurrency || 2,
    timeout: fileConfig.timeout || 25000,
    settleTime: fileConfig.settleTime !== undefined ? fileConfig.settleTime : 500,
    saveAsNested: fileConfig.saveAsNested !== undefined ? fileConfig.saveAsNested : true,
  };

  await prerender(options);
}

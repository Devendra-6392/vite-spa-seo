// example/server.js
// Example showing how to use vite-spa-seo with Express

const express = require('express');
const path = require('path');
const { createSpaSeoMiddleware } = require('../lib');

const app = express();
const PORT = 3000;

// Example mock database
const mockProducts = {
  'phone-12': {
    name: 'Super Smartphone 12',
    price: 699,
    currency: 'USD',
    description: 'High performance smartphone with 5G and OLED display.',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600',
  },
  'laptop-pro': {
    name: 'Pro Ultrabook 16',
    price: 1299,
    currency: 'USD',
    description: 'Lightweight aluminium laptop with all-day battery life.',
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600',
  },
};

// 1. Mount the vite-spa-seo middleware
app.use(
  createSpaSeoMiddleware({
    // Path to your Vite built dist directory
    distDir: path.resolve(__dirname, './dist'),
    siteUrl: 'https://example.com',
    siteName: 'Gadget Store',

    // Static pages
    staticPages: {
      '/': {
        title: 'Gadget Store - Modern Tech & Accessories',
        description: 'Explore the latest smartphones, ultrabooks, and tech accessories with fast free shipping.',
      },
      '/about': {
        title: 'About Us | Gadget Store',
        description: 'Learn about Gadget Store and our mission to make high-end tech accessible.',
      },
    },

    // Dynamic routes
    routes: [
      {
        path: '/product/:id',
        handler: async ({ params }) => {
          const product = mockProducts[params.id];
          if (!product) return null; // Falls back to standard SPA (React will show 404)

          return {
            title: `${product.name} | Gadget Store`,
            description: product.description,
            canonical: `/product/${params.id}`,
            image: product.image,
            openGraph: {
              type: 'product',
              'product:price:amount': product.price,
              'product:price:currency': product.currency,
            },
            schema: {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: product.name,
              image: [product.image],
              description: product.description,
              offers: {
                '@type': 'Offer',
                price: product.price,
                priceCurrency: product.currency,
                availability: 'https://schema.org/InStock',
              },
            },
            breadcrumbs: [
              { name: 'Home', url: '/' },
              { name: 'Products', url: '/products' },
              { name: product.name, url: `/product/${params.id}` },
            ],
            // Semantic crawler content injected into <div id="root">
            bodyContent: `
              <article>
                <h1>${product.name}</h1>
                <p>Price: $${product.price}</p>
                <img src="${product.image}" alt="${product.name}" />
                <p>${product.description}</p>
              </article>
            `,
          };
        },
      },
    ],
  })
);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 vite-spa-seo example server running at http://localhost:${PORT}`);
  });
}

module.exports = app;

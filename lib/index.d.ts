// lib/index.d.ts
import { Request, Router } from 'express';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface SeoData {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  openGraph?: Record<string, string | number | boolean | null | undefined>;
  schema?: Record<string, any> | Array<Record<string, any>>;
  breadcrumbs?: BreadcrumbItem[];
  bodyContent?: string;
}

export interface RouteContext {
  params: Record<string, string>;
  req: Request;
  path: string;
  query: Record<string, any>;
}

export interface DynamicRoute {
  path: string;
  handler: (context: RouteContext) => Promise<SeoData | null | undefined> | SeoData | null | undefined;
  cacheTTL?: number;
}

export interface StaticPagesMap {
  [path: string]:
    | SeoData
    | ((context: { req: Request; path: string }) => Promise<SeoData | null | undefined> | SeoData | null | undefined);
}

export interface ViteSpaSeoOptions {
  distDir?: string;
  indexHtmlPath?: string;
  siteUrl?: string;
  siteName?: string;
  rootSelector?: string;
  cacheTTL?: number;
  routes?: DynamicRoute[];
  staticPages?: StaticPagesMap;
  ignorePaths?: Array<string | RegExp>;
  serveAssets?: boolean;
  assetsMaxAge?: string;
}

export interface SpaSeoRouter extends Router {
  purgeCache: (route?: string) => boolean;
}

export function createSpaSeoMiddleware(options: ViteSpaSeoOptions): SpaSeoRouter;

export function injectSeo(
  rawHtml: string,
  seoData: SeoData,
  options?: {
    siteUrl?: string;
    siteName?: string;
    rootSelector?: string;
  }
): string;

export class MemoryCache<T = any> {
  constructor(defaultTtlMs?: number);
  get(key: string): T | null;
  set(key: string, value: T, customTtlMs?: number): void;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}

export function compileRoute(pattern: string): { regex: RegExp; paramNames: string[] };
export function matchRoute(compiled: { regex: RegExp; paramNames: string[] }, pathname: string): Record<string, string> | null;
export function escapeHtml(str: string): string;
export function stripHtml(html: string): string;
export function buildBreadcrumbsSchema(breadcrumbs: BreadcrumbItem[], siteUrl?: string): Record<string, any> | null;

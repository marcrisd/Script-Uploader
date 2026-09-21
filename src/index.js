import { onRequest as apiHandler } from '../functions/api.js';
import { onRequest as publicHandler } from '../functions/public.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API routes: /api/*
    if (url.pathname.startsWith('/api/')) {
      return apiHandler({
        request,
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
      });
    }

    // Public script endpoint: /s/:slug
    if (url.pathname.startsWith('/s/')) {
      return publicHandler({
        request,
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
      });
    }

    // Everything else: serve static assets from /public
    return env.ASSETS.fetch(request);
  },
};
import { defineConfig } from 'vite';

// GitHub Pages serves a project site (not a custom domain) from a subpath -
// https://<user>.github.io/retro-grand-prix/ - so asset URLs need that
// prefix baked in at build time, rather than assuming they're at the
// domain root like the local dev server does.
export default defineConfig({
  base: '/retro-grand-prix/',
});

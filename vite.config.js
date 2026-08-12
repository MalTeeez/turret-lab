import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

/**
 * GitHub Pages serves a project site from /<repo>/, so assets cannot be rooted at /.
 * The deploy workflow passes `actions/configure-pages`' base_path in as BASE_PATH;
 * it is "/<repo>" for a project site and empty for a user/org site. Vite wants a
 * leading and trailing slash.
 */
const basePath = process.env.BASE_PATH ?? '';
const base = basePath === '' || basePath === '/' ? '/' : `/${basePath.replace(/^\/|\/$/g, '')}/`;

export default defineConfig({
  base,
  plugins: [svelte(), tailwindcss()],
  server: { port: 5173, open: true },
  build: { target: 'es2022' },
});

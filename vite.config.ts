import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    // Pin the port so the OAuth redirect URI stays consistent across
    // dev sessions. `strictPort: true` makes Vite fail loudly instead
    // of silently falling back to the next free port (5174, 5175, …)
    // which would then mismatch the redirect URI registered with
    // Google.
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});

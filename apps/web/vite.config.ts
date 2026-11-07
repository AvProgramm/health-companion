/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Files copied as-is from public/, which Vite does not list in the bundle
const PUBLIC_FILES = ['/manifest.webmanifest', '/icon.svg'];

// The service worker source, with placeholders the build fills in
const SERVICE_WORKER_TEMPLATE = fileURLToPath(new URL('./src/sw/service-worker.js', import.meta.url));

/**
 * Return a Vite plugin that writes sw.js with the exact list of files in this build.
 *
 * The service worker can only open the app offline if it has cached every file,
 * and the hashed asset names change on every build, so the list is filled in here
 * instead of being typed by hand.
 */
function precacheServiceWorker(): Plugin {
  return {
    name: 'health-companion-precache',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const template = readFileSync(SERVICE_WORKER_TEMPLATE, 'utf8');
      const hash = createHash('sha256').update(template);

      // Collect every emitted file, the page itself and the files from public/,
      // hashing each file's content as well as its name
      const urls = new Set(['/index.html', ...PUBLIC_FILES]);
      for (const [fileName, output] of Object.entries(bundle)) {
        urls.add(`/${fileName}`);
        hash.update(fileName).update(output.type === 'chunk' ? output.code : output.source);
      }
      const sortedUrls = [...urls].sort();

      // Name the cache after that hash, so any changed file gives a fresh cache
      // instead of mixing old and new files
      const buildId = hash.update(sortedUrls.join('\n')).digest('hex').slice(0, 12);

      // Fill the placeholders in the template and emit it as sw.js
      const source = template.replace('__PRECACHE_URLS__', JSON.stringify(sortedUrls)).replace('__BUILD_ID__', buildId);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  // Keep the phone on one fixed origin, since a different port means a different, empty database
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

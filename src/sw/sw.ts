/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { fireDueNotifications } from '../services/notificationRunner';
import { NOTIFICATION_SYNC_TAG } from '../utils/notifications';

/**
 * Finio's service worker.
 *
 * Hand-written because `generateSW` cannot host a `periodicsync` handler, which is the only way
 * a reminder fires while the app is closed. Everything the generated worker used to do for free
 * — precaching, outdated-cache cleanup, the SPA navigation fallback, `skipWaiting`/`clientsClaim`
 * for `registerType: 'autoUpdate'`, and the Google Fonts runtime route — has to be written out
 * here, because `workbox.runtimeCaching` and friends are `generateSW`-only options that are
 * *silently ignored* under `injectManifest`.
 *
 * Hard constraint to remember: a service worker cannot read localStorage, where all of Finio's
 * finance data lives. That is why it only ever reads a precomputed schedule out of IndexedDB —
 * see `services/notificationDb.ts`. Any future trigger must be baked into that schedule by the
 * app, not derived here.
 *
 * Imports are relative, not `@/`: the worker is built by a separate child Vite build whose
 * alias inheritance has varied across plugin versions, and a resolution failure there is a
 * confusing error rather than a clean one.
 */

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// `registerType: 'autoUpdate'` needs both of these literally present in the worker source under
// injectManifest — the plugin only warns if they are missing, and updates then stall behind a
// waiting worker forever.
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// The SPA fallback `generateSW` used to supply via `navigateFallback`. Without it, an offline
// deep-link to /settings or /budgets 404s — a regression that has nothing to do with
// notifications, so it is verified explicitly.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    // Anything with a file extension is an asset, not a route.
    denylist: [/\/[^/?]+\.[^/?]+$/],
  }),
);

// Parity with the `runtimeCaching` entry the generated worker had.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

/**
 * The background half of local reminders.
 *
 * Best-effort by nature: Periodic Background Sync is Chromium-only, needs the PWA installed,
 * and is gated on the browser's own engagement heuristics — `minInterval` is a floor, not a
 * promise. The app's foreground pass is what makes reminders reliable everywhere else.
 */
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== NOTIFICATION_SYNC_TAG) return;
  event.waitUntil(fireDueNotifications(self.registration, Date.now()));
});

// Any activation is also a chance to catch up — one IndexedDB read when there is nothing to do.
self.addEventListener('activate', (event) => {
  event.waitUntil(fireDueNotifications(self.registration, Date.now()).catch(() => 0));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Reuse an open window where there is one — opening a second copy of an installed PWA is
      // disorienting. Navigating it is also what carries the deep link past the app lock: the
      // router location is already correct by the time the unlock gate evaluates.
      for (const client of clientList) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }

      await self.clients.openWindow(target);
    })(),
  );
});

/**
 * Register the offline shell, and switch to a new build as soon as it is ready.
 *
 * A page opened from the cache keeps running the old build until it reloads, which
 * is why the phone needed "reload twice" (on 7 Nov it still showed source links that
 * the new build had removed). Checking for an update whenever the app returns to the
 * foreground, and reloading once when a new worker takes over, removes that step.
 */
export function registerServiceWorker(): void {
  // Remember whether an older build was already in control when this page loaded;
  // the very first install has nothing to replace, so it must not reload
  const hadController = navigator.serviceWorker.controller !== null;
  let reloaded = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Ignore the first install, and never reload more than once per page
    if (!hadController || reloaded) {
      return;
    }
    reloaded = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('/sw.js').then(
    (registration) => {
      // Look for a newer build each time the app comes back to the foreground;
      // offline this simply fails, and the cached build keeps working
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => undefined);
        }
      });
    },
    (error: unknown) => console.error('Service worker registration failed', error),
  );
}

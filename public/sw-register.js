// Register the service worker so the app installs cleanly as a PWA and
// the static shell loads even without a network connection.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}

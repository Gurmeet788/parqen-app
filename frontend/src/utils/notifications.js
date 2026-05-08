// OneSignal Web Push helpers for PRAQEN

// ── Internal: wait for OneSignal to finish initialising ──────────────────────
// The SDK loads with `defer` — it's always async. This function waits up to
// `timeout` ms for init to complete, then resolves with the SDK instance or null.
function waitForOS(timeout = 8000) {
  return new Promise((resolve) => {
    // Already ready (e.g. user revisits a page after first load)
    if (window.OneSignal) return resolve(window.OneSignal);

    let timer;
    const onReady = () => {
      clearTimeout(timer);
      resolve(window.OneSignal || null);
    };
    window.addEventListener('onesignal:ready', onReady, { once: true });
    timer = setTimeout(() => {
      window.removeEventListener('onesignal:ready', onReady);
      console.warn('[Push] OneSignal did not initialise within', timeout, 'ms');
      resolve(null);
    }, timeout);
  });
}

// ── Public helpers ────────────────────────────────────────────────────────────

// Check if push is supported in this browser (must be HTTPS + SW support)
export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator;
}

// Check the current browser permission without triggering a prompt
// Returns: 'granted' | 'denied' | 'default' | 'unsupported'
export async function getNotificationPermission() {
  if (!isPushSupported()) return 'unsupported';
  try {
    const OS = await waitForOS(3000); // short wait — just checking state
    if (!OS) return window.Notification?.permission || 'default';
    const granted = await OS.Notifications.permission;
    return granted ? 'granted'
      : window.Notification?.permission === 'denied' ? 'denied'
      : 'default';
  } catch {
    return window.Notification?.permission || 'default';
  }
}

// Show the browser permission prompt and subscribe the user
// Returns true if the user granted permission
export async function requestNotificationPermission() {
  if (!isPushSupported()) return false;
  try {
    const OS = await waitForOS();
    if (!OS) {
      console.warn('[Push] OneSignal not available — cannot request permission');
      return false;
    }

    const alreadyGranted = await OS.Notifications.permission;
    if (alreadyGranted) return true;

    await OS.Notifications.requestPermission();
    const nowGranted = await OS.Notifications.permission;
    return !!nowGranted;
  } catch (e) {
    console.error('[Push] requestNotificationPermission failed:', e);
    return false;
  }
}

// Link the logged-in user's ID to their push subscription so the backend
// can send pushes to a specific user via include_aliases: { external_id }
export async function identifyUser(userId) {
  if (!userId) return;
  try {
    const OS = await waitForOS(5000);
    if (!OS) return;
    await OS.login(String(userId));
    console.log('[Push] identifyUser:', userId);
  } catch (e) {
    console.error('[Push] identifyUser failed:', e);
  }
}

// Unlink the push subscription from the account on logout
export async function unidentifyUser() {
  try {
    const OS = await waitForOS(3000);
    if (!OS) return;
    await OS.logout();
    console.log('[Push] unidentifyUser done');
  } catch (e) {
    console.error('[Push] unidentifyUser failed:', e);
  }
}

// OneSignal Web Push helpers for PRAQEN

// ── Internal: wait for OneSignal to finish initialising ──────────────────────
function waitForOS(timeout = 8000) {
  return new Promise((resolve) => {
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

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator;
}

export async function getNotificationPermission() {
  if (!isPushSupported()) return 'unsupported';
  try {
    const OS = await waitForOS(3000);
    if (!OS) return window.Notification?.permission || 'default';
    const granted = await OS.Notifications.permission;
    return granted ? 'granted'
      : window.Notification?.permission === 'denied' ? 'denied'
      : 'default';
  } catch {
    return window.Notification?.permission || 'default';
  }
}

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
    return !!(await OS.Notifications.permission);
  } catch (e) {
    console.error('[Push] requestNotificationPermission failed:', e);
    return false;
  }
}

// Link the logged-in user's ID to their push subscription.
// OneSignal v16 uses OneSignal.login(externalId) to set external_id server-side.
// This must be called on every page load (login + session restore) so the
// backend can target users by external_id.
// Link the logged-in user's ID to their push subscription.
export async function identifyUser(userId) {
  if (!userId) return;

  try {
    const OS = await waitForOS(6000);

    if (!OS) {
      console.warn("[Push] OneSignal not ready.");
      return;
    }

    // Don't try to login on localhost
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      console.log("[Push] Skipping OneSignal login on localhost.");
      return;
    }

    // Ensure push subscription exists
    const subscribed = await OS.User.PushSubscription.optedIn;

    if (!subscribed) {
      console.warn("[Push] User is not subscribed to push notifications.");
      return;
    }

    await OS.login(String(userId));

    console.log("[Push] Linked external_id:", userId);
  } catch (err) {
    console.error("[Push] identifyUser failed:", err);
  }
}

// Read the external_id currently linked to this browser's subscription.
// Useful for debugging: open browser console and call window.__checkPushId()
export async function checkExternalId() {
  try {
    const OS = await waitForOS(3000);
    if (!OS) {
      console.warn('[Push] checkExternalId: OneSignal not ready');
      return null;
    }
    // v16 exposes the linked external_id on the User object
    const externalId = OS.User?.externalId ?? null;
    const playerId   = OS.User?.onesignalId ?? null;
    console.log('[Push] checkExternalId — externalId:', externalId, '| playerId:', playerId);
    return { externalId, playerId };
  } catch (e) {
    console.error('[Push] checkExternalId failed:', e);
    return null;
  }
}

// Expose checkExternalId on window for quick browser-console debugging
if (typeof window !== 'undefined') {
  window.__checkPushId = checkExternalId;
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

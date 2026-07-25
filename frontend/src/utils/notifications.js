// frontend/src/utils/notifications.js

// ── Internal: wait for OneSignal to finish initialising ──────────────────────
function waitForOS(timeout = 8000) {
  return new Promise((resolve) => {
    if (window.OneSignal && typeof window.OneSignal === 'object') {
      return resolve(window.OneSignal);
    }

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

    // ✅ FIXED: Check permission correctly
    if (OS.Notifications) {
      const granted = await OS.Notifications.permission;
      return granted ? 'granted' : 'default';
    }
    return window.Notification?.permission || 'default';
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

    // ✅ FIXED: Check if already granted
    if (OS.Notifications) {
      const alreadyGranted = await OS.Notifications.permission;
      if (alreadyGranted) return true;
      await OS.Notifications.requestPermission();
      const newPerm = await OS.Notifications.permission;
      return !!newPerm;
    }

    // Fallback to native
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (e) {
    console.error('[Push] requestNotificationPermission failed:', e);
    return false;
  }
}

// ✅ FIXED: Link the logged-in user's ID to their push subscription.
export async function identifyUser(userId) {
  if (!userId) {
    console.warn('[Push] identifyUser: No userId provided');
    return;
  }

  try {
    // ✅ Check if OneSignal is available
    let OS = window.OneSignal;
    if (!OS) {
      console.warn('[Push] identifyUser: OneSignal not loaded, waiting...');
      OS = await waitForOS(5000);
    }

    if (!OS) {
      console.warn('[Push] identifyUser: OneSignal still not available');
      return;
    }

    console.log('[Push] identifyUser: OneSignal available, linking user:', userId);

    // ✅ Try different methods for different OneSignal versions
    try {
      // Method 1: login() - v16+
      if (typeof OS.login === 'function') {
        await OS.login(String(userId));
        console.log('[Push] ✅ identifyUser via login() success:', userId);
        return;
      }

      // Method 2: setExternalUserId() - older versions
      if (typeof OS.setExternalUserId === 'function') {
        await OS.setExternalUserId(String(userId));
        console.log('[Push] ✅ identifyUser via setExternalUserId() success:', userId);
        return;
      }

      // Method 3: User.externalId - direct set
      if (OS.User) {
        OS.User.externalId = String(userId);
        console.log('[Push] ✅ identifyUser via User.externalId success:', userId);
        return;
      }

      console.warn('[Push] identifyUser: No login method available on OneSignal object');
    } catch (methodError) {
      console.warn('[Push] identifyUser: Method failed, trying alternative:', methodError.message);

      // ✅ Last resort: Use OneSignal.push()
      if (OS.push) {
        OS.push(function() {
          OS.setExternalUserId(String(userId));
        });
        console.log('[Push] ✅ identifyUser via push() queued:', userId);
        return;
      }
    }
  } catch (e) {
    console.error('[Push] identifyUser failed for', userId, ':', e?.message || e);
  }
}

// Read the external_id currently linked to this browser's subscription.
export async function checkExternalId() {
  try {
    const OS = await waitForOS(3000);
    if (!OS) {
      console.warn('[Push] checkExternalId: OneSignal not ready');
      return null;
    }

    const externalId = OS.User?.externalId ?? null;
    const playerId = OS.User?.onesignalId ?? null;
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

    // Try different logout methods
    if (typeof OS.logout === 'function') {
      await OS.logout();
      console.log('[Push] ✅ unidentifyUser via logout() done');
      return;
    }

    if (OS.User && typeof OS.User.logout === 'function') {
      await OS.User.logout();
      console.log('[Push] ✅ unidentifyUser via User.logout() done');
      return;
    }

    console.log('[Push] unidentifyUser: No logout method available');
  } catch (e) {
    console.error('[Push] unidentifyUser failed:', e);
  }
}
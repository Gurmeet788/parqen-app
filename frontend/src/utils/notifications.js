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

// ── Get OneSignal external ID ─────────────────────────────────────────────────
export function getOneSignalExternalId() {
  try {
    if (window.OneSignal?.User?.externalId) {
      return window.OneSignal.User.externalId;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Get OneSignal User ID ─────────────────────────────────────────────────────
export function getOneSignalUserId() {
  try {
    if (window.OneSignal?.User?.onesignalId) {
      return window.OneSignal.User.onesignalId;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Identify user for push notifications ─────────────────────────────────────
let currentUserId = null;

export function identifyUser(userId) {
  if (!userId) {
    console.warn('[Push] No userId provided');
    return Promise.resolve();
  }

  console.log('[Push] Setting user ID:', userId);
  currentUserId = userId;
  localStorage.setItem('praqen_push_user_id', userId);

  if (window.OneSignal && typeof window.OneSignal.login === 'function') {
    try {
      window.OneSignal.login(String(userId));
      console.log('[Push] ✅ OneSignal login() called for user:', userId);
    } catch (err) {
      console.warn('[Push] OneSignal login() failed:', err.message);
    }
  }

  return Promise.resolve();
}

// ── Get current user ID ──────────────────────────────────────────────────────
export function getCurrentUserId() {
  return currentUserId || localStorage.getItem('praqen_push_user_id');
}

// ── Unlink user ───────────────────────────────────────────────────────────────
export function unidentifyUser() {
  currentUserId = null;
  localStorage.removeItem('praqen_push_user_id');
  console.log('[Push] ✅ User unlinked');

  try {
    if (window.OneSignal && typeof window.OneSignal.logout === 'function') {
      window.OneSignal.logout();
      console.log('[Push] ✅ OneSignal logout() done');
    }
  } catch (e) {
    console.warn('[Push] OneSignal logout failed:', e.message);
  }

  return Promise.resolve();
}

// ── Send test notification ────────────────────────────────────────────────────
export function sendTestNotification() {
  try {
    if (Notification.permission === 'granted') {
      const notif = new Notification('🔔 PRAQEN Test Notification', {
        body: 'Your push notifications are working! 🎉',
        icon: '/logo192.png',
        tag: 'test',
        requireInteraction: true,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      console.log('[Push] ✅ Test notification sent');
      return true;
    } else {
      console.warn('[Push] Notification permission not granted');
      return false;
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
    console.error('[Push] Test notification failed:', e);
    return false;
  }
}

// ── Send custom notification ──────────────────────────────────────────────────
export function sendCustomNotification(title, body) {
  try {
    if (Notification.permission === 'granted') {
      const notif = new Notification(title, {
        body: body,
        icon: '/logo192.png',
        tag: 'custom',
        requireInteraction: true,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      console.log('[Push] ✅ Custom notification sent:', title);
      return true;
    } else {
      console.warn('[Push] Notification permission not granted');
      return false;
    }
  } catch (e) {
    console.error('[Push] Custom notification failed:', e);
    return false;
  }
}

// ── Send trade notification ──────────────────────────────────────────────────
export function sendTradeNotification(title, body, tradeId, tradeRef) {
  try {
    if (Notification.permission === 'granted') {
      const tradeDisplay = tradeRef || tradeId?.slice(0, 8) || 'trade';
      const notif = new Notification(title, {
        body: body,
        icon: '/logo192.png',
        tag: `trade-${tradeId || Date.now()}`,
        requireInteraction: true,
        data: { tradeId, tradeRef },
      });

      notif.onclick = () => {
        window.focus();
        if (tradeId) {
          window.location.href = `/trade/${tradeId}`;
        }
        notif.close();
      };

      console.log('[Push] ✅ Trade notification sent:', title, 'Trade:', tradeDisplay);
      return true;
    } else {
      console.warn('[Push] Notification permission not granted for trade notification');
      return false;
    }
  } catch (e) {
    console.error('[Push] Trade notification failed:', e);
    return false;
  }
}

// ── Send notification to user ─────────────────────────────────────────────────
export function sendNotificationToUser(title, body, userId) {
  try {
    if (Notification.permission !== 'granted') {
      console.warn('[Push] Notification permission not granted');
      return false;
    }

    const currentId = getCurrentUserId();
    if (userId && currentId && userId !== currentId) {
      console.log('[Push] Notification for different user, skipping');
      return false;
    }

    const notif = new Notification(title, {
      body: body,
      icon: '/logo192.png',
      tag: 'user-notification',
      requireInteraction: true,
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    console.log('[Push] ✅ Notification sent to user:', title);
    return true;
  } catch (e) {
    console.error('[Push] sendNotificationToUser failed:', e);
    return false;
  }
}

// ── Force notification ────────────────────────────────────────────────────────
export function forceSendNotification(title, body, clickUrl) {
  try {
    if (Notification.permission === 'granted') {
      const notif = new Notification(title, {
        body: body,
        icon: '/logo192.png',
        tag: 'force-notification',
        requireInteraction: true,
      });

      notif.onclick = () => {
        window.focus();
        if (clickUrl) {
          window.location.href = clickUrl;
        }
        notif.close();
      };

      console.log('[Push] ✅ Force notification sent:', title);
      return true;
    } else {
      console.warn('[Push] Force notification: permission not granted');
      return false;
    }
  } catch (e) {
    console.error('[Push] Force notification failed:', e);
    return false;
  }
}

// ── Check external ID ─────────────────────────────────────────────────────────
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

// ── Initialize notification system ───────────────────────────────────────────
export function initNotifications() {
  console.log('[Push] Initializing notification system...');

  if (Notification.permission === 'granted') {
    console.log('[Push] ✅ Permission already granted');
    return true;
  }

  Notification.requestPermission().then(result => {
    if (result === 'granted') {
      console.log('[Push] ✅ Permission granted');
    } else {
      console.warn('[Push] ⚠️ Permission denied');
    }
  });

  return false;
}

// ── Expose helpers on window for debugging ──────────────────────────────────
if (typeof window !== 'undefined') {
  window.__checkPushId = checkExternalId;
  window.__identifyUser = identifyUser;
  window.__getOneSignalExternalId = getOneSignalExternalId;
  window.__sendTestNotification = sendTestNotification;
  window.__sendCustomNotification = sendCustomNotification;
  window.__sendTradeNotification = sendTradeNotification;
  window.__sendNotificationToUser = sendNotificationToUser;
  window.__forceSendNotification = forceSendNotification;
  window.__unidentifyUser = unidentifyUser;
  window.__getCurrentUserId = getCurrentUserId;
  window.__initNotifications = initNotifications;

  console.log('[Push] ✅ Debug helpers available:');
  console.log('  window.__identifyUser(userId) - Link user');
  console.log('  window.__sendTestNotification() - Send test notification');
  console.log('  window.__sendTradeNotification(title, body, tradeId) - Send trade notification');
  console.log('  window.__sendCustomNotification(title, body) - Send custom notification');
  console.log('  window.__forceSendNotification(title, body, url) - Force notification');
  console.log('  window.__getCurrentUserId() - Get current user ID');
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
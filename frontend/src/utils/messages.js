// Centralized user-facing messages for PRAQEN platform
// All messages are friendly, clear, and professional

export const MSG = {

  // ── Auth ────────────────────────────────────────────────────────────────────
  auth: {
    loginFailed:          'We couldn\'t log you in. Please check your email and password and try again.',
    invalidCredentials:   'Incorrect email or password. Please double-check your details.',
    accountNotFound:      'No account found with those details. Please check or create a new account.',
    emailRequired:        'Please enter your email address.',
    passwordRequired:     'Please enter your password.',
    passwordTooShort:     'Password must be at least 6 characters long.',
    emailInvalid:         'Please enter a valid email address (e.g. name@example.com).',
    phoneInvalid:         (name, min, max) => `Please enter a valid ${name} number (${min}–${max} digits after the country code).`,
    sessionExpired:       'Your session has expired. Please log in again to continue.',
    accountLocked:        'Your account has been temporarily locked. Please contact hello@praqen.com.',
    unauthorized:         'You need to be logged in to do that. Please sign in and try again.',
  },

  // ── Registration ────────────────────────────────────────────────────────────
  register: {
    emailTaken:           'An account with this email already exists. Try logging in or use a different email.',
    usernameTaken:        'That username is already taken. Please choose a different one.',
    missingFields:        'Please fill in all required fields before continuing.',
    success:              '🎉 Welcome to PRAQEN! Your account has been created successfully.',
    failed:               'We couldn\'t create your account right now. Please try again in a moment.',
  },

  // ── OTP / Verification ──────────────────────────────────────────────────────
  otp: {
    sent:                 '✅ A verification code has been sent. Please check your messages.',
    sentEmail:            '✅ A verification code has been sent to your email. Please check your inbox.',
    enterFull:            'Please enter the full 6-digit verification code.',
    invalid:              'That code is incorrect. Please check the code and try again.',
    expired:              'That code has expired. Please request a new one and try again within 5 minutes.',
    noCode:               'No verification code found. Please request a new one.',
    sendFailed:           'We couldn\'t send the verification code. Please check your details and try again.',
    verifyFailed:         'Verification failed. Please request a new code and try again.',
    emailVerified:        '✅ Your email has been verified successfully!',
    phoneVerified:        '✅ Your phone number has been verified successfully!',
  },

  // ── Trade ───────────────────────────────────────────────────────────────────
  trade: {
    created:              (amount, minutes) =>
      `✅ Trade created! ₿${amount} is locked safely in escrow. Complete your payment within ${minutes} minutes, then click "Mark as Paid".`,
    createdShort:         '✅ Trade created! BTC is locked in escrow. Complete your payment now.',
    markPaid:             '💰 Payment marked! The seller has been notified. They will verify and release your Bitcoin shortly.',
    markPaidGiftCard:     '✅ Gift card code sent! The buyer has been notified to verify and release your Bitcoin.',
    released:             (amount) => `🎉 Trade complete! ₿${amount} has been added to your wallet.`,
    releasedShort:        '🎉 Trade completed successfully! Bitcoin has been released.',
    cancelled:            'Your trade has been cancelled. Any locked Bitcoin has been returned to your wallet.',
    cancelledByOther:     'This trade has been cancelled by the other party.',
    disputeOpened:        '⚠️ Dispute opened. Our team has been notified and will review your case shortly.',
    feedbackSubmitted:    '⭐ Feedback submitted! Thank you for rating this trade.',
    notFound:             'We couldn\'t find this trade. It may have been removed or the link is incorrect.',
    loadFailed:           'We couldn\'t load your trade details. Please refresh the page.',
    insufficientBalance:  (have, need) =>
      `❌ Insufficient balance\n\nYou need ₿${need} but only have ₿${have} available.\n\nPlease deposit more Bitcoin or choose a smaller amount.`,
    sellerInsufficient:   'The seller no longer has enough Bitcoin for this trade. Please choose a smaller amount or select a different offer.',
    noSelfTrade:          'You cannot trade with yourself. Please select a different offer.',
    verifyEmailFirst:     'Please verify your email address before selling Bitcoin. Go to Settings → Verification.',
    cannotMarkPaid:       'Only the buyer can mark a trade as paid.',
    cannotRelease:        'Only the seller can release Bitcoin after confirming payment.',
    cannotCancel:         'This trade cannot be cancelled at its current stage.',
    alreadyCompleted:     'This trade has already been completed.',
    sendFailed:           'We couldn\'t send your message. Please try again.',
    uploadFailed:         'Image upload failed. Please use a JPG or PNG under 5MB.',
    imageTooLarge:        'That image is too large. Please use a file under 5MB.',
    imageRequired:        'Please select a valid image file (JPG or PNG).',
    cancelFailed:         'We couldn\'t cancel this trade right now. Please try again or contact support.',
    disputeFailed:        'We couldn\'t open a dispute. Please try again or contact hello@praqen.com.',
    reasonRequired:       'Please provide a reason for opening a dispute.',
    releaseFailed:        (msg) => msg || 'We couldn\'t release the Bitcoin right now. Please try again.',
  },

  // ── Wallet ──────────────────────────────────────────────────────────────────
  wallet: {
    loadFailed:           'We couldn\'t load your wallet. Please refresh the page.',
    refreshed:            '✅ Wallet refreshed successfully.',
    addressGenerated:     '✅ Your Bitcoin deposit address is ready!',
    addressGenerateFailed:'We couldn\'t generate your address. Please try again.',
    checkDepositDone:     (msg) => msg || '✅ Deposit check complete.',
    checkDepositFailed:   'We couldn\'t check for new deposits. Please try again.',
    copied:               '📋 Copied to clipboard!',
    sentSuccess:          (amount, txid) => `✅ ₿${amount} sent successfully! TX: ${txid?.slice(0,12)}…`,
    internalSentSuccess:  (amount, to) => `✅ ₿${amount} sent to @${to} instantly — no fee!`,
    sendFailed:           'Bitcoin transfer failed. Please check the address and try again.',
    insufficientBalance:  (have) => `Insufficient balance. You have ₿${have} available.`,
    invalidAddress:       'Please enter a valid Bitcoin address (starts with bc1, 1, or 3).',
    addressRequired:      'Please enter a recipient address.',
    amountRequired:       'Please enter an amount greater than 0.',
    withdrawFailed:       'Withdrawal failed. Please check your details and try again.',
  },

  // ── Profile / Settings ──────────────────────────────────────────────────────
  profile: {
    saved:                '✅ Profile updated successfully.',
    saveFailed:           'We couldn\'t save your changes. Please try again.',
    passwordChanged:      '✅ Password changed successfully. Please log in again.',
    passwordFailed:       'We couldn\'t change your password. Please check your current password.',
    wrongPassword:        'Your current password is incorrect. Please try again.',
    avatarUploaded:       '✅ Profile picture updated!',
    avatarFailed:         'We couldn\'t upload your photo. Please use a JPG or PNG under 2MB.',
  },

  // ── Listings / Offers ───────────────────────────────────────────────────────
  listing: {
    created:              '✅ Your offer has been created and is now live!',
    updated:              '✅ Your offer has been updated.',
    deleted:              '✅ Your offer has been removed.',
    createFailed:         'We couldn\'t create your offer. Please check all fields and try again.',
    notFound:             'This offer no longer exists. It may have been removed by the seller.',
    loadFailed:           'We couldn\'t load this offer. Please refresh the page.',
  },

  // ── General ─────────────────────────────────────────────────────────────────
  general: {
    networkError:         'Connection problem. Please check your internet and try again.',
    serverError:          'Something went wrong on our end. Please try again in a moment. If the problem persists, contact hello@praqen.com.',
    tryAgain:             'Something went wrong. Please try again.',
    copied:               '📋 Copied!',
    loading:              'Loading…',
    sessionExpired:       'Your session expired. Please log in again.',
  },
};

// Helper to extract a user-friendly message from an axios error response
export function friendlyError(err, fallback) {
  const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
  if (serverMsg && !serverMsg.includes('supabase') && !serverMsg.includes('undefined') && serverMsg.length < 200) {
    return serverMsg;
  }
  return fallback || MSG.general.tryAgain;
}

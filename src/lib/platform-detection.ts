/**
 * Platform Detection Utility
 * 
 * Detects the current platform reliably:
 * - Web (regular browser)
 * - iOS (Safari / PWA)
 * - Android (Chrome / PWA)
 * - Telegram Mini App
 */

export type Platform = 'web' | 'ios' | 'android' | 'telegram';

/**
 * Detect if running in Telegram Mini App
 */
export const isTelegramMiniApp = (): boolean => {
  return typeof window !== 'undefined' && !!window.Telegram?.WebApp;
};

/**
 * Detect iOS platform
 * 
 * Robust detection for:
 * - iPhone (Safari, PWA, Capacitor)
 * - iPad (Safari, PWA, Capacitor)
 * - iPadOS (Safari, PWA, Capacitor)
 * 
 * Uses multiple signals for reliability:
 * - User agent string
 * - Platform string
 * - Touch points (for iPadOS detection)
 */
export const isIOS = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';
  const vendor = (navigator as any).vendor?.toLowerCase() || '';
  
  // Primary iOS detection: user agent contains iOS device identifiers
  const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
  
  // Secondary detection: iPad on iOS 13+ (reports as MacIntel but has touch points)
  const isIPadOS = platform === 'macintel' && navigator.maxTouchPoints > 1;
  
  // Tertiary detection: vendor string (Safari on iOS)
  const isSafariIOS = vendor.includes('apple') && /mobile|iphone|ipad/.test(userAgent);
  
  return isIOSDevice || isIPadOS || isSafariIOS;
};

/**
 * Detect Android platform
 */
export const isAndroid = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /android/.test(userAgent);
};

/**
 * Get current platform
 */
export const getPlatform = (): Platform => {
  if (isTelegramMiniApp()) {
    return 'telegram';
  }
  
  if (isIOS()) {
    return 'ios';
  }
  
  if (isAndroid()) {
    return 'android';
  }
  
  return 'web';
};

/**
 * Check if Google OAuth should be shown
 * 
 * Rules:
 * - Web: ✅ Yes
 * - iOS: ❌ No
 * - Android: ✅ Yes
 * - Telegram: ❌ No
 */
export const shouldShowGoogle = (): boolean => {
  const platform = getPlatform();
  return platform === 'web' || platform === 'android';
};

/**
 * Check if Apple OAuth should be shown
 * 
 * Rules:
 * - Web: ✅ Yes
 * - iOS: ✅ Yes
 * - Android: ❌ No
 * - Telegram: ❌ No
 */
export const shouldShowApple = (): boolean => {
  const platform = getPlatform();
  return platform === 'web' || platform === 'ios';
};

/**
 * Haptic Feedback Utility
 * 
 * Provides cross-platform haptic feedback:
 * - iOS: Uses Telegram WebApp HapticFeedback API
 * - Android: Uses Telegram WebApp HapticFeedback API
 * - Web: Gracefully degrades (no haptic feedback)
 * 
 * Apple App Store / Google Play Compliance:
 * - No tracking or analytics
 * - User-initiated only (not automatic)
 * - Enhances UX without collecting data
 */

/**
 * Trigger soft haptic feedback
 * 
 * Used for:
 * - Successful verification
 * - Subtle UI interactions
 * 
 * @param style - Haptic feedback style ('light' | 'medium' | 'heavy' | 'rigid' | 'soft')
 */
export const triggerHapticFeedback = (
  style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'soft'
): void => {
  if (typeof window === 'undefined') return;

  // Telegram WebApp HapticFeedback (iOS/Android)
  if (window.Telegram?.WebApp?.HapticFeedback) {
    try {
      window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
    } catch (error) {
      console.warn('[HapticFeedback] Error triggering haptic:', error);
    }
    return;
  }

  // Web fallback: Use Vibration API if available (Android Chrome)
  if ('vibrate' in navigator) {
    try {
      // Soft vibration: 10ms
      navigator.vibrate(10);
    } catch (error) {
      // Vibration API not supported or blocked
    }
  }
};

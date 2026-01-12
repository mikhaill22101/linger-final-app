/**
 * Analytics tracking for UX improvement
 * Tracks mode switches, gestures, and user actions
 */

type AnalyticsEvent = 
  | 'mode_switch_filter_changed'
  | 'mode_switch_gesture_started'
  | 'mode_switch_gesture_75_percent'
  | 'mode_switch_center_tap_confirmed'
  | 'mode_switch_completed'
  | 'together_event_created'
  | 'group_event_created'
  | 'report_submitted'
  | 'user_blocked';

interface AnalyticsEventData {
  event: AnalyticsEvent;
  mode?: 'group' | 'together' | 'both';
  method?: 'filter' | 'gesture';
  timestamp: number;
  [key: string]: any;
}

/**
 * Track analytics event
 * In production, this would send to analytics service
 * For now, logs to console and optionally stores locally
 */
export const trackEvent = (event: AnalyticsEvent, data?: Record<string, any>) => {
  const eventData: AnalyticsEventData = {
    event,
    timestamp: Date.now(),
    ...data,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, eventData);
  }

  // Store in localStorage for debugging
  try {
    const stored = localStorage.getItem('analytics_events');
    const events = stored ? JSON.parse(stored) : [];
    events.push(eventData);
    // Keep only last 100 events
    if (events.length > 100) {
      events.shift();
    }
    localStorage.setItem('analytics_events', JSON.stringify(events));
  } catch (e) {
    console.warn('Failed to store analytics event:', e);
  }

  // In production, send to analytics service:
  // fetch('/api/analytics', { method: 'POST', body: JSON.stringify(eventData) });
};

/**
 * Get stored analytics events (for debugging)
 */
export const getStoredEvents = (): AnalyticsEventData[] => {
  try {
    const stored = localStorage.getItem('analytics_events');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

/**
 * Clear stored analytics events
 */
export const clearStoredEvents = () => {
  try {
    localStorage.removeItem('analytics_events');
  } catch (e) {
    console.warn('Failed to clear analytics events:', e);
  }
};

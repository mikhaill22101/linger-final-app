import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { calculateDistance, formatRelativeTime, formatEventDateTime, formatDistance } from './MapScreen';

// Helper to set Telegram language
function setTelegramLanguage(languageCode?: string) {
  (window as any).Telegram = {
    WebApp: {
      initDataUnsafe: {
        user: languageCode ? { language_code: languageCode } : {},
      },
    },
  };
}

describe('MapScreen helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateDistance', () => {
    it('returns 0 for identical coordinates', () => {
      const d = calculateDistance(0, 0, 0, 0);
      expect(d).toBe(0);
    });

    it('computes realistic distance between two cities', () => {
      // Paris and London, ~343 km apart
      const paris = { lat: 48.8566, lng: 2.3522 };
      const london = { lat: 51.5074, lng: -0.1278 };

      const d = calculateDistance(paris.lat, paris.lng, london.lat, london.lng);

      expect(d).toBeGreaterThan(300);
      expect(d).toBeLessThan(400);
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // Freeze time for deterministic output
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    });

    it('returns Russian strings for recent times when language is ru or undefined', () => {
      setTelegramLanguage('ru');

      expect(formatRelativeTime('2024-01-01T11:59:45Z')).toBe('Только что');
      expect(formatRelativeTime('2024-01-01T11:50:00Z')).toBe('10 мин назад');
    });

    it('returns English strings when language is en', () => {
      setTelegramLanguage('en');

      expect(formatRelativeTime('2024-01-01T11:59:45Z')).toBe('Just now');
      expect(formatRelativeTime('2024-01-01T11:50:00Z')).toBe('10 min ago');
    });
  });

  describe('formatEventDateTime', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2024-01-02T10:00:00Z'));
    });

    it('formats today events in Russian', () => {
      setTelegramLanguage('ru');
      const result = formatEventDateTime('2024-01-02', '18:30');
      expect(result).toBe('Начало: Сегодня в 18:30');
    });

    it('formats non-today events in Russian with short date', () => {
      setTelegramLanguage('ru');
      const result = formatEventDateTime('2024-01-03', '18:30');
      expect(result).toBe('Начало: 03.01 в 18:30');
    });

    it('formats today events in English', () => {
      setTelegramLanguage('en');
      const result = formatEventDateTime('2024-01-02', '18:30');
      expect(result).toBe('Start: Today at 18:30');
    });

    it('returns null when date or time is missing', () => {
      setTelegramLanguage('ru');
      expect(formatEventDateTime(undefined, '18:30')).toBeNull();
      expect(formatEventDateTime('2024-01-02', undefined)).toBeNull();
    });
  });

  describe('formatDistance', () => {
    it('returns empty string for Infinity or NaN', () => {
      expect(formatDistance(Infinity)).toBe('');
      // eslint-disable-next-line no-restricted-globals
      expect(formatDistance(NaN)).toBe('');
    });

    it('formats distances below 1 km in meters', () => {
      expect(formatDistance(0.5)).toBe('500 м');
    });

    it('formats distances of 1 km or more with one decimal', () => {
      expect(formatDistance(1)).toBe('1.0 км');
      expect(formatDistance(1.234)).toBe('1.2 км');
    });
  });
});

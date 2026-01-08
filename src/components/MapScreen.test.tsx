import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from '@testing-library/react';

import MapScreen from './MapScreen';

// --- Mocks for Telegram WebApp SDK ---
const { hapticMock } = vi.hoisted(() => {
  return {
    hapticMock: vi.fn(),
  };
});

vi.mock('@twa-dev/sdk', () => {
  return {
    default: {
      ready: vi.fn(),
      expand: vi.fn(),
      HapticFeedback: {
        impactOccurred: hapticMock,
      },
    },
  };
});

// --- Mocks for Supabase client ---
interface Impulse {
  id: number;
  content: string;
  category: string;
  creator_id: number;
  created_at: string;
  author_name?: string;
  location_lat?: number | null;
  location_lng?: number | null;
}

const { fromMock, setSupabaseResponse } = vi.hoisted(() => {
  let supabaseResponse: { data: Impulse[] | null; error: any } = {
    data: [],
    error: null,
  };

  const fromMockInner = vi.fn(() => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      // Make the builder thenable so `await` returns our mocked response
      then: (onFulfilled: (value: any) => any) => onFulfilled(supabaseResponse),
    };
    return builder;
  });

  return {
    fromMock: fromMockInner,
    setSupabaseResponse: (value: { data: Impulse[] | null; error: any }) => {
      supabaseResponse = value;
    },
  };
});

vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: fromMock,
    },
  };
});

// --- Helpers for Yandex Maps mocks ---
const createYandexMapsMocks = () => {
  const addChild = vi.fn();
  const removeChild = vi.fn();
  const destroy = vi.fn();

  const markerInstances: any[] = [];

  const YMapMock = vi.fn(function MockYMap(this: any, _container: HTMLElement, _options: any) {
    this.addChild = addChild;
    this.removeChild = removeChild;
    this.destroy = destroy;
  });

  class YMapDefaultSchemeLayer {}
  class YMapDefaultFeaturesLayer {}

  const YMapMarkerMock = vi.fn(function Marker(this: any, opts: any) {
    Object.assign(this, opts);
    markerInstances.push(this);
  });

  (window as any).ymaps3 = {
    ready: Promise.resolve(),
    import: vi
      .fn()
      .mockResolvedValueOnce({
        YMap: YMapMock,
        YMapDefaultSchemeLayer,
        YMapDefaultFeaturesLayer,
      })
      .mockResolvedValueOnce({
        YMapMarker: YMapMarkerMock,
      }),
  };

  return { YMapMock, YMapMarkerMock, addChild, removeChild, destroy, markerInstances };
};

beforeEach(() => {
  setSupabaseResponse({ data: [], error: null });
  fromMock.mockClear();
  hapticMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as any).ymaps3;
});

// --- Tests ---

describe('MapScreen', () => {
  it('initializes Yandex map correctly with user location', async () => {
    const { YMapMock, addChild } = createYandexMapsMocks();

    // Mock geolocation to return a specific position
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: {
            latitude: 10,
            longitude: 20,
          },
        });
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty(navigator as any, 'geolocation', {
      configurable: true,
      value: mockGeolocation,
    });

    render(<MapScreen />);

    await waitFor(() => {
      expect(YMapMock).toHaveBeenCalledTimes(1);
    });

    // Check that the map was created with the correct center based on user location
    const [, options] = YMapMock.mock.calls[0];
    expect(options.location.center).toEqual([20, 10]);

    // Two children are added: default scheme layer and default features layer
    expect(addChild).toHaveBeenCalledTimes(2);
  });

  it('loadImpulses fetches impulses and adds markers to the map', async () => {
    const { markerInstances } = createYandexMapsMocks();

    const impulses: Impulse[] = [
      {
        id: 1,
        content: 'Hello from the map',
        category: 'general',
        creator_id: 1,
        created_at: new Date().toISOString(),
        author_name: 'Tester',
        location_lat: 55.75,
        location_lng: 37.61,
      },
    ];

    setSupabaseResponse({ data: impulses, error: null });

    render(<MapScreen />);

    await waitFor(() => {
      // Supabase query was initiated
      expect(fromMock).toHaveBeenCalledWith('impulse_with_author');
      // One marker was created for the impulse with coordinates
      expect(markerInstances.length).toBe(1);
    });
  });

  it('addMarkersToMap adds markers only for impulses with valid coordinates', async () => {
    const { markerInstances } = createYandexMapsMocks();

    const impulses: Impulse[] = [
      {
        id: 1,
        content: 'Valid impulse',
        category: 'general',
        creator_id: 1,
        created_at: new Date().toISOString(),
        location_lat: 50,
        location_lng: 60,
      },
      {
        id: 2,
        content: 'Missing lat',
        category: 'general',
        creator_id: 1,
        created_at: new Date().toISOString(),
        location_lat: null,
        location_lng: 60,
      },
      {
        id: 3,
        content: 'Missing lng',
        category: 'general',
        creator_id: 1,
        created_at: new Date().toISOString(),
        location_lat: 50,
        location_lng: null,
      },
    ];

    setSupabaseResponse({ data: impulses, error: null });

    render(<MapScreen />);

    await waitFor(() => {
      // Only the impulse with both lat and lng should create a marker
      expect(markerInstances.length).toBe(1);
      expect(markerInstances[0].coordinates).toEqual([60, 50]);
    });
  });

  it('showBalloon sets selectedImpulse and triggers haptic feedback', async () => {
    const { markerInstances } = createYandexMapsMocks();

    const impulse: Impulse = {
      id: 1,
      content: 'Balloon content',
      category: 'info',
      creator_id: 1,
      created_at: new Date().toISOString(),
      author_name: 'Author',
      location_lat: 40,
      location_lng: 70,
    };

    setSupabaseResponse({ data: [impulse], error: null });

    render(<MapScreen />);

    await waitFor(() => {
      expect(markerInstances.length).toBe(1);
    });

    // Simulate clicking on the marker which internally calls showBalloon
    markerInstances[0].onClick();

    // Balloon with impulse content should appear
    await waitFor(() => {
      expect(screen.getByText('Balloon content')).toBeTruthy();
    });

    // Haptic feedback should be triggered with 'light'
    expect(hapticMock).toHaveBeenCalledWith('light');
  });

  it('hideBalloon clears selectedImpulse when close button is clicked', async () => {
    const { markerInstances } = createYandexMapsMocks();

    const impulse: Impulse = {
      id: 1,
      content: 'To be hidden',
      category: 'info',
      creator_id: 1,
      created_at: new Date().toISOString(),
      author_name: 'Author',
      location_lat: 40,
      location_lng: 70,
    };

    setSupabaseResponse({ data: [impulse], error: null });

    render(<MapScreen />);

    await waitFor(() => {
      expect(markerInstances.length).toBe(1);
    });

    // Show the balloon first
    markerInstances[0].onClick();

    await waitFor(() => {
      expect(screen.getByText('To be hidden')).toBeTruthy();
    });

    // The only button in the balloon is the close (hideBalloon) button
    const closeButton = screen.getByRole('button');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('To be hidden')).toBeNull();
    });
  });
});

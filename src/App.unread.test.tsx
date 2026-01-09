import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Shared in-memory "tables" we can tweak per test
let directMessagesData: Array<{ id: number }> = [];
let friendRequestsData: Array<{ id: number }> = [];
let impulsesData: Array<any> = [];
let profilesData: Array<any> = [];

function createQueryBuilder(table: string) {
  let operation: 'select' | 'insert' = 'select';

  const builder: any = {
    select: vi.fn().mockImplementation(() => builder),
    insert: vi.fn().mockImplementation(() => {
      operation = 'insert';
      return builder;
    }),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((resolve) => {
      if (table === 'direct_messages') {
        return resolve({ data: directMessagesData, error: null });
      }
      if (table === 'friendships') {
        return resolve({ data: friendRequestsData, error: null });
      }
      if (table === 'impulses') {
        // Used by loadFeed; we don't assert on it in these tests
        if (operation === 'insert') {
          return resolve({ data: { id: 1 }, error: null });
        }
        return resolve({ data: impulsesData, error: null });
      }
      if (table === 'profiles') {
        return resolve({ data: profilesData, error: null });
      }
      return resolve({ data: [], error: null });
    }),
  };

  return builder;
}

vi.mock('./lib/supabase', () => {
  return {
    supabase: {
      from: (table: string) => createQueryBuilder(table),
    },
    isSupabaseConfigured: true,
    checkSupabaseConnection: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('@twa-dev/sdk', () => ({
  default: {
    ready: vi.fn(),
    expand: vi.fn(),
    showAlert: vi.fn(),
    HapticFeedback: {
      impactOccurred: vi.fn(),
    },
  },
}));

import App from './App';

describe('App loadUnreadMessagesCount integration', () => {
  beforeEach(() => {
    directMessagesData = [];
    friendRequestsData = [];
    impulsesData = [];
    profilesData = [];

    (window as any).Telegram = {
      WebApp: {
        initDataUnsafe: {
          user: {
            id: 42,
            first_name: 'Test User',
            language_code: 'ru',
          },
        },
        HapticFeedback: {
          impactOccurred: vi.fn(),
        },
        showAlert: vi.fn(),
      },
    };
  });

  it('loads unread messages and friend requests into counters', async () => {
    // 2 unread direct messages
    directMessagesData = [{ id: 1 }, { id: 2 }];
    // 1 recent friend request
    friendRequestsData = [{ id: 10 }];

    render(<App />);

    // unreadMessagesCount badge on the Profile tab should show "2"
    await waitFor(() => {
      const profileBadge = screen.getAllByText('2').at(0);
      expect(profileBadge).toBeTruthy();
    });

    // unreadNotificationsCount badge on avatar should show total (3)
    await waitFor(() => {
      const notificationsBadges = screen.getAllByText('3');
      expect(notificationsBadges.length).toBeGreaterThan(0);
    });
  });
});

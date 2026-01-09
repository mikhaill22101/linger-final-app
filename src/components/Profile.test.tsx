import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import Profile from './Profile';

// These tests assume a Vitest + React Testing Library test setup.

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

interface MockTelegramUser {
  first_name?: string;
  username?: string;
  photo_url?: string;
}

interface MockTelegramWebApp {
  initDataUnsafe?: { user?: MockTelegramUser };
  ready: () => void;
  expand: () => void;
  HapticFeedback: {
    impactOccurred: (style: string) => void;
  };
}

interface MockTelegramGlobal {
  Telegram?: {
    WebApp?: MockTelegramWebApp;
  };
}

const setupTelegramUser = (user?: MockTelegramUser) => {
  (window as unknown as MockTelegramGlobal).Telegram = {
    WebApp: {
      initDataUnsafe: { user },
      ready: vi.fn(),
      expand: vi.fn(),
      HapticFeedback: {
        impactOccurred: vi.fn(),
      },
    },
  };
};

describe('Profile component', () => {
  it('initializes state correctly with default values', () => {
    delete (window as unknown as MockTelegramGlobal).Telegram;

    render(<Profile />);

    // Name falls back to "Guest"
    expect(screen.getByText('Guest')).toBeTruthy();

    // Username placeholder is shown
    expect(
      screen.getByText('Telegram username will appear here')
    ).toBeTruthy();

    // Initials fall back to "L" when no name/username are present
    expect(screen.getByText('L')).toBeTruthy();

    // Bio textarea starts empty
    const textarea = screen.getByPlaceholderText(
      'Tell people what you are looking for in LINGER…'
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('updates state with Telegram user data on mount', async () => {
    setupTelegramUser({
      first_name: 'John',
      username: 'johnny',
      photo_url: 'https://example.com/photo.jpg',
    });

    render(<Profile />);

    // Name and username from Telegram user
    expect(await screen.findByText('John')).toBeTruthy();
    expect(screen.getByText('@johnny')).toBeTruthy();

    // Avatar image uses Telegram photo URL and first name as alt
    const img = screen.getByAltText('John') as HTMLImageElement;
    expect(img.src).toContain('https://example.com/photo.jpg');
  });

  it('handleBioChange updates the bio in state correctly', () => {
    render(<Profile />);

    const textarea = screen.getByPlaceholderText(
      'Tell people what you are looking for in LINGER…'
    ) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'New bio text' } });

    expect(textarea.value).toBe('New bio text');
  });

  it('handleSave triggers console log and attempts haptic feedback safely', () => {
    const impactSpy = vi.fn(() => {
      // Simulate an error inside the haptic call to verify try/catch safety
      throw new Error('haptic failed');
    });

    (window as unknown as MockTelegramGlobal).Telegram = {
      WebApp: {
        HapticFeedback: {
          impactOccurred: impactSpy,
        },
      },
    };

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(<Profile />);

    const saveButton = screen.getByRole('button', { name: /save/i });

    // Should not throw even if haptic feedback fails internally
    expect(() => {
      fireEvent.click(saveButton);
    }).not.toThrow();

    // Console log called with the saved profile object
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toBe('Profile saved:');
    expect(typeof consoleSpy.mock.calls[0][1]).toBe('object');

    // Haptic feedback attempted with "light" impact
    expect(impactSpy).toHaveBeenCalledWith('light');
  });

  it('renders initials correctly when no photo URL is present', () => {
    setupTelegramUser({
      first_name: 'Alice',
      username: 'alice123',
      photo_url: undefined,
    });

    render(<Profile />);

    // First character of the first name is used as initial
    expect(screen.getByText('A')).toBeTruthy();
  });
});

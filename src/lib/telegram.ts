/**
 * Telegram WebApp SDK Wrapper
 * 
 * Provides a safe interface to Telegram WebApp API that works both
 * inside Telegram Mini App and in regular browsers.
 */

interface TelegramInitData {
  query_id?: string;
  user?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
    is_premium?: boolean;
  };
  receiver?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  chat?: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    photo_url?: string;
  };
  auth_date: number;
  hash: string;
}

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

class TelegramWebAppWrapper {
  private webApp: typeof window.Telegram.WebApp | null = null;
  private isAvailable: boolean = false;
  private themeChangeHandlers: Set<(theme: 'light' | 'dark') => void> = new Set();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Check if Telegram WebApp is available
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      this.webApp = window.Telegram.WebApp;
      this.isAvailable = true;
      
      // Initialize Telegram WebApp
      this.webApp.ready();
      
      // Expand the app to full height
      this.webApp.expand();
      
      // Set up theme change listener
      this.webApp.onEvent('themeChanged', () => {
        this.notifyThemeChange();
      });
      
      console.log('✅ Telegram WebApp initialized');
    } else {
      console.log('ℹ️ Telegram WebApp not available (running in regular browser)');
    }
  }

  /**
   * Check if Telegram WebApp is available
   */
  isTelegramAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Get raw initData string
   */
  getInitData(): string | null {
    if (!this.isAvailable || !this.webApp) return null;
    return this.webApp.initData || null;
  }

  /**
   * Get parsed initData (unsafe, but convenient)
   */
  getInitDataUnsafe(): TelegramInitData | null {
    if (!this.isAvailable || !this.webApp) return null;
    return this.webApp.initDataUnsafe || null;
  }

  /**
   * Get Telegram user data
   */
  getUser(): TelegramInitData['user'] | null {
    const initData = this.getInitDataUnsafe();
    return initData?.user || null;
  }

  /**
   * Get current theme (light/dark)
   */
  getTheme(): 'light' | 'dark' {
    if (!this.isAvailable || !this.webApp) {
      // Fallback: check system preference
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    }
    return this.webApp.colorScheme || 'light';
  }

  /**
   * Get theme parameters (colors)
   */
  getThemeParams(): TelegramThemeParams {
    if (!this.isAvailable || !this.webApp) {
      return {};
    }
    return this.webApp.themeParams || {};
  }

  /**
   * Subscribe to theme changes
   */
  onThemeChange(handler: (theme: 'light' | 'dark') => void): () => void {
    this.themeChangeHandlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.themeChangeHandlers.delete(handler);
    };
  }

  private notifyThemeChange(): void {
    const theme = this.getTheme();
    this.themeChangeHandlers.forEach(handler => {
      try {
        handler(theme);
      } catch (error) {
        console.error('Error in theme change handler:', error);
      }
    });
  }

  /**
   * Apply Telegram theme to document
   * Adds CSS variables and class to <html> element
   */
  applyTheme(): void {
    if (!this.isAvailable || !this.webApp) {
      // Apply system theme
      const systemTheme = this.getTheme();
      document.documentElement.classList.toggle('dark', systemTheme === 'dark');
      return;
    }

    const theme = this.getTheme();
    const params = this.getThemeParams();

    // Add theme class
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('telegram-theme', true);

    // Apply CSS variables
    if (params.bg_color) {
      document.documentElement.style.setProperty('--tg-theme-bg-color', params.bg_color);
    }
    if (params.text_color) {
      document.documentElement.style.setProperty('--tg-theme-text-color', params.text_color);
    }
    if (params.hint_color) {
      document.documentElement.style.setProperty('--tg-theme-hint-color', params.hint_color);
    }
    if (params.link_color) {
      document.documentElement.style.setProperty('--tg-theme-link-color', params.link_color);
    }
    if (params.button_color) {
      document.documentElement.style.setProperty('--tg-theme-button-color', params.button_color);
    }
    if (params.button_text_color) {
      document.documentElement.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
    }
    if (params.secondary_bg_color) {
      document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
    }
  }

  /**
   * Show main button (bottom button in Telegram)
   */
  showMainButton(text: string, onClick: () => void): void {
    if (!this.isAvailable || !this.webApp) return;
    
    this.webApp.MainButton.setText(text);
    this.webApp.MainButton.onClick(onClick);
    this.webApp.MainButton.show();
  }

  /**
   * Hide main button
   */
  hideMainButton(): void {
    if (!this.isAvailable || !this.webApp) return;
    this.webApp.MainButton.hide();
  }

  /**
   * Set main button text
   */
  setMainButtonText(text: string): void {
    if (!this.isAvailable || !this.webApp) return;
    this.webApp.MainButton.setText(text);
  }

  /**
   * Enable/disable main button
   */
  setMainButtonEnabled(enabled: boolean): void {
    if (!this.isAvailable || !this.webApp) return;
    if (enabled) {
      this.webApp.MainButton.enable();
    } else {
      this.webApp.MainButton.disable();
    }
  }

  /**
   * Show back button
   */
  showBackButton(onClick: () => void): void {
    if (!this.isAvailable || !this.webApp) return;
    this.webApp.BackButton.onClick(onClick);
    this.webApp.BackButton.show();
  }

  /**
   * Hide back button
   */
  hideBackButton(): void {
    if (!this.isAvailable || !this.webApp) return;
    this.webApp.BackButton.hide();
  }

  /**
   * Show alert (Telegram popup)
   */
  showAlert(message: string, callback?: () => void): void {
    if (!this.isAvailable || !this.webApp) {
      // Fallback to browser alert
      window.alert(message);
      if (callback) callback();
      return;
    }
    this.webApp.showAlert(message, callback);
  }

  /**
   * Show confirm dialog
   */
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void {
    if (!this.isAvailable || !this.webApp) {
      // Fallback to browser confirm
      const confirmed = window.confirm(message);
      if (callback) callback(confirmed);
      return;
    }
    this.webApp.showConfirm(message, callback);
  }

  /**
   * Haptic feedback
   */
  hapticFeedback(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium'): void {
    if (!this.isAvailable || !this.webApp) return;
    this.webApp.HapticFeedback.impactOccurred(style);
  }

  /**
   * Close the app (only works in Telegram)
   */
  close(): void {
    if (!this.isAvailable || !this.webApp) return;
    this.webApp.close();
  }

  /**
   * Send data to bot (only works in Telegram)
   */
  sendData(data: string): void {
    if (!this.isAvailable || !this.webApp) return;
    this.webApp.sendData(data);
  }
}

// Export singleton instance
export const telegramWebApp = new TelegramWebAppWrapper();

// Export types
export type { TelegramInitData, TelegramThemeParams };

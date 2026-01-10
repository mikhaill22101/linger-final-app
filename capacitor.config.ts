import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.linger.app',
  appName: 'Linger',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Для разработки можно использовать localhost
    // url: 'http://localhost:5173',
    // cleartext: true,
  },
  plugins: {
    Geolocation: {
      permissions: {
        location: {
          whenInUse: 'Allow Linger to access your location',
          always: 'Allow Linger to always access your location',
        },
      },
    },
    Haptics: {
      enabled: true,
    },
    App: {
      enabled: true,
    },
  },
  ios: {
    scheme: 'Linger',
    contentInset: 'automatic',
    scrollEnabled: true,
  },
  android: {
    scheme: 'Linger',
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.kindar.app',
  appName: 'Kindar',
  webDir: 'out',
  server: {
    // Use the live URL for now (hybrid approach)
    url: 'https://kindar.com.br',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: true,
    scrollEnabled: true,
    scheme: 'Kindar',
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#EEECEA',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#EEECEA',
      showSpinner: false,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
  },
};

export default config;

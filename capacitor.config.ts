import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vinnicirne.colorstack',
  appName: 'Color Stack Puzzle',
  webDir: 'dist',
  android: {
    buildOptions: {
      releaseType: 'AAB',
    },
  },
  plugins: {
    AdMob: {
      // App ID AdMob (Android)
      appId: 'ca-app-pub-2871403878275209~3894483987',
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

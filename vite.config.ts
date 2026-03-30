import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  // Try to read firebase-applet-config.json
  let firebaseConfig: any = {};
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not read firebase-applet-config.json', e);
  }

  const mergedEnv: any = { ...firebaseConfig, ...env };

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(mergedEnv.GEMINI_API_KEY),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(mergedEnv.VITE_FIREBASE_API_KEY || mergedEnv.apiKey),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(mergedEnv.VITE_FIREBASE_AUTH_DOMAIN || mergedEnv.authDomain),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(mergedEnv.VITE_FIREBASE_PROJECT_ID || mergedEnv.projectId),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(mergedEnv.VITE_FIREBASE_APP_ID || mergedEnv.appId),
      'import.meta.env.VITE_FIREBASE_DATABASE_ID': JSON.stringify(mergedEnv.VITE_FIREBASE_DATABASE_ID || mergedEnv.firestoreDatabaseId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

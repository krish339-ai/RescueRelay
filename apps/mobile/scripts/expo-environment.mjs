import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
export const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const expoCli = resolve(dirname(require.resolve('expo/package.json')), 'bin/cli');
export function expoEnvironment(overrides = {}) {
  // Expo 54's UserSettings.getExpoHomeDirectory reads the internal variable below,
  // not EXPO_HOME. Keep this version-specific mapping visible and recheck on SDK upgrades.
  const expoHome = process.env.__UNSAFE_EXPO_HOME_DIRECTORY || process.env.EXPO_HOME || resolve(mobileRoot, '.expo-home');
  mkdirSync(expoHome, { recursive: true });
  return { ...process.env, EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY ?? '1', __UNSAFE_EXPO_HOME_DIRECTORY: expoHome, ...overrides };
}

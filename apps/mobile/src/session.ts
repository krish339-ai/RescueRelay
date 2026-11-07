import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
const KEY = 'rescuerelay.session.v1';
let memoryToken: string | null = null;
async function supported() { return Platform.OS !== 'web' && await SecureStore.isAvailableAsync(); }
export async function readToken(): Promise<string | null> {
  if (await supported()) return SecureStore.getItemAsync(KEY);
  return memoryToken;
}
export async function saveToken(token: string): Promise<boolean> {
  memoryToken = token;
  if (await supported()) {
    await SecureStore.setItemAsync(KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    return true;
  }
  return false;
}
export async function clearToken(): Promise<void> {
  memoryToken = null;
  if (await supported()) await SecureStore.deleteItemAsync(KEY);
}

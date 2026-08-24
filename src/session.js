import fs from 'node:fs';
import { getStorageStatePath } from './config.js';

export function getUserIdFromStorageState() {
  const statePath = getStorageStatePath();
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const cookies = state.cookies || [];

  const vuid = cookies.find((cookie) => cookie.name === 'v_uid')?.value;
  if (vuid) return String(vuid);

  const token = cookies.find((cookie) => cookie.name === 'access_token_web')?.value;
  if (!token) return null;

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    const id = payload.sub || payload.user_id || payload.uid;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

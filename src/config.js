import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function getConfigDir() {
  if (process.env.VINTED_REFRESH_CONFIG) {
    return path.resolve(process.env.VINTED_REFRESH_CONFIG);
  }

  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'vinted-refresh');
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdgConfig, 'vinted-refresh');
}

export function getStorageStatePath() {
  return path.join(getConfigDir(), 'storageState.json');
}

export function ensureConfigDir() {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function storageStateExists() {
  return fs.existsSync(getStorageStatePath());
}

export function loadStorageStatePath() {
  const statePath = getStorageStatePath();
  if (!fs.existsSync(statePath)) {
    throw new Error(
      'No saved session. Run `vinted-refresh login` first (or set VINTED_REFRESH_CONFIG).'
    );
  }
  return statePath;
}

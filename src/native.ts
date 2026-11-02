import { Channel, invoke } from '@tauri-apps/api/core';

export const isNative = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type InstalledApp = {
  id: string;
  display_name: string;
  version: string | null;
  install_location: string | null;
};
export type ReleaseInfo = {
  id: string;
  version: string;
  name: string;
  asset_name: string;
  size: number;
  published_at: string | null;
};
export type DownloadProgress = { app_id: string; received: number; total: number | null; percentage: number };
export type InstallerFile = { filename: string; path: string };

export async function loadInstalled(): Promise<InstalledApp[]> {
  return isNative ? invoke<InstalledApp[]>('get_installed_apps') : [];
}
export async function loadReleases(): Promise<ReleaseInfo[]> {
  return isNative ? invoke<ReleaseInfo[]>('get_available_releases') : [];
}
export async function downloadInstaller(appId: string, onProgress: (progress: DownloadProgress) => void): Promise<InstallerFile> {
  if (!isNative) throw new Error('Installation requires the Windows desktop app.');
  const onEvent = new Channel<DownloadProgress>();
  onEvent.onmessage = onProgress;
  return invoke<InstallerFile>('download_installer', { appId, onEvent });
}
export async function runInstaller(appId: string): Promise<void> {
  if (!isNative) throw new Error('Installation requires the Windows desktop app.');
  await invoke('open_downloaded_installer', { appId });
}
export async function openAppsSettings(): Promise<void> {
  if (!isNative) throw new Error('Windows desktop app required.');
  await invoke('open_windows_apps_settings');
}
export async function openInstallFolder(appId: string): Promise<void> {
  if (!isNative) throw new Error('Windows desktop app required.');
  await invoke('open_install_folder', { appId });
}
export async function launchApp(appId: string): Promise<void> {
  if (!isNative) throw new Error('Windows desktop app required.');
  await invoke('launch_installed_app', { appId });
}
export async function openExternal(url: string): Promise<void> {
  if (isNative) await invoke('open_external_url', { url });
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function isNewer(latest: string, local: string | null) {
  if (!local) return false;
  const toParts = (v: string) => v.replace(/^v/i, '').split(/[.+-]/)[0].split('.').map(n => Number(n) || 0);
  const a = toParts(latest), b = toParts(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

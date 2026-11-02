use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{ipc::Channel, State};
use tokio::io::AsyncWriteExt;
use url::Url;

// Explicit publisher-owned, public release repositories. Private repositories
// and repositories without a published Windows installer are not downloadable.
const RELEASE_REPOS: &[(&str, &str)] = &[
    ("zuzucord", "taithedev/ZuzuCord-Releases"),
    ("cuteterm", "taithedev/Cuteterm"),
];

#[derive(Debug, Clone, Serialize)]
struct InstalledApp {
    id: String,
    display_name: String,
    version: Option<String>,
    install_location: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ReleaseInfo {
    id: String,
    version: String,
    name: String,
    asset_name: String,
    size: u64,
    published_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct DownloadProgress {
    app_id: String,
    received: u64,
    total: Option<u64>,
    percentage: u8,
}

#[derive(Debug, Clone, Serialize)]
struct InstallerFile {
    filename: String,
    path: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
    digest: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Default)]
struct InstallerCache(Mutex<HashMap<String, PathBuf>>);

fn match_known_app(name: &str) -> Option<&'static str> {
    let n = name.to_ascii_lowercase().replace([' ', '-', '_'], "");
    if n.contains("zuzucord") { Some("zuzucord") }
    else if n.contains("zuzuai") { Some("zuzuai") }
    else if n.contains("vertexx") { Some("vertexx") }
    else if n.contains("winglass") { Some("winglass") }
    else if n.contains("zuzuloader") { Some("zuzuloader") }
    else if n.contains("cuteterm") { Some("cuteterm") }
    else { None }
}

#[cfg(target_os = "windows")]
fn find_installed_apps() -> Vec<InstalledApp> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
    use winreg::RegKey;

    let registry_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    let mut found: HashMap<String, InstalledApp> = HashMap::new();
    for hive in [RegKey::predef(HKEY_CURRENT_USER), RegKey::predef(HKEY_LOCAL_MACHINE)] {
        for flags in [KEY_READ | KEY_WOW64_64KEY, KEY_READ | KEY_WOW64_32KEY] {
            let Ok(parent) = hive.open_subkey_with_flags(registry_path, flags) else { continue; };
            for subkey_name in parent.enum_keys().flatten() {
                let Ok(subkey) = parent.open_subkey_with_flags(&subkey_name, KEY_READ) else { continue; };
                let Ok(display_name) = subkey.get_value::<String, _>("DisplayName") else { continue; };
                let Some(id) = match_known_app(&display_name) else { continue; };
                let version: Option<String> = subkey.get_value("DisplayVersion").ok();
                let location: Option<String> = subkey.get_value("InstallLocation").ok();
                let info = InstalledApp {
                    id: id.into(),
                    display_name,
                    version,
                    install_location: location.filter(|s| !s.trim().is_empty()),
                };
                // Prefer a registry entry with an installation location, if present.
                if !found.contains_key(id) || (info.install_location.is_some() && found[id].install_location.is_none()) {
                    found.insert(id.into(), info);
                }
            }
        }
    }
    let mut apps: Vec<_> = found.into_values().collect();
    apps.sort_by(|a, b| a.id.cmp(&b.id));
    apps
}

#[cfg(not(target_os = "windows"))]
fn find_installed_apps() -> Vec<InstalledApp> { Vec::new() }

#[tauri::command]
fn get_installed_apps() -> Vec<InstalledApp> { find_installed_apps() }

fn repository_for_app(app_id: &str) -> Result<&'static str, String> {
    RELEASE_REPOS.iter().find(|(id, _)| *id == app_id)
        .map(|(_, repo)| *repo)
        .ok_or_else(|| "This app does not have an approved public release feed yet.".to_string())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("ZuzifyHub/0.1 (+https://github.com/taithedev)")
        .timeout(std::time::Duration::from_secs(30))
        .build().map_err(|e| format!("Could not create a network client: {e}"))
}

fn windows_installer(asset: &GitHubAsset) -> bool {
    let lower = asset.name.to_ascii_lowercase();
    // ZuzuCord publishes a verified NSIS setup exe without "setup" in its filename.
    let zuzucord_nsis = lower.starts_with("zuzucord-react-") && lower.ends_with("-x64.exe");
    let ext_ok = lower.ends_with(".msi") || (lower.ends_with(".exe")
        && (lower.contains("setup") || lower.contains("installer") || zuzucord_nsis)
        && !lower.contains("uninstall"));
    // Windows desktop build currently supports x64 installers only.
    ext_ok && !lower.contains("arm64") && !lower.contains("aarch64") && !lower.contains("x86")
        && !lower.contains("win32") && !lower.contains("linux") && !lower.contains("darwin")
        && !lower.contains("macos") && !lower.contains("portable")
}

fn best_asset(release: &GitHubRelease) -> Option<&GitHubAsset> {
    let mut candidates: Vec<_> = release.assets.iter().filter(|a| windows_installer(a)).collect();
    candidates.sort_by_key(|a| {
        let name = a.name.to_ascii_lowercase();
        let preference = if name.contains("setup") || name.contains("installer") { 0 } else { 1 };
        (preference, if name.ends_with(".exe") { 0 } else { 1 })
    });
    candidates.into_iter().next()
}

async fn latest_release(repo: &str) -> Result<GitHubRelease, String> {
    // `repo` comes from RELEASE_REPOS only, never directly from a frontend input.
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let response = http_client()?.get(url).send().await
        .map_err(|e| format!("Could not connect to GitHub releases: {e}"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("No public release has been published for this app yet.".into());
    }
    if !response.status().is_success() {
        return Err(format!("GitHub releases returned HTTP {}", response.status()));
    }
    response.json::<GitHubRelease>().await
        .map_err(|e| format!("Could not parse release metadata: {e}"))
}

#[tauri::command]
async fn get_available_releases() -> Vec<ReleaseInfo> {
    let mut available = Vec::new();
    for (id, repo) in RELEASE_REPOS {
        if let Ok(release) = latest_release(repo).await {
            if let Some(asset) = best_asset(&release) {
                available.push(ReleaseInfo {
                    id: (*id).into(),
                    version: release.tag_name,
                    name: release.name.unwrap_or_default(),
                    asset_name: asset.name.clone(),
                    size: asset.size,
                    published_at: release.published_at,
                });
            }
        }
    }
    available
}

fn approved_download_url(url: &str, repo: &str) -> bool {
    let Ok(parsed) = Url::parse(url) else { return false; };
    parsed.scheme() == "https"
        && parsed.host_str() == Some("github.com")
        && parsed.path().starts_with(&format!("/{repo}/releases/download/"))
}

fn download_dir() -> Result<PathBuf, String> {
    dirs::download_dir().map(|p| p.join("Zuzify Hub"))
        .ok_or_else(|| "Windows Downloads folder could not be located.".to_string())
}

#[tauri::command]
async fn download_installer(
    app_id: String,
    on_event: Channel<DownloadProgress>,
    state: State<'_, InstallerCache>,
) -> Result<InstallerFile, String> {
    let repo = repository_for_app(&app_id)?;
    let release = latest_release(repo).await?;
    let asset = best_asset(&release)
        .ok_or_else(|| "The latest release has no supported Windows x64 .exe or .msi installer.".to_string())?;
    if !approved_download_url(&asset.browser_download_url, repo) {
        return Err("The release asset URL does not match the approved publisher repository.".into());
    }
    // Avoid traversal and unusual Unicode control characters in the download filename.
    let filename: String = asset.name.chars().map(|c| {
        if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') { c } else { '_' }
    }).collect();
    if filename.is_empty() || filename.starts_with('.') { return Err("Invalid release asset name.".into()); }

    let dir = download_dir()?;
    tokio::fs::create_dir_all(&dir).await.map_err(|e| format!("Could not create Downloads folder: {e}"))?;
    let destination = dir.join(&filename);
    let partial = dir.join(format!("{filename}.partial"));
    let client = http_client()?;
    let response = client.get(&asset.browser_download_url).timeout(std::time::Duration::from_secs(600))
        .send().await.map_err(|e| format!("Download request failed: {e}"))?;
    if !response.status().is_success() { return Err(format!("Installer download returned HTTP {}", response.status())); }
    let total = Some(asset.size).filter(|size| *size > 0).or_else(|| response.content_length());
    let mut file = tokio::fs::File::create(&partial).await.map_err(|e| format!("Could not save installer: {e}"))?;
    let mut stream = response.bytes_stream();
    let mut received = 0_u64;
    let mut hash = Sha256::new();
    let mut last_percentage = u8::MAX;
    let download_result: Result<(), String> = async {
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Installer download interrupted: {e}"))?;
            received += chunk.len() as u64;
            hash.update(&chunk);
            file.write_all(&chunk).await.map_err(|e| format!("Could not write installer: {e}"))?;
            let percentage = total.map(|t| ((received.saturating_mul(100) / t.max(1)).min(100)) as u8).unwrap_or(0);
            if percentage != last_percentage {
                let _ = on_event.send(DownloadProgress { app_id: app_id.clone(), received, total, percentage });
                last_percentage = percentage;
            }
        }
        file.flush().await.map_err(|e| format!("Could not flush installer file: {e}"))?;
        if let Some(expected_size) = total {
            if received != expected_size { return Err("The installer download is incomplete (size mismatch).".into()); }
        }
        if let Some(expected) = asset.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")) {
            let actual = format!("{:x}", hash.finalize());
            if !actual.eq_ignore_ascii_case(expected) { return Err("Installer SHA-256 digest does not match GitHub release metadata.".into()); }
        }
        Ok(())
    }.await;
    drop(file);
    if let Err(error) = download_result {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(error);
    }
    // An interrupted prior download never becomes a launchable file.
    if destination.exists() { tokio::fs::remove_file(&destination).await.map_err(|e| e.to_string())?; }
    tokio::fs::rename(&partial, &destination).await.map_err(|e| format!("Could not finalize download: {e}"))?;
    let canonical = destination.canonicalize().map_err(|e| e.to_string())?;
    state.0.lock().map_err(|_| "Installer state unavailable")?.insert(app_id.clone(), canonical.clone());
    let _ = on_event.send(DownloadProgress { app_id, received, total, percentage: 100 });
    Ok(InstallerFile { filename, path: canonical.to_string_lossy().to_string() })
}

#[tauri::command]
fn open_downloaded_installer(app_id: String, state: State<'_, InstallerCache>) -> Result<(), String> {
    let path = state.0.lock().map_err(|_| "Installer state unavailable")?
        .get(&app_id).cloned().ok_or("Download an installer before opening it.")?;
    let downloads = download_dir()?.canonicalize().map_err(|e| e.to_string())?;
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&downloads) || !canonical.is_file() {
        return Err("Installer file is not in the authorized Downloads folder.".into());
    }
    let extension = canonical.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    if extension != "exe" && extension != "msi" { return Err("Unsupported installer file type.".into()); }
    #[cfg(target_os = "windows")]
    {
        if extension == "msi" { Command::new("msiexec.exe").arg("/i").arg(&canonical).spawn() }
        else { Command::new(&canonical).spawn() }
            .map_err(|e| format!("Windows could not open the installer: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Installer execution is supported only on Windows.".into()) }
}

#[tauri::command]
fn launch_installed_app(app_id: String) -> Result<(), String> {
    let installed = find_installed_apps().into_iter().find(|a| a.id == app_id)
        .ok_or("This app was not found in the Windows uninstall registry.")?;
    let location = installed.install_location.ok_or("Windows has no recorded install location for this app.")?;
    let folder = Path::new(&location);
    let executable_names: &[&str] = match app_id.as_str() {
        "zuzucord" => &["ZuzuCord.exe", "ZuzuCord-React.exe"],
        "zuzuai" => &["ZuzuAI.exe"],
        "vertexx" => &["VertexX.exe"],
        "winglass" => &["Winglass.exe"],
        "zuzuloader" => &["ZuzuLoader.exe"],
        "cuteterm" => &["CuteTerm.exe"],
        _ => return Err("No launch executable configured for this app.".into()),
    };
    let path = executable_names.iter().map(|name| folder.join(name)).find(|candidate| candidate.is_file())
        .ok_or("The app is installed, but its launch executable was not found. Open it from the Windows Start menu or use Open folder.")?;
    Command::new(path).current_dir(folder).spawn().map_err(|e| format!("Could not launch app: {e}"))?;
    Ok(())
}

#[tauri::command]
fn open_install_folder(app_id: String) -> Result<(), String> {
    let installed = find_installed_apps().into_iter().find(|a| a.id == app_id)
        .ok_or("This app was not detected on this device.")?;
    let location = installed.install_location.ok_or("Windows did not record an install folder for this app.")?;
    let folder = Path::new(&location);
    if !folder.is_dir() { return Err("Windows install folder was not found on disk.".into()); }
    #[cfg(target_os = "windows")]
    { Command::new("explorer.exe").arg(folder).spawn().map_err(|e| e.to_string())?; Ok(()) }
    #[cfg(not(target_os = "windows"))]
    { Err("Only supported on Windows.".into()) }
}

#[tauri::command]
fn open_windows_apps_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { Command::new("explorer.exe").arg("ms-settings:appsfeatures").spawn().map_err(|e| e.to_string())?; Ok(()) }
    #[cfg(not(target_os = "windows"))]
    { Err("Only supported on Windows.".into()) }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    // No arbitrary URLs can be opened by the privileged process.
    const ALLOWLIST: &[&str] = &["https://zuzuos.lol/", "https://prezz-store.vercel.app/"];
    let parsed = Url::parse(&url).map_err(|_| "Invalid website URL")?;
    if parsed.scheme() != "https" || !ALLOWLIST.iter().any(|allowed| url == *allowed || url == allowed.trim_end_matches('/')) {
        return Err("Website URL is not in Zuzify Hub's approved list.".into());
    }
    #[cfg(target_os = "windows")]
    { Command::new("explorer.exe").arg(&url).spawn().map_err(|e| e.to_string())?; Ok(()) }
    #[cfg(not(target_os = "windows"))]
    { Err("Desktop link opening is supported only on Windows.".into()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(InstallerCache::default())
        .invoke_handler(tauri::generate_handler![
            get_installed_apps,
            get_available_releases,
            download_installer,
            open_downloaded_installer,
            launch_installed_app,
            open_install_folder,
            open_windows_apps_settings,
            open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("Zuzify Hub could not start");
}

# Zuzify Hub

A premium dark Windows desktop application manager built with **React 19, TypeScript, Vite, Tauri 2 and Rust**.

## What works

- Search and filter a catalog of 10 Zuzify-related projects.
- Home, Explore, My Library, Updates, Downloads, App Details and Settings.
- Save favorite apps and persist local UI preferences.
- On Windows, detect installed supported desktop apps from the Windows uninstall registry.
- Check the latest **public GitHub release** for approved repositories; only x64 `.msi` or `setup` / `installer` `.exe` assets are accepted.
- Download an installer with real progress into `Downloads/Zuzify Hub` and verify its SHA-256 digest when provided by GitHub metadata.
- Open the downloaded installer through the Windows installer/user prompt. Windows, not the Hub, performs the actual installation/uninstallation.
- Launch selected installed desktop apps when their expected executable is present in their Windows registry install folder; otherwise display an explanatory error. Open an install folder or Windows Apps settings.
- Open an approved configured web-app URL.

**No mock install counters:** the browser version runs in Preview mode. It displays zero installed apps and no live release data. Native actions are only enabled in the Windows build.

## Run React UI preview

Install Node.js 20+ then run:

```powershell
npm install
npm run dev
```

Or double-click `start-preview.bat` on Windows. The URL will be `http://127.0.0.1:1420`.

## Run the native Windows desktop app

Install Node.js 20+, Rust (rustup), Microsoft C++ Build Tools (Desktop development with C++) and Microsoft WebView2 if not already installed. See official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm install
npm run desktop:dev
```

## Build an .exe installer on Windows

```powershell
npm run desktop:build
```

Or double-click `build-windows.bat`. Expected NSIS output is under `src-tauri/target/release/bundle/nsis/`. The installer is not code-signed by default. Test on a Windows machine and sign releases before public distribution.

## Hook up official releases

The native Rust allowlist is in `src-tauri/src/lib.rs`:

```rust
const RELEASE_REPOS: &[(&str, &str)] = &[
    ("zuzucord", "taithedev/ZuzuCord-Releases"),
    ("cuteterm", "taithedev/Cuteterm"),
];
```

These are the only public feeds the Hub currently checks. An app won't show an Install button until the repository has a latest published release containing a Windows x64 `.msi` or clearly named `Setup.exe` / `Installer.exe` installer. **A private source repository is not an installer feed.** Add public release-only repositories as your products become ready; the release repository contents do not need to expose app source.

For each additional app, configure `releaseRepository` in `src/catalog.ts` for visible metadata **and** add its ID and release repository to the Rust allowlist. Rebuild the Windows Hub to use the new allowlist. Configure exact executable filenames in `launch_installed_app()` after verifying your app's actual build output, and make sure the product's installer registers `DisplayName`, `DisplayVersion`, and `InstallLocation` under the Windows Uninstall registry path. For web apps, add publisher-controlled `website` URLs to the catalog and Rust `ALLOWLIST`.

**Important production gaps:** Not all apps have release installers; the current launch executable filenames are assumptions and are checked at runtime before launch. GitHub releases without an asset digest are downloaded over HTTPS but not cryptographically checked against an independent publisher signature. For production, enforce signed releases, verification/pinning, publisher identity, app ownership authorization, installer size limits, cancellation, concurrency controls, automatic resuming, and robust private repository authentication as needed. There is no account sign-in, cloud synchronization, unattended install, auto update installation, or background daemon in this starter.

## Privacy and platform behavior

The Hub does not ask for GitHub access tokens, does not read private source code, and does not send local installed-app information to GitHub. It contacts public GitHub APIs to look for published release assets. App favorites and preferences are stored in localStorage in the local WebView. It doesn't install software without a user click and the ordinary Windows installer prompts.

## Build through GitHub Actions

If you place this project in a GitHub repository, the included `.github/workflows/build-windows.yml` workflow builds a Windows NSIS installer on `windows-latest` and uploads it as an Actions artifact. You can start it manually from **Actions → Build Zuzify Hub for Windows → Run workflow**. This workflow has not been executed or verified in this environment.

## Verification in this delivery environment

- React/TypeScript `.ts` and `.tsx` files were checked for parse errors with the TypeScript compiler's transpiler.
- JSON configuration and CSS syntax were parsed successfully.
- `npm install`, a full TypeScript typecheck, React/Vite build, and Windows/Rust compilation **could not be completed here** because the runtime cannot reach the npm registry and does not have Rust installed. This source should be treated as a substantial working starter, not as a verified release binary. Build and test on Windows before distributing it.

## Publish Zuzify Hub v0.1.0 to GitHub Releases

**Repository prerequisite:** Create a repository named `ZuzifyHub` in the `taithedev` GitHub account and upload or push the complete contents of this folder, including `.github/workflows/build-windows.yml`. A GitHub repository does not yet exist for this Hub project, and this source archive is **not** a compiled `.exe` release.

On Windows with Git installed, after opening a terminal in the extracted `ZuzifyHub` folder:

```powershell
git init
git branch -M main
git add .
git commit -m "Initial Zuzify Hub v0.1.0"
git remote add origin https://github.com/taithedev/ZuzifyHub.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

If the folder is already a Git checkout, skip `git init`, check the existing remote and current branch instead of blindly replacing them, and only create the tag if it does not already exist.

The tag triggers **Build and release Zuzify Hub for Windows** in GitHub Actions on a Windows runner. If the build succeeds, Actions publishes a GitHub Release with the NSIS `.exe` installer and a `SHA256SUMS.txt` file. This has **not been executed** from the delivery environment; monitor the Actions run and download the installer only after it succeeds. Manual `workflow_dispatch` runs produce a downloadable Actions artifact, but do **not** publish a GitHub Release.

Before distributing the installer publicly, run and test it on Windows, verify app installation and GitHub release behavior, and consider code signing.

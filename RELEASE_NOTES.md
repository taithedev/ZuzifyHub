# Zuzify Hub v0.1.0 — Initial Windows preview

Zuzify Hub is a dark React + Tauri desktop launcher and app manager for Zuzify projects.

## Included
- Home dashboard, searchable app catalog, app detail pages, favorites, library, downloads, updates, and settings.
- Windows installed-app detection for supported desktop apps.
- Public GitHub release checks for ZuzuCord and CuteTerm when valid installers are published.
- Installer downloads with progress and optional SHA-256 verification using release metadata.
- User-initiated opening of downloaded Windows installers and installed applications when detected.

## Installation
Download the Windows x64 `.exe` installer attached to this release and run it. Windows 10/11 and WebView2 are required. The installer is **not code-signed**, so Windows may display a publisher/security warning. Only install software you trust.

## Preview limitations
This release is an early preview, not a production-audited app. Many catalog entries do not yet have published Windows installers. Zuzify Hub does not silently install or uninstall apps, and its launcher behavior has not been tested across all supported products. Updates to the Hub itself are not automatic. Report problems through the repository's Issues page.

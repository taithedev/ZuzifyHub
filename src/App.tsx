import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Activity, ArrowRight, Bell, Check,
  CheckCircle2, ChevronDown, ChevronRight, CloudDownload,
  Compass, Download, ExternalLink, FolderOpen, Grid2X2, Heart, Home, Info,
  Layers3, LayoutGrid, Library, ListFilter, Menu, MonitorDown,
  Package, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal,
  Sparkles, Trash2, WandSparkles, X, Zap
} from 'lucide-react';
import { APPS, CATEGORIES, type CategoryFilter, type HubApp } from './catalog';
import { AppMark } from './components/AppMark';
import {
  downloadInstaller, isNative, isNewer, launchApp, loadInstalled, loadReleases,
  openAppsSettings, openExternal, openInstallFolder, runInstaller,
  type DownloadProgress, type InstalledApp, type InstallerFile, type ReleaseInfo
} from './native';

type View = 'home'|'explore'|'library'|'updates'|'downloads'|'settings';
type Preferences = { checkOnStart: boolean; compact: boolean; reducedMotion: boolean };
const DEFAULT_PREFERENCES: Preferences = { checkOnStart: true, compact: false, reducedMotion: false };

function fromStorage<T>(name: string, fallback: T): T {
  try { const raw = localStorage.getItem(name); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}

const MAIN_NAV = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'explore', label: 'Explore apps', Icon: Compass },
  { id: 'library', label: 'My library', Icon: Library },
  { id: 'updates', label: 'Updates', Icon: RefreshCw },
  { id: 'downloads', label: 'Downloads', Icon: Download },
] as const;

function formatSize(bytes: number) {
  if (!bytes) return 'Unknown size';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}
function niceDate(date: string | null) {
  if (!date) return 'Release date unavailable';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? 'Release date unavailable' : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionHeading({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text?: string; action?: ReactNode }) {
  return <div className="section-heading">
    <div><div className="section-heading-title">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{text && <p>{text}</p>}</div>
    {action && <div className="section-action">{action}</div>}
  </div>;
}

function NavButton({ label, active, Icon, badge, onClick }: { label: string; active?: boolean; Icon: typeof Home; badge?: number; onClick: () => void }) {
  return <button type="button" className={`nav-button ${active ? 'active' : ''}`} onClick={onClick} title={label}>
    <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{!!badge && <b className="nav-count">{badge}</b>}
  </button>;
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [category, setCategory] = useState<CategoryFilter>('All apps');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string|null>(null);
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});
  const [downloaded, setDownloaded] = useState<Record<string, InstallerFile>>({});
  const [favorites, setFavorites] = useState<string[]>(() => fromStorage<string[]>('zh-favorites', []));
  const [preferences, setPreferences] = useState<Preferences>(() => fromStorage<Preferences>('zh-preferences', DEFAULT_PREFERENCES));
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean }|null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'installed'|'saved'>('installed');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { localStorage.setItem('zh-favorites', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('zh-preferences', JSON.stringify(preferences)); }, [preferences]);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', preferences.reducedMotion);
    document.documentElement.classList.toggle('compact-cards', preferences.compact);
  }, [preferences]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4300);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); searchRef.current?.focus(); setView('explore');
      }
      if (event.key === 'Escape') { setSelectedId(null); setNotificationOpen(false); setSidebarOpen(false); }
    }
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);

  const refresh = useCallback(async (showNotice = false) => {
    if (!isNative) { if (showNotice) setToast({ message: 'Live install detection runs in the Windows desktop app.' }); return; }
    setBusy(true);
    try {
      const [newInstalled, newReleases] = await Promise.all([loadInstalled(), loadReleases()]);
      setInstalled(newInstalled); setReleases(newReleases);
      if (showNotice) setToast({ message: 'Library and release feeds checked.' });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Could not refresh the library.', error: true });
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!isNative) return;
    if (preferences.checkOnStart) { void refresh(); }
    else { void loadInstalled().then(setInstalled).catch(() => {}); }
    // Startup preference should only be consulted on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installedMap = useMemo(() => new Map(installed.map(a => [a.id, a])), [installed]);
  const releasesMap = useMemo(() => new Map(releases.map(a => [a.id, a])), [releases]);
  const updates = useMemo(() => APPS.filter(a => {
    const current = installedMap.get(a.id), release = releasesMap.get(a.id);
    return current && release && isNewer(release.version, current.version);
  }), [installedMap, releasesMap]);
  const selected = APPS.find(a => a.id === selectedId) || null;
  const savedApps = APPS.filter(a => favorites.includes(a.id));
  const installedApps = APPS.filter(a => installedMap.has(a.id));
  const shownApps = useMemo(() => APPS.filter(app => {
    const matchesCategory = category === 'All apps' || app.category === category;
    const normalized = query.trim().toLowerCase();
    return matchesCategory && (!normalized || `${app.name} ${app.description} ${app.tags.join(' ')} ${app.category}`.toLowerCase().includes(normalized));
  }), [category, query]);
  const activeDownloads = Object.keys(progress).filter(id => progress[id].percentage < 100 && !downloaded[id]);
  const totalDownloads = Object.keys(downloaded).length + activeDownloads.length;

  function navigate(next: View) { setView(next); setSidebarOpen(false); setNotificationOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function toggleFavorite(id: string) {
    setFavorites(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }
  function actionLabel(app: HubApp) {
    if (app.kind === 'web') return app.website ? 'Open website' : 'Site not linked';
    if (busyId === app.id) return 'Downloading…';
    if (downloaded[app.id]) return 'Run installer';
    if (installedMap.has(app.id)) return updates.some(a => a.id === app.id) ? 'Get update' : 'Launch app';
    return releasesMap.has(app.id) ? 'Install app' : 'Not available yet';
  }
  function canAction(app: HubApp) {
    if (app.kind === 'web') return Boolean(app.website);
    return isNative && (installedMap.has(app.id) || releasesMap.has(app.id) || Boolean(downloaded[app.id]));
  }
  async function primaryAction(app: HubApp) {
    if (app.kind === 'web') {
      if (app.website) await openExternal(app.website);
      else setToast({ message: 'No verified website has been connected for this app.' });
      return;
    }
    if (!isNative) { setToast({ message: 'Use the Windows desktop build to install and manage apps.' }); return; }
    if (busyId) return;
    setBusyId(app.id);
    try {
      if (downloaded[app.id]) {
        await runInstaller(app.id);
        setToast({ message: `${app.name} installer opened. Follow the Windows installation prompts.` });
      } else if (installedMap.has(app.id) && !updates.some(a => a.id === app.id)) {
        await launchApp(app.id);
      } else {
        const installer = await downloadInstaller(app.id, value => setProgress(prev => ({ ...prev, [app.id]: value })));
        setDownloaded(prev => ({ ...prev, [app.id]: installer }));
        setToast({ message: `${installer.filename} downloaded. Select “Run installer” to continue.` });
      }
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'This action failed.', error: true });
    } finally { setBusyId(null); }
  }
  async function manageApp(action: 'folder'|'uninstall', app: HubApp) {
    try {
      if (action === 'folder') await openInstallFolder(app.id);
      else await openAppsSettings();
    } catch (error) { setToast({ message: error instanceof Error ? error.message : 'Could not open Windows settings.', error: true }); }
  }

  const getProgress = (id: string) => progress[id];
  const appAction = (app: HubApp, className = 'btn btn-primary', icon = true) => <button type="button" disabled={!canAction(app) || busyId === app.id} className={className} onClick={() => void primaryAction(app)}>
    {busyId === app.id ? <RefreshCw className="spin" size={16} /> : icon && (app.kind === 'web' ? <ExternalLink size={16} /> : downloaded[app.id] ? <Package size={16} /> : installedMap.has(app.id) && !updates.some(a => a.id === app.id) ? <ArrowRight size={16} /> : <Download size={16} />)}
    {actionLabel(app)}
  </button>;

  function renderCard(app: HubApp, large = false) {
    const hasInstall = installedMap.has(app.id), release = releasesMap.get(app.id), current = installedMap.get(app.id);
    const pendingUpdate = updates.some(a => a.id === app.id);
    return <article key={app.id} className={`product-card ${large ? 'product-card--large' : ''}`}>
      <div className={`product-visual product-visual--${app.icon}`} style={{ '--app-accent': app.accent } as CSSProperties}>
        <div className="visual-grid" /><span className="visual-glow" />
        <div className="visual-icon"><AppMark app={app} size="lg" /></div>
        <span className="visual-type">{app.kind === 'web' ? 'WEB EXPERIENCE' : 'DESKTOP APP'}</span>
        <button className={`heart-button ${favorites.includes(app.id) ? 'on' : ''}`} type="button" aria-label={favorites.includes(app.id) ? `Remove ${app.name} from saved` : `Save ${app.name}`} onClick={() => toggleFavorite(app.id)}>
          <Heart size={17} fill={favorites.includes(app.id) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="product-info">
        <div className="product-title-row"><div className="product-name"><h3>{app.name}</h3><span>{app.category}</span></div>
          {pendingUpdate ? <span className="mini-badge update">Update</span> : hasInstall ? <span className="mini-badge installed">Installed</span> : null}
        </div>
        <p>{app.subtitle}</p>
        <div className="product-meta"><span>{app.kind === 'web' ? 'Browser' : 'Windows'}</span><span className="separator-dot"/><span>{release ? `v${release.version.replace(/^v/i,'')}` : current?.version ? `v${current.version}` : app.kind === 'web' ? 'Online' : 'Release pending'}</span></div>
        <div className="product-actions">
          <button type="button" className="btn btn-subtle product-more" onClick={() => setSelectedId(app.id)}>View details <ChevronRight size={15} /></button>
          <button type="button" className="btn btn-product-action" onClick={() => void primaryAction(app)} disabled={!canAction(app) || busyId === app.id} title={actionLabel(app)}>
            {busyId === app.id ? <RefreshCw size={17} className="spin"/> : app.kind === 'web' ? <ExternalLink size={17} /> : hasInstall && !pendingUpdate && !downloaded[app.id] ? <ArrowRight size={17} /> : <Download size={17} />}
          </button>
        </div>
        {getProgress(app.id) && busyId === app.id && <div className="inline-progress"><span style={{ width: `${getProgress(app.id).percentage}%` }} /></div>}
      </div>
    </article>;
  }

  function emptyState(Icon: typeof Package, title: string, description: string, buttonText = 'Explore apps', onClick = () => navigate('explore')) {
    return <div className="empty-state"><div className="empty-icon"><Icon size={27} /></div><h3>{title}</h3><p>{description}</p><button type="button" className="btn btn-secondary" onClick={onClick}>{buttonText} <ArrowRight size={16}/></button></div>;
  }

  function renderHome() {
    const featured = APPS[0];
    return <>
      <div className="welcome-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> THE ZUZIFY ECOSYSTEM</span><h1>One hub. <em>Every possibility.</em></h1><p>Discover, install, and keep your favorite Zuzify apps up to date. Everything in one beautifully simple place.</p></div><div className="welcome-meta"><span className="live-dot"/>{isNative ? 'Connected to Windows' : 'Interactive web preview'}</div></div>
      <div className="hero-panel">
        <div className="hero-noise"/><div className="hero-orb orb-one"/><div className="hero-orb orb-two"/>
        <div className="hero-copy"><div className="hero-kicker"><Sparkles size={13}/> FEATURED EXPERIENCE <span className="hero-kicker-dash" /></div><h2>Your world.<br/>Your people.<br/><span>One connection.</span></h2><p>Bring every conversation, community, and connection together with ZuzuCord.</p><div className="hero-actions"><button type="button" className="btn btn-white" onClick={() => setSelectedId(featured.id)}>Explore ZuzuCord <ArrowRight size={16}/></button><button type="button" className="btn btn-hero-outline" onClick={() => navigate('explore')}>Browse collection</button></div><div className="hero-footnote"><span className="tiny-pulse"/> Part of the Zuzify family</div></div>
        <div className="hero-art" aria-hidden="true"><div className="art-ellipse ellipse-1"/><div className="art-ellipse ellipse-2"/><div className="art-ellipse ellipse-3"/><div className="hero-core"><AppMark app={featured} size="hero"/></div><div className="hero-floating float-one"><MessageCircleFake/></div><div className="hero-floating float-two"><Zap size={21}/></div><div className="hero-spot spot-one"/><div className="hero-spot spot-two"/></div>
        <div className="hero-number">01 / THE COLLECTION</div>
      </div>
      <div className="metrics-grid">
        <div className="metric"><div className="metric-icon violet"><LayoutGrid size={19}/></div><div><strong>{APPS.length.toString().padStart(2, '0')}</strong><span>Apps in the ecosystem</span></div><ChevronRight size={16} className="metric-chevron"/></div>
        <div className="metric"><div className="metric-icon cyan"><MonitorDown size={19}/></div><div><strong>{installedApps.length.toString().padStart(2, '0')}</strong><span>Installed on this device</span></div><ChevronRight size={16} className="metric-chevron"/></div>
        <div className="metric"><div className="metric-icon green"><RefreshCw size={19}/></div><div><strong>{updates.length.toString().padStart(2, '0')}</strong><span>Updates available</span></div><ChevronRight size={16} className="metric-chevron"/></div>
      </div>
      <div className="home-layout"><div className="home-main">
        <section className="content-section"><SectionHeading eyebrow="DISCOVER" title="Made to work together" text="A collection of tools, spaces, and experiences made by Zuzify." action={<button className="section-link" type="button" onClick={() => navigate('explore')}>View all apps <ArrowRight size={16}/></button>}/>
          <div className="product-grid">{APPS.slice(0, 6).map(a => renderCard(a))}</div>
        </section>
        <section className="promo-strip"><div className="promo-symbol"><Layers3 size={24}/></div><div><h3>One ecosystem. No clutter.</h3><p>A single place to discover your apps, check releases, and manage what’s installed.</p></div><button type="button" onClick={() => navigate('library')} className="btn btn-secondary">My library <ArrowRight size={16}/></button></section>
      </div><aside className="home-aside">
        <div className="aside-card"><div className="aside-header"><div className="aside-title"><Activity size={17}/> Activity center</div><button aria-label="Open downloads" className="icon-button small" onClick={() => navigate('downloads')}><ArrowRight size={16}/></button></div>
          {totalDownloads ? <div className="activity-list">{Object.entries(downloaded).map(([id, item]) => <div key={id} className="activity-entry"><div className="activity-check"><Check size={14}/></div><div><strong>{APPS.find(a => a.id === id)?.name || id}</strong><span>{item.filename} ready</span></div></div>)}{activeDownloads.map(id => <div key={id} className="activity-entry"><div className="activity-check pending"><Download size={13}/></div><div><strong>{APPS.find(a => a.id === id)?.name || id}</strong><span>{progress[id]?.percentage || 0}% downloaded</span></div></div>)}</div> : <div className="quiet-activity"><div className="quiet-icon"><CheckCircle2 size={23}/></div><strong>All clear</strong><p>Downloads and installs will show up here when they happen.</p></div>}
          <div className="aside-footer"><span className="small-dot"/> {isNative ? 'Windows app connected' : 'Preview mode'}</div>
        </div>
        <div className="aside-card release-card"><div className="aside-header"><div className="aside-title"><RefreshCw size={17}/> Latest releases</div><button aria-label="Check for updates" className="icon-button small" onClick={() => void refresh(true)}><RefreshCw size={15} className={busy ? 'spin' : ''}/></button></div>
          {releases.length ? <div className="release-list">{releases.slice(0, 4).map(item => { const app = APPS.find(a => a.id === item.id); return app && <button type="button" className="release-row" key={item.id} onClick={() => setSelectedId(app.id)}><AppMark app={app} size="xs"/><span><strong>{app.name}</strong><small>Version {item.version}</small></span><ChevronRight size={15}/></button>; })}</div> : <div className="release-unavailable"><Info size={18}/><p>{isNative ? 'No accessible installer release was confirmed for the connected feeds.' : 'Release checks are available in the Windows build.'}</p></div>}
          <button type="button" className="aside-bottom-link" onClick={() => navigate('updates')}>Manage updates <ArrowRight size={15}/></button>
        </div>
        <div className="aside-note"><ShieldCheck size={18}/><div><strong>Made for your PC</strong><p>Installers are downloaded from approved publisher release feeds, and Windows handles the final installation.</p></div></div>
      </aside></div>
    </>;
  }

  function renderExplore() {
    return <><div className="page-header"><div><span className="eyebrow">THE COLLECTION</span><h1>Explore apps<span className="heading-period">.</span></h1><p>Find your next favorite tool in the Zuzify ecosystem.</p></div><div className="page-header-icon"><Grid2X2 size={28}/></div></div>
      <div className="explore-toolbar"><div className="filter-tabs">{CATEGORIES.map(x => <button key={x} type="button" onClick={() => setCategory(x)} className={category === x ? 'selected' : ''}>{x}</button>)}</div><div className="result-count"><ListFilter size={15}/>{shownApps.length} {shownApps.length === 1 ? 'app' : 'apps'}</div></div>
      {shownApps.length ? <div className="product-grid explore-grid">{shownApps.map(a => renderCard(a))}</div> : emptyState(Search, 'Nothing found', 'Try another search or change the category filter.', 'Clear filters', () => { setCategory('All apps'); setQuery(''); })}
    </>;
  }
  function renderLibrary() {
    const collection = libraryTab === 'installed' ? installedApps : savedApps;
    return <><div className="page-header"><div><span className="eyebrow">YOUR SPACE</span><h1>My library<span className="heading-period">.</span></h1><p>Everything you use, together in one place.</p></div><div className="page-header-icon"><Library size={28}/></div></div>
      {!isNative && <div className="notice-banner"><Info size={18}/><div><strong>Preview mode</strong><span>Your actual Windows installations can only be detected inside the desktop build.</span></div></div>}
      <div className="tab-bar"><button type="button" className={libraryTab === 'installed' ? 'selected' : ''} onClick={() => setLibraryTab('installed')}>Installed <span>{installedApps.length}</span></button><button type="button" className={libraryTab === 'saved' ? 'selected' : ''} onClick={() => setLibraryTab('saved')}>Saved <span>{savedApps.length}</span></button><button type="button" className="tab-refresh" onClick={() => void refresh(true)}><RefreshCw size={15} className={busy ? 'spin' : ''}/> Refresh</button></div>
      {collection.length ? <div className="library-list">{collection.map(app => <div key={app.id} className="library-row"><AppMark app={app} size="sm"/><div className="library-row-info"><strong>{app.name}</strong><span>{app.subtitle} <b>·</b> {installedMap.get(app.id)?.version ? `v${installedMap.get(app.id)?.version}` : app.kind === 'web' ? 'Web experience' : 'Not installed'}</span></div>{installedMap.has(app.id) ? <span className="mini-badge installed">Installed</span> : null}<button type="button" className="btn btn-secondary" onClick={() => setSelectedId(app.id)}>Manage <ChevronRight size={15}/></button></div>)}</div> : emptyState(libraryTab === 'installed' ? MonitorDown : Heart, libraryTab === 'installed' ? 'No apps detected yet' : 'Nothing saved yet', libraryTab === 'installed' ? 'Once an eligible Zuzify app is installed on this Windows device, it can appear here.' : 'Save apps with the heart icon to keep them close.')}
    </>;
  }
  function renderUpdates() {
    return <><div className="page-header"><div><span className="eyebrow">STAY CURRENT</span><h1>App updates<span className="heading-period">.</span></h1><p>Keep everything running the way it should.</p></div><button type="button" className="btn btn-secondary" onClick={() => void refresh(true)}><RefreshCw size={16} className={busy ? 'spin' : ''}/> Check now</button></div>
      <div className="updates-summary"><div className="updates-summary-icon"><CheckCircle2 size={28}/></div><div><h2>{updates.length ? `${updates.length} ${updates.length === 1 ? 'update' : 'updates'} available` : 'No confirmed updates'}</h2><p>{updates.length ? 'New versions are available from connected release feeds.' : isNative ? 'No newer releases were confirmed for your detected Zuzify apps. This can also happen when a feed is unavailable.' : 'Connect through the Windows desktop build to check your installed apps.'}</p></div><span className="updates-summary-count">{updates.length.toString().padStart(2,'0')}</span></div>
      {updates.length > 0 && <section className="content-section"><SectionHeading title="Ready to update"/><div className="library-list">{updates.map(a => <div className="library-row" key={a.id}><AppMark app={a} size="sm"/><div className="library-row-info"><strong>{a.name}</strong><span>{installedMap.get(a.id)?.version || 'Unknown'} → {releasesMap.get(a.id)?.version}</span></div>{appAction(a, 'btn btn-primary')}</div>)}</div></section>}
      <section className="content-section"><SectionHeading eyebrow="RELEASE FEEDS" title="Connected sources" text="Only known public Windows release feeds are checked."/><div className="source-grid">{APPS.filter(x => x.kind === 'desktop').map(app => <div key={app.id} className="source-row"><AppMark app={app} size="xs"/><div><strong>{app.name}</strong><small>{app.releaseRepository || 'Release feed not connected'}</small></div><span className={`source-status ${releasesMap.has(app.id) ? 'source-available' : ''}`}>{releasesMap.has(app.id) ? 'Release found' : app.releaseRepository ? 'Not confirmed' : 'Not configured'}</span></div>)}</div></section>
    </>;
  }
  function renderDownloads() {
    const entries = [...Object.keys(downloaded), ...activeDownloads.filter(id => !downloaded[id])];
    return <><div className="page-header"><div><span className="eyebrow">YOUR DOWNLOADS</span><h1>Download center<span className="heading-period">.</span></h1><p>Track installers retrieved by Zuzify Hub.</p></div><div className="page-header-icon"><CloudDownload size={27}/></div></div>
      {entries.length ? <div className="download-list">{entries.map(id => { const app = APPS.find(a => a.id === id); if (!app) return null; const file = downloaded[id]; const load = progress[id]; return <div key={id} className="download-item"><AppMark app={app} size="sm"/><div className="download-details"><strong>{app.name}</strong><span>{file?.filename || 'Downloading Windows installer…'}</span>{load && <div className="download-progress"><span style={{ width: `${load.percentage}%` }}/></div>}</div><div className="download-status"><span>{file ? 'Ready' : `${load?.percentage ?? 0}%`}</span>{file && appAction(app, 'btn btn-secondary', false)}</div></div>; })}</div> : emptyState(Download, 'No downloads yet', 'When you download a supported Zuzify installer, its progress and status will appear here.')}
      <div className="download-footnote"><ShieldCheck size={17}/><span>Downloaded installers are saved to your Windows Downloads folder. Review publisher information before running software.</span></div>
    </>;
  }
  function renderSettings() {
    const preferenceOption = (key: keyof Preferences, title: string, details: string) => <div className="setting-row" key={key}><div><strong>{title}</strong><span>{details}</span></div><button type="button" role="switch" aria-checked={preferences[key]} className={`switch ${preferences[key] ? 'on' : ''}`} onClick={() => setPreferences(prev => ({ ...prev, [key]: !prev[key] }))}><span/></button></div>;
    return <><div className="page-header"><div><span className="eyebrow">PERSONALIZE</span><h1>Settings<span className="heading-period">.</span></h1><p>Make the Hub work the way you do.</p></div><div className="page-header-icon"><Settings2 size={27}/></div></div>
      <div className="settings-layout"><section className="settings-card"><div className="settings-card-heading"><SlidersHorizontal size={19}/><div><h2>Preferences</h2><p>Your settings stay on this device.</p></div></div>
        {preferenceOption('checkOnStart','Check for updates on startup','Look up public release feeds when the Hub opens.')}
        {preferenceOption('compact','Compact app cards','Show more of the catalog at a glance.')}
        {preferenceOption('reducedMotion','Reduce animations','Minimize decorative movement and transitions.')}
      </section><section className="settings-card"><div className="settings-card-heading"><MonitorDown size={19}/><div><h2>Desktop integration</h2><p>Local Windows functionality and app management.</p></div></div>
        <div className="integration-row"><span>Current mode</span><strong className={isNative ? 'positive-text' : ''}>{isNative ? 'Windows desktop' : 'Browser preview'}</strong></div><div className="integration-row"><span>Windows app detection</span><strong>{isNative ? 'Enabled' : 'Unavailable'}</strong></div><div className="integration-row"><span>Installer downloads</span><strong>{isNative ? 'Available for published releases' : 'Unavailable'}</strong></div><button type="button" className="btn btn-secondary settings-refresh" onClick={() => void refresh(true)}><RefreshCw size={16} className={busy ? 'spin' : ''}/> Refresh library and feeds</button>
      </section><section className="settings-card"><div className="settings-card-heading"><ShieldCheck size={19}/><div><h2>Security and transparency</h2><p>Know what the Hub can and cannot do.</p></div></div><div className="security-copy">The Hub checks approved public GitHub release feeds and detects supported apps using the Windows uninstall registry. Installer execution always requires a user action. Windows can request additional confirmation or administrator approval.</div></section><section className="settings-card"><div className="settings-card-heading"><Info size={19}/><div><h2>About Zuzify Hub</h2><p>One home for the Zuzify ecosystem.</p></div></div><div className="integration-row"><span>Version</span><strong>0.1.0 · Starter build</strong></div><div className="integration-row"><span>Built with</span><strong>React + Tauri 2</strong></div><div className="integration-row"><span>Platform</span><strong>Windows 10/11</strong></div></section></div>
    </>;
  }

  return <div className="app-shell">
    {sidebarOpen && <button type="button" className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-row"><div className="brand-icon"><span className="brand-symbol">Z<span>·</span></span></div><div className="brand-text"><strong>ZUZIFY<span>HUB</span></strong><small>by Zuzify Inc.</small></div><button type="button" className="sidebar-close icon-button" onClick={() => setSidebarOpen(false)}><X size={18}/></button></div>
      <div className="workspace-picker"><div className="workspace-avatar">Z</div><div><strong>Zuzify Hub</strong><span>App collection</span></div><ChevronDown size={16}/></div>
      <div className="sidebar-section"><div className="sidebar-label">WORKSPACE</div><nav aria-label="Main navigation">{MAIN_NAV.map(({ id, label, Icon }) => <NavButton key={id} label={label} Icon={Icon} active={view===id} badge={id === 'updates' ? updates.length : undefined} onClick={() => navigate(id)}/>)}</nav></div>
      <div className="sidebar-section sidebar-categories"><div className="sidebar-label">CATEGORIES</div><nav aria-label="Categories"><NavButton label="All categories" Icon={Grid2X2} active={view==='explore' && category === 'All apps'} onClick={() => { setCategory('All apps'); navigate('explore'); }}/><NavButton label="AI & Creation" Icon={WandSparkles} active={view==='explore' && category==='AI & Creation'} onClick={() => { setCategory('AI & Creation'); navigate('explore'); }}/><NavButton label="Utilities" Icon={Zap} active={view==='explore' && category==='Utilities'} onClick={() => { setCategory('Utilities'); navigate('explore'); }}/><NavButton label="Experiences" Icon={Layers3} active={view==='explore' && category==='Experiences'} onClick={() => { setCategory('Experiences'); navigate('explore'); }}/></nav></div>
      <div className="sidebar-bottom"><div className="side-status"><div className="side-status-top"><span className="status-spark"><Sparkles size={18}/></span><span className="status-label">YOUR ECOSYSTEM</span></div><strong>Discover what’s next.</strong><p>New Zuzify experiences, all in one place.</p><button type="button" onClick={() => navigate('explore')}>Explore collection <ArrowRight size={14}/></button></div><NavButton label="Settings" Icon={Settings2} active={view==='settings'} onClick={() => navigate('settings')}/><div className="sidebar-version"><span className="status-led"/> Hub v0.1.0 <span className="version-divider">·</span> {isNative ? 'Windows' : 'Web preview'}</div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" type="button" onClick={() => setSidebarOpen(true)}><Menu size={21}/></button><div className="breadcrumb"><span>Zuzify Hub</span><ChevronRight size={15}/><strong>{view === 'home' ? 'Overview' : MAIN_NAV.find(x => x.id === view)?.label || 'Settings'}</strong></div>
      <div className="topbar-right"><div className="topbar-search"><Search size={18}/><input ref={searchRef} value={query} placeholder="Search apps, tools, and more…" aria-label="Search apps" onChange={event => { setQuery(event.target.value); if (event.target.value) setView('explore'); }}/><kbd>Ctrl K</kbd></div><span className="topbar-divider"/><div className="notification-wrap"><button type="button" className={`icon-button notification-button ${notificationOpen ? 'is-active' : ''}`} aria-label="Notifications" onClick={() => setNotificationOpen(!notificationOpen)}><Bell size={19}/>{updates.length > 0 && <span className="notification-dot"/>}</button>{notificationOpen && <div className="notification-popover"><div className="popover-title"><strong>Notifications</strong><button type="button" onClick={() => setNotificationOpen(false)}><X size={15}/></button></div>{updates.length ? <div className="notification-body"><RefreshCw size={18}/><p>{updates.length} app {updates.length === 1 ? 'update is' : 'updates are'} available.</p></div> : <div className="notification-body"><CheckCircle2 size={18}/><p>No new notifications.</p></div>}<button type="button" className="popover-bottom" onClick={() => navigate('updates')}>Go to updates <ArrowRight size={14}/></button></div>}</div><div className="profile-chip"><span className="profile-avatar">Z</span><div><strong>Zuzify</strong><span>Workspace</span></div><ChevronDown size={14}/></div></div>
    </header><main className="main-content">{view==='home' && renderHome()}{view==='explore' && renderExplore()}{view==='library' && renderLibrary()}{view==='updates' && renderUpdates()}{view==='downloads' && renderDownloads()}{view==='settings' && renderSettings()}<footer className="app-footer"><span>© Zuzify Inc. · Zuzify Hub</span><span>Made for the next generation of apps. <span className="footer-heart">✦</span></span></footer></main></div>
    {selected && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedId(null); }}><div className="app-modal" role="dialog" aria-modal="true" aria-label={`${selected.name} details`}><div className={`modal-art product-visual--${selected.icon}`} style={{ '--app-accent':selected.accent } as CSSProperties}><div className="visual-grid"/><button className="modal-close" aria-label="Close details" type="button" onClick={() => setSelectedId(null)}><X size={20}/></button><div className="modal-icon"><AppMark app={selected} size="hero"/></div><span className="modal-art-label">MADE BY ZUZIFY</span></div><div className="modal-content"><div className="modal-app-heading"><div><span className="eyebrow">{selected.category.toUpperCase()} · {selected.kind === 'web' ? 'WEB' : 'WINDOWS'}</span><h2>{selected.name}</h2><p>{selected.subtitle}</p></div><button type="button" className={`modal-heart ${favorites.includes(selected.id) ? 'saved' : ''}`} onClick={() => toggleFavorite(selected.id)}><Heart size={19} fill={favorites.includes(selected.id) ? 'currentColor' : 'none'}/></button></div><p className="modal-description">{selected.description}</p><div className="modal-feature-title">PROJECT HIGHLIGHTS</div><div className="features-grid">{selected.features.map(x => <div key={x}><Check size={15}/>{x}</div>)}</div><div className="modal-facts"><div><span>Platform</span><strong>{selected.kind === 'web' ? 'Web browser' : 'Windows 10/11'}</strong></div><div><span>Latest release</span><strong>{releasesMap.get(selected.id)?.version || 'Not confirmed'}</strong></div><div><span>On this device</span><strong>{installedMap.has(selected.id) ? `Installed ${installedMap.get(selected.id)?.version || ''}` : selected.kind === 'web' ? 'Web app' : 'Not detected'}</strong></div>{releasesMap.get(selected.id) && <div><span>Release date</span><strong>{niceDate(releasesMap.get(selected.id)?.published_at || null)}</strong></div>}</div>{selected.kind === 'desktop' && !releasesMap.has(selected.id) && !installedMap.has(selected.id) && <div className="modal-warning"><Info size={16}/><span>A public Windows installer release is not currently confirmed for this app.</span></div>}<div className="modal-actions">{appAction(selected, 'btn btn-primary modal-main-action')}{selected.kind === 'desktop' && installedMap.has(selected.id) && <button type="button" className="btn btn-secondary" onClick={() => void manageApp('folder', selected)}><FolderOpen size={16}/> Open folder</button>}{selected.kind === 'desktop' && installedMap.has(selected.id) && <button type="button" className="btn btn-secondary" onClick={() => void manageApp('uninstall', selected)}><Trash2 size={15}/> Uninstall…</button>}</div>{getProgress(selected.id) && busyId === selected.id && <div className="modal-progress"><span style={{ width: `${getProgress(selected.id).percentage}%` }}/><small>{getProgress(selected.id).percentage}% · {formatSize(getProgress(selected.id).received)} / {getProgress(selected.id).total ? formatSize(getProgress(selected.id).total!) : 'unknown'}</small></div>}
        <div className="modal-trust"><ShieldCheck size={15}/> {selected.kind === 'web' ? 'Opens the connected site in your browser.' : 'Windows installer. Publisher verification is recommended before installing.'}</div></div></div></div>}
    {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role="status"><span>{toast.error ? <Info size={18}/> : <CheckCircle2 size={18}/>}</span><p>{toast.message}</p><button type="button" aria-label="Dismiss" onClick={() => setToast(null)}><X size={16}/></button></div>}
  </div>;
}

function MessageCircleFake() { return <div className="floating-dots"><span/><span/><span/></div>; }

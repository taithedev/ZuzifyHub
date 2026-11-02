export type Category = 'Communication' | 'AI & Creation' | 'Utilities' | 'Productivity' | 'Experiences';
export type AppKind = 'desktop' | 'web';
export type IconStyle = 'cord' | 'ai' | 'os' | 'vertex' | 'winglass' | 'loader' | 'terminal' | 'store' | 'rhythm' | 'proxy';

export type HubApp = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: Category;
  kind: AppKind;
  icon: IconStyle;
  accent: string;
  initials: string;
  tags: string[];
  features: string[];
  website?: string;
  releaseRepository?: string;
  featured?: boolean;
};

// These are known project names, NOT an assertion that a public installer exists.
// Installer availability and versions are fetched from approved public releases at runtime.
export const APPS: HubApp[] = [
  {
    id: 'zuzucord', name: 'ZuzuCord', subtitle: 'Your community, connected',
    description: 'A more personal place to chat, call, share, and build communities. Make space for your people with servers, channels, profiles, and more.',
    category: 'Communication', kind: 'desktop', icon: 'cord', accent: '#8b7aff', initials: 'ZC',
    tags: ['Social', 'Voice & video', 'Communities'],
    features: ['Messaging and communities', 'Voice and video calling', 'Server customization', 'Personal profiles'],
    releaseRepository: 'taithedev/ZuzuCord-Releases', featured: true,
  },
  {
    id: 'zuzuai', name: 'ZuzuAI', subtitle: 'Ideas, made possible',
    description: 'One creative workspace for writing, brainstorming, coding, and experimenting with multiple AI models.',
    category: 'AI & Creation', kind: 'desktop', icon: 'ai', accent: '#5fafff', initials: 'ZA',
    tags: ['AI', 'Workflows', 'Creative'],
    features: ['AI conversations', 'Multiple model providers', 'Personalized themes', 'Creative workflows'],
  },
  {
    id: 'zuzuos', name: 'ZuzuOS', subtitle: 'Your desktop, reimagined',
    description: 'A customizable desktop-style workspace that lives on the web, with a familiar interface and connected experiences.',
    category: 'Experiences', kind: 'web', icon: 'os', accent: '#6eaff7', initials: 'ZO',
    tags: ['Web workspace', 'Personalization'],
    website: 'https://zuzuos.lol',
    features: ['Web desktop', 'Personalization', 'Connected apps', 'Workspace experience'],
  },
  {
    id: 'vertexx', name: 'Vertex X', subtitle: 'Make your setup your own',
    description: 'A Windows desktop utility project for personalizing the way you interact with supported games and tools.',
    category: 'Utilities', kind: 'desktop', icon: 'vertex', accent: '#ff9c69', initials: 'VX',
    tags: ['Windows', 'Customization'],
    features: ['Desktop utility', 'Custom themes', 'Profiles', 'App settings'],
  },
  {
    id: 'winglass', name: 'Winglass', subtitle: 'A clearer view of Windows',
    description: 'Explore polished glass effects and visual personalization for the Windows desktop.',
    category: 'Utilities', kind: 'desktop', icon: 'winglass', accent: '#76e3ce', initials: 'WG',
    tags: ['Appearance', 'Windows'],
    features: ['Windows appearance', 'Visual effects', 'Custom styles', 'Personalization'],
  },
  {
    id: 'zuzuloader', name: 'Zuzu Loader', subtitle: 'Everything in its place',
    description: 'A streamlined launcher and loader for supported Zuzify tools and experiences.',
    category: 'Utilities', kind: 'desktop', icon: 'loader', accent: '#b68cff', initials: 'ZL',
    tags: ['Launcher', 'Tools'],
    features: ['Tool discovery', 'Launcher workflows', 'Configuration', 'Personalization'],
  },
  {
    id: 'cuteterm', name: 'CuteTerm', subtitle: 'The terminal, with personality',
    description: 'A cozy command-line workbench that blends a practical Windows terminal with a softer visual identity.',
    category: 'Productivity', kind: 'desktop', icon: 'terminal', accent: '#f4b7df', initials: '>_',
    tags: ['Developer tools', 'Terminal'],
    releaseRepository: 'taithedev/Cuteterm',
    features: ['Windows commands', 'Custom commands', 'Terminal workflow', 'Thoughtful interface'],
  },
  {
    id: 'prezzstore', name: 'PrezzStore', subtitle: 'A marketplace for creators',
    description: 'A platform for creators to offer digital products, manage storefronts, and connect with their audiences.',
    category: 'Experiences', kind: 'web', icon: 'store', accent: '#e0b777', initials: 'PS',
    tags: ['Creators', 'Marketplace'],
    website: 'https://prezz-store.vercel.app',
    features: ['Creator storefronts', 'Product listings', 'Subscriptions', 'Marketplace discovery'],
  },
  {
    id: 'rhythm', name: 'Rhythm.play', subtitle: 'Feel every beat',
    description: 'An experimental music-driven web game where your cursor meets colorful moving notes.',
    category: 'Experiences', kind: 'web', icon: 'rhythm', accent: '#ff77bc', initials: 'R·',
    tags: ['Music', 'Web game'],
    features: ['Cursor-based play', 'Dynamic music visuals', 'Unlockable looks', 'Leaderboards'],
  },
  {
    id: 'fastproxy', name: 'FastProxy', subtitle: 'A browser in your workspace',
    description: 'An experimental web browsing and proxy project in the Zuzify ecosystem.',
    category: 'Utilities', kind: 'web', icon: 'proxy', accent: '#8cc0fc', initials: 'FP',
    tags: ['Web', 'Tools'],
    features: ['Web workspace', 'Browser UI', 'App preferences', 'Experimental tools'],
  },
];

export const CATEGORIES = ['All apps', 'Communication', 'AI & Creation', 'Utilities', 'Productivity', 'Experiences'] as const;
export type CategoryFilter = typeof CATEGORIES[number];

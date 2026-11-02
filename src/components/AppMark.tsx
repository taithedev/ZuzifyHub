import type { HubApp } from '../catalog';
import type { CSSProperties } from 'react';
import { AudioLines, Boxes, Command, Gem, MessageCircleMore, Monitor, Radio, ShoppingBag, Sparkles, TerminalSquare } from 'lucide-react';

const iconMap = {
  cord: MessageCircleMore,
  ai: Sparkles,
  os: Monitor,
  vertex: Gem,
  winglass: Boxes,
  loader: Command,
  terminal: TerminalSquare,
  store: ShoppingBag,
  rhythm: AudioLines,
  proxy: Radio,
};

export function AppMark({ app, size = 'md' }: { app: HubApp, size?: 'xs'|'sm'|'md'|'lg'|'hero' }) {
  const Icon = iconMap[app.icon];
  return <span className={`app-mark app-mark--${size} app-mark--${app.icon}`} style={{ '--app-accent': app.accent } as CSSProperties}>
    <Icon strokeWidth={size === 'hero' ? 1.5 : 1.75} />
  </span>;
}

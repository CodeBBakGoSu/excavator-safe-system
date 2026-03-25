import {
  Network,
  Settings,
  Terminal,
  Video,
  type LucideIcon,
} from 'lucide-react';

export const CommandIcons: Record<
  'Logs' | 'Monitor' | 'Network' | 'Settings',
  LucideIcon
> = {
  Logs: Terminal,
  Monitor: Video,
  Network,
  Settings,
};

import { createElement } from 'react';
import { IndustrialCommandShell } from './components/IndustrialCommandShell';
import { useIndustrialMonitorRuntime } from './runtime/useIndustrialMonitorRuntime';

export function IndustrialCommandApp() {
  const runtime = useIndustrialMonitorRuntime();

  return createElement(IndustrialCommandShell, { runtime });
}

export { IndustrialCommandShell } from './components/IndustrialCommandShell';

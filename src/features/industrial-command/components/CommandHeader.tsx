import { type ReactNode } from 'react';
import { CommandIcons } from './CommandIcons';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface CommandHeaderProps {
  connectedCount: number;
  totalCount: number;
  focusedChannelLabel: string;
  activeRiskSummary: string;
  riskTone: 'normal' | 'caution' | 'risk';
  onOpenSettings: () => void;
  onConnectCamera: () => void;
  onDisconnectCamera: () => void;
  onConnectSensor: () => void;
  onDisconnectSensor: () => void;
  onOpenFieldState: () => void;
  onOpenHazard: () => void;
  onOpenLogs: () => void;
  cameraConnectDisabled: boolean;
  cameraDisconnectDisabled: boolean;
  sensorConnectDisabled: boolean;
  sensorDisconnectDisabled: boolean;
}

const riskPillClassName: Record<CommandHeaderProps['riskTone'], string> = {
  normal: 'border-outline/50 bg-surface-high text-on-surface-variant',
  caution: 'border-tertiary/40 bg-tertiary/10 text-tertiary',
  risk: 'border-error/40 bg-error/10 text-error',
};

export function CommandHeader({
  connectedCount,
  totalCount,
  focusedChannelLabel,
  activeRiskSummary,
  riskTone,
  onOpenSettings,
  onConnectCamera,
  onDisconnectCamera,
  onConnectSensor,
  onDisconnectSensor,
  onOpenFieldState,
  onOpenHazard,
  onOpenLogs,
  cameraConnectDisabled,
  cameraDisconnectDisabled,
  sensorConnectDisabled,
  sensorDisconnectDisabled,
}: CommandHeaderProps) {
  return (
    <header className="ghost-border sticky top-0 z-20 mb-2 rounded-[22px] bg-surface/95 px-3 py-2 shadow-sm backdrop-filter sm:px-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-[0.18em] text-on-surface-variant uppercase">
              Industrial Command
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <StatusPill label="LIVE" value={`${connectedCount}/${totalCount}`} />
            <StatusPill label="FOCUS" value={focusedChannelLabel} />
            <span
              className={cn(
                'inline-flex max-w-full items-center rounded-xl border px-2.5 py-1.5 text-xs font-medium',
                riskPillClassName[riskTone]
              )}
            >
              <span className="truncate">{activeRiskSummary}</span>
            </span>
            <button
              aria-label="Settings"
              className="ghost-border flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-high text-on-surface-variant transition-colors hover:bg-surface-highest hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={onOpenSettings}
              type="button"
            >
              <CommandIcons.Settings className="size-4" />
            </button>
          </div>
        </div>

        <div aria-label="상단 제어 바" className="flex flex-wrap items-center gap-1.5" role="toolbar">
          <ActionButton
            disabled={cameraConnectDisabled}
            icon={<CommandIcons.Network className="size-4" />}
            label="카메라 연결"
            onClick={onConnectCamera}
            tone="primary"
          />
          <ActionButton
            disabled={cameraDisconnectDisabled}
            label="카메라 끊기"
            onClick={onDisconnectCamera}
          />
          <ActionButton
            disabled={sensorConnectDisabled}
            icon={<CommandIcons.Network className="size-4" />}
            label="센서 연결"
            onClick={onConnectSensor}
            tone="primary"
          />
          <ActionButton
            disabled={sensorDisconnectDisabled}
            label="센서 끊기"
            onClick={onDisconnectSensor}
          />
          <ActionButton label="현장 상태" onClick={onOpenFieldState} />
          <ActionButton label="위험 보기" onClick={onOpenHazard} />
          <ActionButton
            icon={<CommandIcons.Logs className="size-4" />}
            label="로그 보기"
            onClick={onOpenLogs}
          />
        </div>
      </div>
    </header>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-outline/40 bg-surface-high px-2.5 py-1.5 text-xs text-on-surface-variant">
      <span className="font-mono text-xs font-medium tabular-nums text-secondary">{label}</span>
      <span className="font-medium text-on-surface">{value}</span>
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  icon,
  tone = 'neutral',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  tone?: 'neutral' | 'primary';
}) {
  return (
    <button
      className={cn(
        'flex min-w-[104px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary'
          ? 'machined-btn border-primary text-on-primary'
          : 'border-outline bg-surface-high text-on-surface hover:bg-surface-highest'
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

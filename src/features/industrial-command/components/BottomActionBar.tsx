import { CommandIcons } from './CommandIcons';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface BottomActionBarProps {
  connectedCount: number;
  focusedChannelLabel: string;
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

export function BottomActionBar({
  connectedCount,
  focusedChannelLabel,
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
}: BottomActionBarProps) {
  return (
    <footer
      aria-label="실행 액션 바"
      className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
    >
      <div className="ghost-border flex w-full max-w-[1320px] items-center gap-2 rounded-[22px] bg-surface/95 px-2 py-2 shadow-lg backdrop-filter">
        <div className="min-w-0 flex-1 rounded-[16px] border border-outline/30 bg-surface-high px-3 py-2">
          <p className="text-[11px] text-secondary">실행 큐</p>
          <p className="mt-0.5 truncate text-xs font-medium text-on-surface">
            {focusedChannelLabel} 감시 유지 · LIVE {connectedCount}CH
          </p>
        </div>

        <button
          className={cn(
            'flex min-w-[122px] items-center justify-center gap-2 rounded-[16px] border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'machined-btn border-primary text-on-primary disabled:cursor-not-allowed disabled:opacity-50'
          )}
          disabled={cameraConnectDisabled}
          onClick={onConnectCamera}
          type="button"
        >
          <CommandIcons.Network className="size-5" />
          <span>카메라 연결</span>
        </button>

        <button
          className={cn(
            'flex min-w-[122px] items-center justify-center gap-2 rounded-[16px] border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'border-outline bg-surface-high text-on-surface hover:bg-surface-highest disabled:cursor-not-allowed disabled:opacity-50'
          )}
          disabled={cameraDisconnectDisabled}
          onClick={onDisconnectCamera}
          type="button"
        >
          <span>카메라 끊기</span>
        </button>

        <button
          className={cn(
            'flex min-w-[122px] items-center justify-center gap-2 rounded-[16px] border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'machined-btn border-primary text-on-primary disabled:cursor-not-allowed disabled:opacity-50'
          )}
          disabled={sensorConnectDisabled}
          onClick={onConnectSensor}
          type="button"
        >
          <CommandIcons.Network className="size-5" />
          <span>센서 연결</span>
        </button>

        <button
          className={cn(
            'flex min-w-[122px] items-center justify-center gap-2 rounded-[16px] border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'border-outline bg-surface-high text-on-surface hover:bg-surface-highest disabled:cursor-not-allowed disabled:opacity-50'
          )}
          disabled={sensorDisconnectDisabled}
          onClick={onDisconnectSensor}
          type="button"
        >
          <span>센서 끊기</span>
        </button>

        <button
          className={cn(
            'flex min-w-[122px] items-center justify-center gap-2 rounded-[16px] border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'border-outline bg-surface-high text-on-surface hover:bg-surface-highest'
          )}
          onClick={onOpenFieldState}
          type="button"
        >
          <span>현장 상태</span>
        </button>

        <button
          className={cn(
            'flex min-w-[122px] items-center justify-center gap-2 rounded-[16px] border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'border-outline bg-surface-high text-on-surface hover:bg-surface-highest'
          )}
          onClick={onOpenHazard}
          type="button"
        >
          <span>위험 보기</span>
        </button>

        <button
          className={cn(
            'flex min-w-[122px] items-center justify-center gap-2 rounded-[16px] border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'border-outline bg-surface-high text-on-surface hover:bg-surface-highest'
          )}
          onClick={onOpenLogs}
          type="button"
        >
          <CommandIcons.Logs className="size-5" />
          <span>로그 보기</span>
        </button>
      </div>
    </footer>
  );
}

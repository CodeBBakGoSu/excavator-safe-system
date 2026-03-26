import type { ChannelConfig, ChannelRuntimeState } from '../../../../cctv-poc/types';
import { MonitorTile } from './MonitorTile';

interface MonitorChannelView {
  channel: ChannelConfig;
  runtime: ChannelRuntimeState;
  isFocused: boolean;
}

interface MonitorSectionProps {
  channels: MonitorChannelView[];
  cameraDisplayCount: 2 | 4;
  hiddenChannelIds: number[];
  bboxVisible: boolean;
  overlayDisplayMode: 'always' | 'alert' | 'risk';
  rtspPlaybackUrl: string | null;
  rtspStreamStatus: 'idle' | 'starting' | 'running' | 'stopped' | 'failed';
  rtspStreamMessage: string | null;
  onFocusChannel: (channelId: number) => void;
  onHideChannel: (channelId: number) => void;
  onShowChannel: (channelId: number) => void;
  onShowAllChannels: () => void;
  onImageLoad: (channelId: number, width: number, height: number) => void;
}

export function MonitorSection({
  channels,
  cameraDisplayCount,
  hiddenChannelIds,
  bboxVisible,
  overlayDisplayMode,
  rtspPlaybackUrl,
  rtspStreamStatus,
  rtspStreamMessage,
  onFocusChannel,
  onHideChannel,
  onShowChannel,
  onShowAllChannels,
  onImageLoad,
}: MonitorSectionProps) {
  const hiddenChannelSet = new Set(hiddenChannelIds);
  const visibleChannels = channels.filter(({ channel }) => !hiddenChannelSet.has(channel.id)).slice(0, cameraDisplayCount);
  const hiddenChannels = channels.filter(({ channel }) => hiddenChannelSet.has(channel.id));
  const gridClassName =
    cameraDisplayCount === 2 ? 'grid grid-cols-1 gap-3 xl:grid-cols-2' : 'grid gap-2 sm:grid-cols-2';

  return (
    <section
      aria-label="Primary monitor area"
      className="ghost-border rounded-[24px] bg-surface-low p-2 shadow-sm sm:p-2.5 lg:p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-outline/20 pb-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-secondary">실시간 CCTV 모니터</p>
          <h2 className="text-sm font-semibold text-on-surface sm:text-base">
            현장 라이브 채널 매트릭스
          </h2>
        </div>
        <span className="rounded-full border border-outline/40 bg-surface px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-secondary">
          {visibleChannels.length}/{cameraDisplayCount}CH VIEW
        </span>
      </div>

      {hiddenChannels.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[20px] border border-dashed border-outline/40 bg-surface px-3 py-2">
          <span className="text-xs font-medium text-on-surface-variant">숨긴 카메라</span>
          {hiddenChannels.map(({ channel }) => (
            <button
              className="rounded-full border border-outline/40 bg-background px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-highest"
              key={channel.id}
              onClick={() => onShowChannel(channel.id)}
              type="button"
            >
              {channel.channel} 다시 켜기
            </button>
          ))}
          {hiddenChannels.length > 1 ? (
            <button
              className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
              onClick={onShowAllChannels}
              type="button"
            >
              전체 다시 켜기
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={gridClassName} data-testid="monitor-grid">
        {visibleChannels.map(({ channel, runtime, isFocused }) => (
          <MonitorTile
            channel={channel}
            isFocused={isFocused}
            key={channel.id}
            onHide={() => onHideChannel(channel.id)}
            onImageLoad={(width, height) => onImageLoad(channel.id, width, height)}
            onSelect={() => onFocusChannel(channel.id)}
            bboxVisible={bboxVisible}
            overlayDisplayMode={overlayDisplayMode}
            rtspPlaybackUrl={channel.sourceType === 'rtsp' ? rtspPlaybackUrl : null}
            rtspStreamMessage={channel.sourceType === 'rtsp' ? rtspStreamMessage : null}
            rtspStreamStatus={channel.sourceType === 'rtsp' ? rtspStreamStatus : undefined}
            runtime={runtime}
          />
        ))}
      </div>
    </section>
  );
}

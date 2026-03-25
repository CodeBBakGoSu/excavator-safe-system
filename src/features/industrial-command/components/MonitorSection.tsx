import type { ChannelConfig, ChannelRuntimeState } from '../../../../cctv-poc/types';
import { MonitorTile } from './MonitorTile';

interface MonitorChannelView {
  channel: ChannelConfig;
  runtime: ChannelRuntimeState;
  isFocused: boolean;
}

interface MonitorSectionProps {
  channels: MonitorChannelView[];
  bboxVisible: boolean;
  overlayDisplayMode: 'always' | 'alert' | 'risk';
  rtspPlaybackUrl: string | null;
  rtspStreamStatus: 'idle' | 'starting' | 'running' | 'stopped' | 'failed';
  rtspStreamMessage: string | null;
  onFocusChannel: (channelId: number) => void;
  onImageLoad: (channelId: number, width: number, height: number) => void;
}

export function MonitorSection({
  channels,
  bboxVisible,
  overlayDisplayMode,
  rtspPlaybackUrl,
  rtspStreamStatus,
  rtspStreamMessage,
  onFocusChannel,
  onImageLoad,
}: MonitorSectionProps) {
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
          {channels.length}CH ACTIVE
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2" data-testid="monitor-grid">
        {channels.map(({ channel, runtime, isFocused }) => (
          <MonitorTile
            channel={channel}
            isFocused={isFocused}
            key={channel.id}
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

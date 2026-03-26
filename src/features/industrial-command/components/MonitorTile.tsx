import { normalizeBBoxForImage } from '../../../../cctv-poc/frameParsing';
import type { ChannelConfig, ChannelRuntimeState, ConnectionStatus, DetectedObject } from '../../../../cctv-poc/types';
import { CommandIcons } from './CommandIcons';
import { getOverlayObjects, shouldRenderBoxes } from './overlayUtils';
import { RtspFramePlayer } from './RtspFramePlayer';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface MonitorTileProps {
  channel: ChannelConfig;
  runtime: ChannelRuntimeState;
  isFocused: boolean;
  onSelect: () => void;
  onImageLoad: (width: number, height: number) => void;
  bboxVisible: boolean;
  overlayDisplayMode: 'always' | 'alert' | 'risk';
  rtspPlaybackUrl?: string | null;
  rtspStreamStatus?: 'idle' | 'starting' | 'running' | 'stopped' | 'failed';
  rtspStreamMessage?: string | null;
}

const connectionLabelMap: Record<ConnectionStatus, string> = {
  idle: 'READY',
  connecting: 'SYNC',
  connected: 'LIVE',
  reconnecting: 'RETRY',
  failed: 'FAIL',
};

const connectionToneMap: Record<ConnectionStatus, string> = {
  idle: 'border-outline/50 bg-surface-high text-on-surface-variant',
  connecting: 'border-primary/50 bg-primary/10 text-primary',
  connected: 'border-primary/50 bg-primary/10 text-primary',
  reconnecting: 'border-tertiary/50 bg-tertiary/10 text-tertiary',
  failed: 'border-error/50 bg-error/10 text-error',
};

const alertToneMap: Record<ChannelRuntimeState['alertTier'], string> = {
  normal: 'border-outline/50 bg-surface-high text-on-surface-variant',
  caution: 'border-tertiary/50 bg-tertiary/10 text-tertiary',
  risk: 'border-error/50 bg-error/10 text-error',
};

function getAlertSummary(runtime: ChannelRuntimeState) {
  return (
    runtime.visualFrame.topEventKo ||
    runtime.visualFrame.combinedKo ||
    runtime.visualFrame.eventsKo[0] ||
    '실시간 위험 이벤트 대기'
  );
}

function getOverlaySize(runtime: ChannelRuntimeState) {
  return runtime.imageNaturalSize ?? runtime.visualFrame.imageSize ?? [1920, 1080];
}

export function MonitorTile({
  channel,
  runtime,
  isFocused,
  onSelect,
  onImageLoad,
  bboxVisible,
  overlayDisplayMode,
  rtspPlaybackUrl,
  rtspStreamStatus,
  rtspStreamMessage,
}: MonitorTileProps) {
  const alertSummary = getAlertSummary(runtime);
  const overlayObjects = getOverlayObjects(runtime, overlayDisplayMode);
  const [overlayWidth, overlayHeight] = getOverlaySize(runtime);
  const connectionLabel = connectionLabelMap[runtime.connectionStatus];
  const isRtspTile = channel.sourceType === 'rtsp';
  const showBoxes = bboxVisible && shouldRenderBoxes(overlayDisplayMode, runtime.alertTier);

  return (
    <button
      aria-label={`${channel.channel} ${channel.title}`}
      className={cn(
        'ghost-border group flex w-full flex-col overflow-hidden rounded-[20px] bg-background text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        runtime.alertTier === 'risk' && 'ring-2 ring-error/60 shadow-lg shadow-error/10',
        runtime.alertTier === 'caution' && 'ring-1 ring-tertiary/50 shadow-lg shadow-tertiary/10',
        isFocused && 'ring-2 ring-primary'
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-outline/20 px-3 py-3 sm:px-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-outline/40 bg-surface-high px-2 py-1 font-mono text-[11px] font-medium text-secondary">
              {channel.channel}
            </span>
            <span
              className={cn(
                'rounded-full border px-2 py-1 font-mono text-[11px] font-medium',
                connectionToneMap[runtime.connectionStatus]
              )}
            >
              {connectionLabel}
            </span>
          </div>
          <h2 className="mt-2 text-sm font-semibold text-on-surface sm:text-base">{channel.title}</h2>
          <p className="mt-0.5 truncate text-xs text-on-surface-variant">{alertSummary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
          <span
            className={cn(
              'rounded-full border px-2 py-1 font-mono text-[11px] tabular-nums',
              alertToneMap[runtime.alertTier]
            )}
          >
            {runtime.alertTier === 'risk' ? 'RISK' : runtime.alertTier === 'caution' ? 'CAUTION' : 'NORMAL'}
          </span>
          <span className="rounded-full border border-outline/40 bg-surface-high px-2 py-1 font-mono text-[11px] tabular-nums text-on-surface-variant">
            FRAME {runtime.visualFrame.frameIndex ?? '--'}
          </span>
          <span className="rounded-full border border-outline/40 bg-surface-high px-2 py-1 font-mono text-[11px] tabular-nums text-on-surface-variant">
            {runtime.incomingFps} FPS
          </span>
        </div>
      </div>

        <div className="relative aspect-video overflow-hidden bg-background">
        {isRtspTile && rtspPlaybackUrl ? (
          <RtspFramePlayer src={rtspPlaybackUrl} title={channel.title} />
        ) : runtime.currentImage ? (
          <>
            <img
              alt={`${channel.title} 실시간 프레임`}
              className="h-full w-full object-cover"
              onLoad={(event) => {
                onImageLoad(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
              }}
              src={runtime.currentImage}
            />
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              viewBox={`0 0 ${overlayWidth} ${overlayHeight}`}
            >
              {showBoxes ? overlayObjects.map(({ object, highlighted, relationHighlighted }) => (
                <DetectionOverlay
                  highlighted={highlighted}
                  key={`${object.trackId ?? object.label}-${object.bbox.join('-')}`}
                  object={object}
                  overlayHeight={overlayHeight}
                  overlayWidth={overlayWidth}
                  relationHighlighted={relationHighlighted}
                />
              )) : null}
            </svg>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <CommandIcons.Monitor className="size-12 text-primary" />
            <div className="space-y-2">
              <p className="text-base font-medium text-on-surface">
                {isRtspTile ? `${channel.channel} RTSP 영상 대기 중` : `${channel.channel} 영상 대기 중`}
              </p>
              <p className="text-pretty text-sm leading-6 text-on-surface-variant">
                {isRtspTile
                  ? rtspStreamMessage || '설정에서 RTSP 주소를 저장하고 RTSP 시작 버튼으로 실시간 프레임 스트림을 실행하세요.'
                  : '하단 연결 버튼으로 실시간 스트림을 시작하면 현재 프레임과 감지 오버레이가 표시됩니다.'}
              </p>
              {isRtspTile && rtspStreamStatus ? (
                <span className="rounded-full border border-outline/40 bg-surface px-3 py-1 font-mono text-xs text-on-surface-variant">
                  {rtspStreamStatus.toUpperCase()}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

function DetectionOverlay({
  object,
  highlighted,
  relationHighlighted,
  overlayWidth,
  overlayHeight,
}: {
  object: DetectedObject;
  highlighted: boolean;
  relationHighlighted: boolean;
  overlayWidth: number;
  overlayHeight: number;
}) {
  const [x1, y1, x2, y2] = normalizeBBoxForImage(object.bbox, [overlayWidth, overlayHeight]);
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  const tone = relationHighlighted ? '#ff3b30' : highlighted ? '#ffb4ab' : '#4b8eff';
  const fill = relationHighlighted ? 'rgba(255, 59, 48, 0.2)' : highlighted ? 'rgba(255, 180, 171, 0.12)' : 'rgba(75, 142, 255, 0.12)';
  const labelFill = relationHighlighted ? '#ff3b30' : tone;
  const labelText = relationHighlighted ? '#ffffff' : '#121416';

  return (
    <g>
      <rect fill={fill} height={height} rx="12" stroke={tone} strokeWidth="4" width={width} x={x1} y={y1} />
      <rect fill={labelFill} height="32" rx="10" width="152" x={x1} y={Math.max(6, y1 - 38)} />
      <text
        fill={labelText}
        fontFamily="var(--font-mono)"
        fontSize="16"
        fontWeight="700"
        x={x1 + 12}
        y={Math.max(27, y1 - 16)}
      >
        {(object.label || 'object').toUpperCase()} #{object.trackId ?? '--'}
      </text>
    </g>
  );
}

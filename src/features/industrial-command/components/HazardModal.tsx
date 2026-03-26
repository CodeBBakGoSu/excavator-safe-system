import { useEffect, useId } from 'react';
import { normalizeBBoxForImage } from '../../../../cctv-poc/frameParsing';
import type { ChannelRuntimeState } from '../../../../cctv-poc/types';

function getToneClassName(alertTier: ChannelRuntimeState['alertTier']) {
  if (alertTier === 'risk') return 'border-error/40 bg-error/10 text-error';
  if (alertTier === 'caution') return 'border-tertiary/40 bg-tertiary/10 text-tertiary';
  return 'border-outline/40 bg-surface-high text-on-surface-variant';
}

interface HazardModalProps {
  open: boolean;
  channelLabel: string;
  channelTitle: string;
  summary: string;
  runtime: ChannelRuntimeState;
  bboxVisible: boolean;
  overlayDisplayMode: 'always' | 'alert' | 'risk';
  onClose: () => void;
}

function shouldRenderBoxes(mode: 'always' | 'alert' | 'risk', alertTier: ChannelRuntimeState['alertTier']) {
  if (mode === 'always') return true;
  if (mode === 'alert') return alertTier !== 'normal';
  return alertTier === 'risk';
}

function isRelationHighlighted(runtime: ChannelRuntimeState, trackId: number | null, label: string) {
  if (trackId == null) return false;
  return label.toLowerCase() === 'person' && trackId === runtime.latestFrame.highlight?.personTrackId;
}

export function HazardModal({
  open,
  channelLabel,
  channelTitle,
  summary,
  runtime,
  bboxVisible,
  overlayDisplayMode,
  onClose,
}: HazardModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const frame = runtime.latestFrame;
  const showBoxes = bboxVisible && shouldRenderBoxes(overlayDisplayMode, runtime.alertTier);
  const [overlayWidth, overlayHeight] = runtime.imageNaturalSize ?? frame.imageSize ?? [1920, 1080];

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-30 flex items-center justify-center px-4 py-6 ${runtime.alertTier === 'risk' ? 'hazard-backdrop-flash' : 'bg-black/75'}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="hazard-modal-shell ghost-border w-full max-w-[min(96vw,1720px)] rounded-[36px] bg-surface px-6 py-6 shadow-2xl sm:px-8 sm:py-8"
        role="dialog"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-base font-semibold tracking-[0.24em] text-error">HAZARD VIEWER</p>
            <h2 className="text-balance text-3xl font-black tracking-tight text-on-surface sm:text-4xl" id={titleId}>
              위험 이벤트 상세
            </h2>
            <p className="max-w-4xl text-pretty text-base leading-7 text-on-surface-variant sm:text-lg" id={descriptionId}>
              선택된 채널의 최신 위험 프레임과 이벤트 요약을 확인합니다.
            </p>
          </div>
          <button
            aria-label="위험 보기 닫기"
            className="rounded-2xl border border-outline/40 bg-surface-high px-5 py-3 text-base font-semibold text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.8fr)]">
          <div className="relative overflow-hidden rounded-[32px] border border-outline/30 bg-background">
            <div className="flex items-center justify-between border-b border-outline/30 px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-outline/40 bg-surface px-4 py-1.5 font-mono text-sm font-semibold text-secondary">
                  {channelLabel}
                </span>
                <span className={`rounded-full border px-4 py-1.5 font-mono text-sm font-semibold ${getToneClassName(runtime.alertTier)}`}>
                  {runtime.alertTier === 'risk' ? 'RISK' : runtime.alertTier === 'caution' ? 'CAUTION' : 'NORMAL'}
                </span>
              </div>
              <span className="font-mono text-sm tabular-nums text-on-surface-variant">
                FRAME {frame.frameIndex ?? '--'}
              </span>
            </div>

            <div className="relative aspect-video bg-background">
              {runtime.currentImage ? (
                <>
                  <img
                    alt={`${channelTitle} 위험 프레임`}
                    className="h-full w-full object-cover"
                    src={runtime.currentImage}
                  />
                  {showBoxes ? (
                    <svg
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      preserveAspectRatio="none"
                      viewBox={`0 0 ${overlayWidth} ${overlayHeight}`}
                    >
                      {frame.objects.map((object) => {
                        const [x1, y1, x2, y2] = normalizeBBoxForImage(object.bbox, [overlayWidth, overlayHeight]);
                        const width = Math.max(0, x2 - x1);
                        const height = Math.max(0, y2 - y1);
                        const relationHighlighted = isRelationHighlighted(runtime, object.trackId, object.label);
                        const stroke = relationHighlighted ? '#ff3b30' : '#4b8eff';
                        const fill = relationHighlighted ? 'rgba(255, 59, 48, 0.2)' : 'rgba(75, 142, 255, 0.12)';

                        return (
                          <g key={`${object.trackId ?? object.label}-${object.bbox.join('-')}`}>
                            <rect
                              data-testid={`hazard-box-${object.trackId ?? object.label}`}
                              fill={fill}
                              height={height}
                              rx="12"
                              stroke={stroke}
                              strokeWidth="4"
                              width={width}
                              x={x1}
                              y={y1}
                            />
                          </g>
                        );
                      })}
                    </svg>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-base leading-7 text-on-surface-variant">
                  아직 수신된 위험 프레임이 없습니다.
                </div>
              )}
              <div className="absolute inset-x-5 bottom-5 rounded-[22px] border border-white/12 bg-black/72 px-5 py-4 text-white backdrop-blur-sm">
                <p className="text-lg font-black leading-7 sm:text-xl">{summary || '위험 이벤트 요약 대기 중'}</p>
                <p className="mt-2 text-base leading-7 text-white/88 sm:text-lg">{frame.combinedKo || '프레임 세부 요약이 수신되면 여기에 표시됩니다.'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <DetailCard label="감시 구역" value={frame.zoneName || channelTitle} />
            <DetailCard label="감지 대상" value={frame.detectedTargetLabel || '실제 감지 대상 데이터 대기 중'} />
            <DetailCard label="거리 추정" value={frame.estimatedDistanceText || '실제 거리 데이터 대기 중'} />
            <DetailCard label="이벤트 요약" value={summary || '실시간 이벤트 요약 대기 중'} />
            <div className="rounded-[28px] border border-outline/30 bg-surface-high px-5 py-5">
              <p className="text-base font-semibold text-secondary">감지 이벤트</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(frame.eventsKo.length > 0 ? frame.eventsKo : ['실시간 위험 이벤트 대기']).map((event, index) => (
                  <span
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${getToneClassName(runtime.alertTier)}`}
                    key={`${event}-${index}`}
                  >
                    {event}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="w-full rounded-[26px] border border-primary bg-primary px-5 py-4 text-base font-black text-on-primary transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={onClose}
              type="button"
            >
              상황 확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-outline/30 bg-surface-high px-5 py-5">
      <p className="text-base font-semibold text-secondary">{label}</p>
      <p className="mt-2 text-base leading-7 text-on-surface sm:text-lg">{value}</p>
    </div>
  );
}

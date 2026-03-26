import { useEffect, useId, useRef } from 'react';
import { normalizeBBoxForImage } from '../../../../cctv-poc/frameParsing';
import type { ChannelRuntimeState } from '../../../../cctv-poc/types';
import { getOverlayObjects, shouldRenderBoxes } from './overlayUtils';

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
  const overlayObjects = getOverlayObjects({ ...runtime, visualFrame: frame }, overlayDisplayMode);
  const [overlayWidth, overlayHeight] = runtime.imageNaturalSize ?? frame.imageSize ?? [1920, 1080];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      return;
    }

    if (runtime.alertTier === 'risk') {
      if (!audioRef.current) {
        const audio = new Audio('/siren.mp3');
        audio.loop = false;
        
        audio.addEventListener('ended', () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = window.setTimeout(() => {
            audio.currentTime = 0;
            audio.play().catch((e) => console.log('Siren replay prevented: ', e));
          }, 500);
        });

        audioRef.current = audio;
      }

      const audio = audioRef.current;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => console.log('Siren autoplay prevented: ', error));
      }

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        audio.pause();
        audio.currentTime = 0;
      };
    }
  }, [open, runtime.alertTier]);

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
        className={`hazard-modal-shell ghost-border w-full max-w-[min(96vw,1720px)] rounded-[36px] px-6 py-6 shadow-2xl sm:px-8 sm:py-8 ${runtime.alertTier === 'risk' ? 'hazard-modal-flash' : 'bg-surface'}`}
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

        <div className="mt-8 flex flex-col lg:flex-row items-stretch gap-6 max-w-[1600px] mx-auto">
          {/* 비디오 컨테이너 */}
          <div className="relative flex-1 overflow-hidden xl:min-w-[800px] rounded-[32px] border border-outline/30 bg-background max-w-6xl">
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
                      {overlayObjects.map(({ object, relationHighlighted }) => {
                        const [x1, y1, x2, y2] = normalizeBBoxForImage(object.bbox, [overlayWidth, overlayHeight]);
                        const width = Math.max(0, x2 - x1);
                        const height = Math.max(0, y2 - y1);
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
            </div>
          </div>

          {/* 텍스트 강조 우측 패널 */}
          <div className={`flex w-full lg:w-[420px] shrink-0 flex-col justify-center rounded-[32px] border-2 p-8 shadow-2xl ${
            runtime.alertTier === 'risk'
              ? 'border-error bg-[#1a0505]'
              : 'border-tertiary bg-tertiary/10'
          }`}>
            <div className={runtime.alertTier === 'risk' ? 'animate-pulse' : ''}>
              <p className={`mb-4 text-sm font-bold tracking-[0.2em] uppercase ${
                runtime.alertTier === 'risk' ? 'text-error' : 'text-tertiary'
              }`}>
                {runtime.alertTier === 'risk' ? '🚨 Immediate Hazard' : '⚠️ Caution'}
              </p>
              <p className="text-[2.5rem] sm:text-[2.75rem] font-black leading-[1.2] text-white break-keep" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                {summary || '위험 이벤트 요약 대기 중'}
              </p>
            </div>
            
            {runtime.alertTier === 'risk' && (
              <div className="mt-10 flex items-center justify-center gap-3 rounded-[16px] bg-error/20 py-4 text-error border border-error/30">
                <span className="relative flex h-5 w-5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75"></span>
                  <span className="relative inline-flex h-5 w-5 rounded-full bg-error"></span>
                </span>
                <span className="text-lg font-bold tracking-widest">주의 요망</span>
              </div>
            )}
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

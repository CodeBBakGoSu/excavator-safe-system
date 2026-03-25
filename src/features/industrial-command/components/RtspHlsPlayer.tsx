import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface RtspHlsPlayerProps {
  src: string;
  title: string;
}

export function RtspHlsPlayer({ src, title }: RtspHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }

    if (!Hls.isSupported()) {
      video.removeAttribute('src');
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    });
    hls.loadSource(src);
    hls.attachMedia(video);

    return () => {
      hls.destroy();
    };
  }, [src]);

  return (
    <video
      aria-label={`${title} 실시간 RTSP 스트림`}
      autoPlay
      className="h-full w-full object-cover"
      controls
      muted
      playsInline
      ref={videoRef}
    />
  );
}

import { useEffect, useMemo, useState } from 'react';

interface RtspFramePlayerProps {
  src: string;
  title: string;
}

function appendFrameToken(src: string, token: number) {
  try {
    const url = new URL(src, window.location.href);
    url.searchParams.set('_frame', String(token));
    return url.toString();
  } catch {
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}_frame=${token}`;
  }
}

export function RtspFramePlayer({ src, title }: RtspFramePlayerProps) {
  const [frameToken, setFrameToken] = useState(() => Date.now());

  useEffect(() => {
    setFrameToken(Date.now());
    const intervalId = window.setInterval(() => {
      setFrameToken(Date.now());
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [src]);

  const frameSrc = useMemo(() => appendFrameToken(src, frameToken), [frameToken, src]);

  return (
    <img
      alt={`${title} 실시간 RTSP 프레임`}
      className="h-full w-full object-cover"
      draggable={false}
      src={frameSrc}
    />
  );
}

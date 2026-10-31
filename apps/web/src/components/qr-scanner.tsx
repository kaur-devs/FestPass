'use client';

import jsQR from 'jsqr';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

const SCAN_INTERVAL_MS = 200;
const REPEAT_IGNORE_MS = 3000;

interface DetectedBarcode {
  rawValue: string;
}

interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

async function createDecoder(): Promise<Decoder> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats()).includes('qr_code')) {
    const detector = new Native({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (video) => {
    if (!context || video.videoWidth === 0) return Promise.resolve(null);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
    return Promise.resolve(found?.data ?? null);
  };
}

function cameraError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Camera access was blocked. Allow the camera in your browser settings, or search the guest list below.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No camera was found on this device. Search the guest list below instead.';
  }
  return 'The camera could not start. Search the guest list below instead.';
}

interface QrScannerProps {
  paused: boolean;
  onCode: (code: string) => void;
}

export function QrScanner({ paused, onCode }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const pausedRef = useRef(paused);
  const lastRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const found = useEffectEvent((code: string) => {
    const last = lastRef.current;
    const now = Date.now();
    if (last?.code === code && now - last.at < REPEAT_IGNORE_MS) return;
    lastRef.current = { code, at: now };
    onCode(code);
  });

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const active = () => !stopped;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        const video = videoRef.current;
        if (!active() || !video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        const decode = await createDecoder();
        const tick = async () => {
          if (!active()) return;
          if (!pausedRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const code = await decode(video).catch(() => null);
            if (code && active()) found(code);
          }
          timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (cause) {
        if (active()) setError(cameraError(cause));
      }
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-card border border-line bg-surface p-6 text-center text-ink-muted">
        {error}
      </div>
    );
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-card bg-ink">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera view for scanning ticket QR codes"
        className="size-full object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[15%] rounded-card border-4 border-white/80"
      />
      {!ready && (
        <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white">
          Starting camera…
        </p>
      )}
    </div>
  );
}

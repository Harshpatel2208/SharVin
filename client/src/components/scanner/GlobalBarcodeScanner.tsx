import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Barcode, Camera, RefreshCw, X } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { ModalBackdrop } from '../ui/DismissOnOutsideClick';

interface DetectedBarcode {
  rawValue: string;
}

interface NativeBarcodeDetector {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}

type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

const getBarcodeDetector = (): NativeBarcodeDetectorConstructor | undefined =>
  (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;

interface GlobalBarcodeScannerProps {
  variant?: 'compact' | 'hero';
  showFloatingButton?: boolean;
}

export const GlobalBarcodeScanner: React.FC<GlobalBarcodeScannerProps> = ({
  variant = 'compact',
  showFloatingButton = true,
}) => {
  const { role } = useRole();
  const navigate = useNavigate();
  const location = useLocation();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const handledScanRef = useRef(false);

  const stopStream = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const openCamera = () => {
    handledScanRef.current = false;
    setCameraError(null);
    setCameraStarting(false);
    setCameraOpen(true);
  };

  const closeCamera = useCallback(() => {
    setCameraOpen(false);
    setCameraStarting(false);
  }, []);

  const handleDetectedBarcode = useCallback((rawValue: string) => {
    const barcode = rawValue.trim();
    if (!barcode || handledScanRef.current) return;

    handledScanRef.current = true;
    closeCamera();

    if (location.pathname === '/pos') {
      window.dispatchEvent(new CustomEvent('sharvin:barcode-scanned', { detail: { barcode } }));
      return;
    }

    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    navigate('/pos', {
      state: {
        scannedBarcode: barcode,
        returnTo,
        source: 'global-camera-scan',
        scannedAt: Date.now(),
      },
    });
  }, [closeCamera, location.hash, location.pathname, location.search, navigate]);

  // Hardware barcode scanners behave like keyboards: rapid characters + Enter.
  // Capture those scans from any retailer page and open the POS counter.
  useEffect(() => {
    if (role !== 'retailer' || cameraOpen || location.pathname === '/pos') return;

    let buffer = '';
    let firstKeyAt = 0;
    let lastKeyAt = 0;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const now = performance.now();

      if (event.key === 'Enter') {
        const code = buffer.trim();
        const averageGap = code.length > 0 ? (now - firstKeyAt) / code.length : Number.POSITIVE_INFINITY;
        buffer = '';

        if (
          code.length >= 4 &&
          code.length <= 40 &&
          averageGap <= 60 &&
          /^[0-9A-Za-z._-]+$/.test(code)
        ) {
          event.preventDefault();
          event.stopPropagation();
          handleDetectedBarcode(code);
        }
        return;
      }

      if (event.key.length !== 1) {
        buffer = '';
        return;
      }

      if (buffer === '' || now - lastKeyAt > 90) {
        buffer = '';
        firstKeyAt = now;
      }
      buffer += event.key;
      lastKeyAt = now;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [cameraOpen, handleDetectedBarcode, location.pathname, role]);

  // Start the rear camera and scan frames with the native BarcodeDetector API.
  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;

    const startCamera = async () => {
      setCameraError(null);
      setCameraStarting(true);

      const Detector = getBarcodeDetector();
      if (!Detector) {
        setCameraStarting(false);
        setCameraError('Camera scanning is not supported in this browser. Use a USB/Bluetooth scanner, or open SharVin in Chrome on Android.');
        return;
      }
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraStarting(false);
        setCameraError('Camera scanning needs HTTPS (or localhost) and camera permission.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();

        let detector: NativeBarcodeDetector;
        try {
          detector = new Detector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'],
          });
        } catch {
          detector = new Detector();
        }

        setCameraStarting(false);
        let lastScanAt = 0;

        const scanFrame = async () => {
          if (cancelled) return;
          const now = performance.now();

          if (now - lastScanAt >= 220 && video.readyState >= 2) {
            lastScanAt = now;
            try {
              const codes = await detector.detect(video);
              const match = codes.find((code) => code.rawValue?.trim());
              if (match) {
                handleDetectedBarcode(match.rawValue);
                return;
              }
            } catch {
              // Ignore individual frame decode failures and keep scanning.
            }
          }

          if (!cancelled) {
            frameRef.current = window.requestAnimationFrame(scanFrame);
          }
        };

        frameRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        if (cancelled) return;
        setCameraStarting(false);
        const message = error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access to scan barcodes.'
          : 'Unable to start the camera. Check camera permission and try again.';
        setCameraError(message);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [cameraOpen, handleDetectedBarcode, stopStream]);

  useEffect(() => {
    if (!cameraOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCamera();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [cameraOpen, closeCamera]);

  useEffect(() => stopStream, [stopStream]);

  if (role !== 'retailer') return null;

  return (
    <>
      <button
        type="button"
        onClick={openCamera}
        className={variant === 'hero'
          ? 'flex min-h-44 w-full flex-col items-center justify-center gap-4 rounded-[2rem] bg-blue-600 px-6 py-8 text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.99]'
          : 'flex items-center gap-1.5 p-2 sm:px-2.5 rounded-xl bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 transition shadow-xs'}
        aria-label="Scan a product barcode with the camera"
        title="Scan barcode (camera)"
      >
        {variant === 'hero' ? <Camera className="h-14 w-14" /> : <Barcode className="w-4 h-4" />}
        <span className={variant === 'hero' ? 'text-2xl font-black tracking-tight' : 'hidden xl:inline text-xs font-semibold'}>
          {variant === 'hero' ? 'Scan Barcode' : 'Scan'}
        </span>
        {variant === 'hero' && <span className="text-sm font-medium text-blue-100">Tap to open camera</span>}
      </button>

      {showFloatingButton && <button
        type="button"
        onClick={openCamera}
        className="md:hidden fixed bottom-5 right-5 z-30 w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center transition active:scale-95"
        aria-label="Scan a product barcode with the phone camera"
        title="Scan barcode with camera"
      >
        <Camera className="w-6 h-6" />
      </button>}

      {cameraOpen && createPortal(
        <ModalBackdrop
          onClose={closeCamera}
          className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal={true}
          aria-label="Camera barcode scanner"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Scan Product Barcode</h3>
                  <p className="text-[11px] text-slate-500">Point the rear camera at the barcode.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition"
                aria-label="Close camera scanner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-50 border border-slate-200">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
                autoPlay
              />
              <div className="absolute inset-x-8 top-1/2 h-0.5 bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
              <div className="absolute inset-6 border-2 border-slate-900/25 rounded-xl pointer-events-none" />
              {cameraStarting && (
                <div className="absolute inset-0 bg-slate-50/70 flex flex-col items-center justify-center gap-2 text-slate-900 text-xs font-semibold">
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-600" />
                  Starting camera...
                </div>
              )}
            </div>

            {cameraError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-slate-500">
              On a phone, the rear camera scans the barcode and opens the POS bill automatically.
              A USB/Bluetooth scanner works on any SharVin page without opening this window.
            </p>

            <button
              type="button"
              onClick={closeCamera}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold transition"
            >
              Cancel
            </button>
          </div>
        </ModalBackdrop>,
        document.body
      )}
    </>
  );
};

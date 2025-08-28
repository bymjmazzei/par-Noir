import React, { useState, useRef, useEffect } from 'react';
import jsQR from 'jsqr';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  onScan,
  onClose,
  isOpen
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [scanningArea, setScanningArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      setError('');
      setIsScanning(true);

      // Request camera access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }

      // Start scanning after video loads
      setTimeout(() => {
        if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Set scanning area (center 60% of the video)
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const scanSize = Math.min(canvas.width, canvas.height) * 0.6;
            
            setScanningArea({
              x: centerX - scanSize / 2,
              y: centerY - scanSize / 2,
              width: scanSize,
              height: scanSize
            });

            scanFrame();
          }
        }
      }, 1000);

    } catch (err) {
      console.error('Camera access error:', err);
      setError('Failed to access camera. Please ensure camera permissions are granted.');
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsScanning(false);
  };

  const scanFrame = () => {
    if (!isScanning || !videoRef.current || !canvasRef.current || !stream) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
      // Draw the video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data from the scanning area
      if (scanningArea) {
        const imageData = ctx.getImageData(
          scanningArea.x,
          scanningArea.y,
          scanningArea.width,
          scanningArea.height
        );

        // Scan for QR code
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          console.log('QR Code detected:', code.data);
          onScan(code.data);
          stopCamera();
          return;
        }
      }
    }

    // Continue scanning
    requestAnimationFrame(scanFrame);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Scan QR Code</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        <div className="relative">
          {/* Camera Video */}
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-64 object-cover"
              playsInline
              muted
            />
            
            {/* Scanning Overlay */}
            {scanningArea && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Semi-transparent overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-50" />
                
                {/* Scanning area cutout */}
                <div
                  className="absolute border-2 border-blue-500 bg-transparent"
                  style={{
                    left: `${(scanningArea.x / (videoRef.current?.videoWidth || 1)) * 100}%`,
                    top: `${(scanningArea.y / (videoRef.current?.videoHeight || 1)) * 100}%`,
                    width: `${(scanningArea.width / (videoRef.current?.videoWidth || 1)) * 100}%`,
                    height: `${(scanningArea.height / (videoRef.current?.videoHeight || 1)) * 100}%`
                  }}
                >
                  {/* Corner indicators */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-l-4 border-t-4 border-blue-500" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-r-4 border-t-4 border-blue-500" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-l-4 border-b-4 border-blue-500" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-r-4 border-b-4 border-blue-500" />
                </div>
              </div>
            )}
          </div>

          {/* Hidden canvas for processing */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Status and Instructions */}
          <div className="mt-4 text-center">
            {error ? (
              <div className="text-red-500 mb-4">{error}</div>
            ) : (
              <div className="text-text-secondary">
                <p className="mb-2">Point your camera at a device sync QR code</p>
                <p className="text-sm">The QR code should appear within the scanning area</p>
              </div>
            )}
          </div>

          {/* Fallback Demo Button */}
          <div className="mt-4">
            <button
              onClick={() => {
                // Simulate QR code scanning for demo purposes
                const mockQRData = {
                  type: 'device-pairing',
                  data: {
                    deviceId: `device-${Date.now()}`,
                    deviceName: 'Mobile Device',
                    deviceType: 'mobile',
                    syncKey: `sync-${Math.random().toString(36).substring(2)}`,
                    identityId: `did:key:${Math.random().toString(36).substring(2)}`,
                    deviceFingerprint: `fp-${Math.random().toString(36).substring(2)}`
                  },
                  timestamp: Date.now(),
                  expiresAt: Date.now() + (5 * 60 * 1000),
                  signature: `sig-${Math.random().toString(36).substring(2)}`
                };
                
                onScan(JSON.stringify(mockQRData));
              }}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Demo: Simulate QR Scan
            </button>
          </div>

          {/* Camera Controls */}
          <div className="mt-4 flex space-x-3">
            <button
              onClick={startCamera}
              disabled={isScanning}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
            >
              {isScanning ? 'Scanning...' : 'Start Camera'}
            </button>
            <button
              onClick={stopCamera}
              disabled={!isScanning}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
            >
              Stop Camera
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-text-secondary space-y-1">
          <p>• QR codes are used to securely pair devices</p>
          <p>• Each QR code contains encrypted device information</p>
          <p>• Scanning will add the device to your synced devices</p>
          <p>• Maximum 5 devices can be synced per identity</p>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Camera, RotateCcw, AlertCircle } from 'lucide-react';
import { SecureFileHandler } from '../utils/SecureFileHandler';

interface SelfieCaptureStepProps {
  onCapture: (file: File) => void;
}

export const SelfieCaptureStep: React.FC<SelfieCaptureStepProps> = ({ onCapture }) => {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    startCamera();
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      // Clean up captured image URL
      if (capturedImage) {
        SecureFileHandler.secureRevokeURL(capturedImage);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      setCameraStream(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setError('Unable to access camera. Please check your permissions and try again.');
    }
  };

  const captureSelfie = async () => {
    if (!cameraStream || !videoRef.current || !canvasRef.current) return;

    setIsCapturing(true);
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Unable to get canvas context');
      }

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
          
          // Validate the captured file
          const validation = SecureFileHandler.validateFile(file);
          if (!validation.isValid) {
            setError(validation.error || 'Invalid captured image');
            setIsCapturing(false);
            return;
          }
          
          // Create secure URL for preview
          const secureUrl = SecureFileHandler.createSecureFileURL(file);
          setCapturedImage(secureUrl);
          onCapture(file);
        }
        setIsCapturing(false);
      }, 'image/jpeg', 0.8);
    } catch (error) {
      console.error('Error capturing selfie:', error);
      setError('Failed to capture selfie. Please try again.');
      setIsCapturing(false);
    }
  };

  const retakeSelfie = () => {
    if (capturedImage) {
      SecureFileHandler.secureRevokeURL(capturedImage);
    }
    setCapturedImage(null);
  };

  return (
    <div className="selfie-capture-step">
      <div className="step-header">
        <h4>Take a Selfie</h4>
        <p>Hold your ID next to your face and take a clear selfie</p>
      </div>
      
      <div className="camera-container">
        {!capturedImage ? (
          <div className="camera-feed-container">
            {cameraStream ? (
              <video 
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-feed"
              />
            ) : (
              <div className="camera-placeholder">
                <Camera className="w-16 h-16 text-gray-400" />
                <p>Loading camera...</p>
              </div>
            )}
          </div>
        ) : (
          <div className="captured-image-container">
            <img src={capturedImage} alt="Captured selfie" className="captured-image" />
          </div>
        )}
      </div>
      
      {error && (
        <div className="error-message">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
      
      <div className="capture-instructions">
        <h5>Instructions:</h5>
        <ul>
          <li>Hold your ID next to your face</li>
          <li>Look directly at the camera</li>
          <li>Ensure good lighting</li>
          <li>Make sure both your face and ID are clearly visible</li>
        </ul>
      </div>
      
      <div className="capture-actions">
        {!capturedImage ? (
          <button 
            onClick={captureSelfie}
            disabled={!cameraStream || isCapturing}
            className="btn-primary"
          >
            <Camera className="w-4 h-4 mr-2" />
            {isCapturing ? 'CAPTURING...' : 'CAPTURE SELFIE'}
          </button>
        ) : (
          <div className="capture-actions-group">
            <button 
              onClick={retakeSelfie}
              className="btn-secondary"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              RETAKE
            </button>
            <button 
              onClick={() => onCapture(new File([], 'selfie.jpg'))}
              className="btn-primary"
            >
              CONTINUE
            </button>
          </div>
        )}
      </div>
      
      {/* Hidden canvas for capturing */}
      <canvas 
        ref={canvasRef}
        style={{ display: 'none' }}
      />
    </div>
  );
};

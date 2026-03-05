import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getMobilePortalTarget } from '../utils/portal';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageData: string) => void;
}

export default function CameraCaptureModal({ isOpen, onClose, onCapture }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

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
    setError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Unable to access camera. Please ensure you have granted permissions.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      if (context) {
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get data URL
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        onCapture(imageData);
        onClose();
      }
    }
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-lg bg-stone-900 rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
              <span className="text-white font-medium">Take Photo</span>
              <button 
                onClick={onClose}
                className="p-2 bg-black/20 backdrop-blur-md text-white rounded-full hover:bg-black/40 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Video Preview */}
            <div className="relative aspect-[3/4] bg-black flex items-center justify-center overflow-hidden">
              {error ? (
                <div className="text-white text-center p-6">
                  <p className="mb-4 text-red-400">{error}</p>
                  <button 
                    onClick={startCamera}
                    className="px-4 py-2 bg-stone-800 rounded-full text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover"
                />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Controls */}
            <div className="p-6 bg-stone-900 flex justify-center items-center gap-8">
              {!error && (
                <button
                  onClick={handleCapture}
                  className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <div className="w-12 h-12 bg-white rounded-full" />
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, getMobilePortalTarget());
}

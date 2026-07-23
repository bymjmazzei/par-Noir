/**
 * Playback Controls Component
 * Controls for video playback: pause, volume, speed, captions
 */

import { useState, useRef, useEffect } from 'react';
import { Pause, Play, Volume2, VolumeX, Gauge, Subtitles } from 'lucide-react';

interface PlaybackControlsProps {
  videoElement: HTMLVideoElement | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  className?: string;
}

export function PlaybackControls({
  videoElement,
  isPlaying,
  onPlayPause,
  className = ''
}: PlaybackControlsProps) {
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [hasCaptions, setHasCaptions] = useState(false);
  const volumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync volume with video element
  useEffect(() => {
    if (!videoElement) return;

    const handleVolumeChange = () => {
      setVolume(videoElement.volume);
      setIsMuted(videoElement.muted);
    };

    videoElement.addEventListener('volumechange', handleVolumeChange);
    return () => videoElement.removeEventListener('volumechange', handleVolumeChange);
  }, [videoElement]);

  // Check for captions
  useEffect(() => {
    if (!videoElement) return;

    const tracks = videoElement.textTracks;
    setHasCaptions(tracks && tracks.length > 0);

    // Enable captions if available
    if (tracks && tracks.length > 0 && showCaptions) {
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'showing';
      }
    } else if (tracks && tracks.length > 0) {
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'hidden';
      }
    }
  }, [videoElement, showCaptions]);

  const handleVolumeChange = (newVolume: number) => {
    if (!videoElement) return;
    
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    videoElement.volume = clampedVolume;
    videoElement.muted = clampedVolume === 0;
    setIsMuted(clampedVolume === 0);
  };

  const handleMuteToggle = () => {
    if (!videoElement) return;
    
    videoElement.muted = !videoElement.muted;
    setIsMuted(videoElement.muted);
    if (!videoElement.muted && volume === 0) {
      videoElement.volume = 0.5;
      setVolume(0.5);
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (!videoElement) return;
    
    videoElement.playbackRate = speed;
    setPlaybackRate(speed);
    setShowSpeedMenu(false);
  };

  const handleCaptionsToggle = () => {
    setShowCaptions(!showCaptions);
  };

  const showVolumeSliderTemporarily = () => {
    setShowVolumeSlider(true);
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }
    volumeTimeoutRef.current = setTimeout(() => {
      setShowVolumeSlider(false);
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (volumeTimeoutRef.current) {
        clearTimeout(volumeTimeoutRef.current);
      }
    };
  }, []);

  if (!videoElement) return null;

  return (
    <div className={`flex items-center space-x-4 ${className}`}>
      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5 text-white" />
        ) : (
          <Play className="h-5 w-5 text-white" />
        )}
      </button>

      {/* Volume Control */}
      <div className="relative flex items-center">
        <button
          onClick={handleMuteToggle}
          onMouseEnter={showVolumeSliderTemporarily}
          className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="h-5 w-5 text-white" />
          ) : (
            <Volume2 className="h-5 w-5 text-white" />
          )}
        </button>

        {/* Volume Slider */}
        {showVolumeSlider && (
          <div
            className="absolute left-full ml-4 bg-black/80 rounded-lg p-3"
            onMouseEnter={() => {
              if (volumeTimeoutRef.current) {
                clearTimeout(volumeTimeoutRef.current);
              }
            }}
            onMouseLeave={() => {
              volumeTimeoutRef.current = setTimeout(() => {
                setShowVolumeSlider(false);
              }, 1000);
            }}
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-24 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume * 100}%, #374151 ${volume * 100}%, #374151 100%)`
              }}
            />
          </div>
        )}
      </div>

      {/* Speed Control */}
      <div className="relative">
        <button
          onClick={() => setShowSpeedMenu(!showSpeedMenu)}
          className={`p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors ${
            playbackRate !== 1 ? 'bg-blue-500/50' : ''
          }`}
          aria-label="Playback Speed"
        >
          <Gauge className="h-5 w-5 text-white" />
        </button>

        {showSpeedMenu && (
          <div className="absolute bottom-full mb-2 left-0 bg-black/90 rounded-lg overflow-hidden min-w-[120px]">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  playbackRate === speed
                    ? 'bg-blue-600 text-white'
                    : 'text-white hover:bg-neutral-800'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Captions */}
      {hasCaptions && (
        <button
          onClick={handleCaptionsToggle}
          className={`p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors ${
            showCaptions ? 'bg-blue-500/50' : ''
          }`}
          aria-label={showCaptions ? 'Hide Captions' : 'Show Captions'}
        >
          <Subtitles className="h-5 w-5 text-white" />
        </button>
      )}
    </div>
  );
}


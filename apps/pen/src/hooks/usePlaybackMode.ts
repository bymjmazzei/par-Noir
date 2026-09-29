import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  playbackMode,
  subscribePlaybackMode,
  type PlaybackMode
} from '../services/playbackMode';

/** Tracks edit vs publish. Publish updates flush so compose sees the original masters. */
export function usePlaybackMode(): PlaybackMode {
  const [mode, setMode] = useState(playbackMode);
  useEffect(() => {
    return subscribePlaybackMode(() => {
      flushSync(() => setMode(playbackMode()));
    });
  }, []);
  return mode;
}

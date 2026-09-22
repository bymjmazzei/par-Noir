/** First-party sticker pack for Pen ribbon (Vite-bundled assets). */

import star from '../assets/stickers/star.svg';
import heart from '../assets/stickers/heart.svg';
import spark from '../assets/stickers/spark.svg';
import check from '../assets/stickers/check.svg';
import fire from '../assets/stickers/fire.svg';
import thumb from '../assets/stickers/thumb.svg';
import smile from '../assets/stickers/smile.svg';
import bolt from '../assets/stickers/bolt.svg';
import pin from '../assets/stickers/pin.svg';
import flag from '../assets/stickers/flag.svg';
import leaf from '../assets/stickers/leaf.svg';
import moon from '../assets/stickers/moon.svg';

export interface PenSticker {
  id: string;
  src: string;
  label: string;
}

export const PEN_STICKERS: PenSticker[] = [
  { id: 'star', src: star, label: 'Star' },
  { id: 'heart', src: heart, label: 'Heart' },
  { id: 'spark', src: spark, label: 'Spark' },
  { id: 'check', src: check, label: 'Check' },
  { id: 'fire', src: fire, label: 'Fire' },
  { id: 'thumb', src: thumb, label: 'Thumbs up' },
  { id: 'smile', src: smile, label: 'Smile' },
  { id: 'bolt', src: bolt, label: 'Bolt' },
  { id: 'pin', src: pin, label: 'Pin' },
  { id: 'flag', src: flag, label: 'Flag' },
  { id: 'leaf', src: leaf, label: 'Leaf' },
  { id: 'moon', src: moon, label: 'Moon' }
];

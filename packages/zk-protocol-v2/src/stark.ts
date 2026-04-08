import { Buffer } from 'buffer';
import { instantiateScript } from '@guildofweavers/genstark';
import type { Stark } from '@guildofweavers/genstark';
import { noopLogger } from '@guildofweavers/genstark/lib/utils/Logger';
import { BIND_MIX_AIR_SCRIPT } from './airScriptSource';

let cached: Stark | null = null;

/** Single shared STARK instance (AirScript compile once). */
export function getBindMixStark(): Stark {
  if (!cached) {
    cached = instantiateScript(Buffer.from(BIND_MIX_AIR_SCRIPT, 'utf8'), { wasm: false }, noopLogger);
  }
  return cached;
}

export function starkProofToBase64(proof: import('@guildofweavers/genstark').StarkProof): string {
  const stark = getBindMixStark();
  const buf = stark.serialize(proof);
  return Buffer.from(buf).toString('base64');
}

export function starkProofFromBase64(b64: string): import('@guildofweavers/genstark').StarkProof {
  const stark = getBindMixStark();
  const buf = Buffer.from(b64.trim(), 'base64');
  return stark.parse(buf);
}

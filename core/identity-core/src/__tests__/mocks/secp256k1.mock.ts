/**
 * Mock for @noble/secp256k1 library
 * Provides the necessary functions for testing without ES module issues
 */

// Mock Point class
export class Point {
  static fromHex(hex: string): Point {
    return new Point();
  }
  
  toHex(): string {
    return 'mock-point-hex';
  }
  
  toRawBytes(): Uint8Array {
    return new Uint8Array(32);
  }
}

// Mock secp256k1 curve
export const secp256k1_CURVE = {
  n: BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
  p: BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
  Gx: BigInt('0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
  Gy: BigInt('0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'),
};

// Mock utility functions
export const utils = {
  randomPrivateKey: (): Uint8Array => {
    return new Uint8Array(32).fill(1);
  },
  randomBytes: (length: number): Uint8Array => {
    return new Uint8Array(length).fill(1);
  },
  sha256: async (message: Uint8Array): Promise<Uint8Array> => {
    return new Uint8Array(32).fill(1);
  },
};

// Mock signature functions
export const sign = async (message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> => {
  return new Uint8Array(64).fill(1);
};

export const signAsync = async (message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> => {
  return new Uint8Array(64).fill(1);
};

export const verify = async (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> => {
  return true;
};

// Mock key generation functions
export const getPublicKey = async (privateKey: Uint8Array): Promise<Uint8Array> => {
  return new Uint8Array(33).fill(1);
};

export const getSharedSecret = async (privateKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> => {
  return new Uint8Array(32).fill(1);
};

// Mock Signature class
export class Signature {
  constructor(r: bigint, s: bigint) {
    this.r = r;
    this.s = s;
  }
  
  r: bigint;
  s: bigint;
  
  toHex(): string {
    return 'mock-signature-hex';
  }
  
  toRawBytes(): Uint8Array {
    return new Uint8Array(64).fill(1);
  }
}

// Export everything as default for compatibility
export default {
  Point,
  secp256k1_CURVE,
  utils,
  sign,
  signAsync,
  verify,
  getPublicKey,
  getSharedSecret,
  Signature,
};

export function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

export function modMul(a: bigint, b: bigint, m: bigint): bigint {
  return mod(a * b, m);
}

export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let b = mod(base, m);
  let e = exp;
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = modMul(r, b, m);
    b = modMul(b, b, m);
    e >>= 1n;
  }
  return r;
}

/** Extended GCD; returns gcd and Bézout coeffs. */
function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x1, y1] = egcd(b, mod(a, b));
  return [g, y1, x1 - (a / b) * y1];
}

export function modInv(a: bigint, m: bigint): bigint {
  const [g, x] = egcd(mod(a, m), m);
  if (g !== 1n && g !== -1n) throw new Error('not_invertible');
  return mod(x, m);
}

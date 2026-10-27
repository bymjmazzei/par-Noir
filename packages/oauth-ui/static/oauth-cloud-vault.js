/* GENERATED from src/cloudVaultBrowser.ts by 'npm run build:vault-script'. Do not edit by hand. */
"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod2) => function __require() {
    return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
    mod2
  ));
  var __toCommonJS = (mod2) => __copyProps(__defProp({}, "__esModule", { value: true }), mod2);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // ../../node_modules/@noble/hashes/_u64.js
  function fromBig(n, le = false) {
    if (le)
      return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
    return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
  }
  function split(lst, le = false) {
    const len = lst.length;
    let Ah = new Uint32Array(len);
    let Al = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
      const { h, l } = fromBig(lst[i], le);
      [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
  }
  var U32_MASK64, _32n, rotlSH, rotlSL, rotlBH, rotlBL;
  var init_u64 = __esm({
    "../../node_modules/@noble/hashes/_u64.js"() {
      U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
      _32n = /* @__PURE__ */ BigInt(32);
      rotlSH = (h, l, s) => h << s | l >>> 32 - s;
      rotlSL = (h, l, s) => l << s | h >>> 32 - s;
      rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
      rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
    }
  });

  // ../../node_modules/@noble/hashes/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function anumber(n, title = "") {
    if (!Number.isSafeInteger(n) || n < 0) {
      const prefix = title && `"${title}" `;
      throw new Error(`${prefix}expected integer >= 0, got ${n}`);
    }
  }
  function abytes(value, length, title = "") {
    const bytes = isBytes(value);
    const len = value == null ? void 0 : value.length;
    const needsLen = length !== void 0;
    if (!bytes || needsLen && len !== length) {
      const prefix = title && `"${title}" `;
      const ofLen = needsLen ? ` of length ${length}` : "";
      const got = bytes ? `length=${len}` : `type=${typeof value}`;
      throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
    }
    return value;
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "digestInto() output");
    const min = instance.outputLen;
    if (out.length < min) {
      throw new Error('"digestInto() output" expected to be of length >=' + min);
    }
  }
  function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function byteSwap(word) {
    return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
  }
  function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = byteSwap(arr[i]);
    }
    return arr;
  }
  function concatBytes(...arrays) {
    let sum = 0;
    for (let i = 0; i < arrays.length; i++) {
      const a = arrays[i];
      abytes(a);
      sum += a.length;
    }
    const res = new Uint8Array(sum);
    for (let i = 0, pad = 0; i < arrays.length; i++) {
      const a = arrays[i];
      res.set(a, pad);
      pad += a.length;
    }
    return res;
  }
  function createHasher(hashCons, info = {}) {
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(void 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  function randomBytes(bytesLength = 32) {
    const cr = typeof globalThis === "object" ? globalThis.crypto : null;
    if (typeof (cr == null ? void 0 : cr.getRandomValues) !== "function")
      throw new Error("crypto.getRandomValues must be defined");
    return cr.getRandomValues(new Uint8Array(bytesLength));
  }
  var isLE, swap32IfBE, oidNist;
  var init_utils = __esm({
    "../../node_modules/@noble/hashes/utils.js"() {
      isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
      swap32IfBE = isLE ? (u) => u : byteSwap32;
      oidNist = (suffix) => ({
        oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
      });
    }
  });

  // ../../node_modules/@noble/hashes/sha3.js
  function keccakP(s, rounds = 24) {
    const B = new Uint32Array(5 * 2);
    for (let round = 24 - rounds; round < 24; round++) {
      for (let x = 0; x < 10; x++)
        B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
      for (let x = 0; x < 10; x += 2) {
        const idx1 = (x + 8) % 10;
        const idx0 = (x + 2) % 10;
        const B0 = B[idx0];
        const B1 = B[idx0 + 1];
        const Th = rotlH(B0, B1, 1) ^ B[idx1];
        const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
        for (let y = 0; y < 50; y += 10) {
          s[x + y] ^= Th;
          s[x + y + 1] ^= Tl;
        }
      }
      let curH = s[2];
      let curL = s[3];
      for (let t = 0; t < 24; t++) {
        const shift = SHA3_ROTL[t];
        const Th = rotlH(curH, curL, shift);
        const Tl = rotlL(curH, curL, shift);
        const PI = SHA3_PI[t];
        curH = s[PI];
        curL = s[PI + 1];
        s[PI] = Th;
        s[PI + 1] = Tl;
      }
      for (let y = 0; y < 50; y += 10) {
        for (let x = 0; x < 10; x++)
          B[x] = s[y + x];
        for (let x = 0; x < 10; x++)
          s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
      }
      s[0] ^= SHA3_IOTA_H[round];
      s[1] ^= SHA3_IOTA_L[round];
    }
    clean(B);
  }
  var _0n, _1n, _2n, _7n, _256n, _0x71n, SHA3_PI, SHA3_ROTL, _SHA3_IOTA, IOTAS, SHA3_IOTA_H, SHA3_IOTA_L, rotlH, rotlL, Keccak, genShake, shake128, shake256;
  var init_sha3 = __esm({
    "../../node_modules/@noble/hashes/sha3.js"() {
      init_u64();
      init_utils();
      _0n = BigInt(0);
      _1n = BigInt(1);
      _2n = BigInt(2);
      _7n = BigInt(7);
      _256n = BigInt(256);
      _0x71n = BigInt(113);
      SHA3_PI = [];
      SHA3_ROTL = [];
      _SHA3_IOTA = [];
      for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
        [x, y] = [y, (2 * x + 3 * y) % 5];
        SHA3_PI.push(2 * (5 * y + x));
        SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
        let t = _0n;
        for (let j = 0; j < 7; j++) {
          R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
          if (R & _2n)
            t ^= _1n << (_1n << BigInt(j)) - _1n;
        }
        _SHA3_IOTA.push(t);
      }
      IOTAS = split(_SHA3_IOTA, true);
      SHA3_IOTA_H = IOTAS[0];
      SHA3_IOTA_L = IOTAS[1];
      rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
      rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
      Keccak = class _Keccak {
        // NOTE: we accept arguments in bytes instead of bits here.
        constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
          __publicField(this, "state");
          __publicField(this, "pos", 0);
          __publicField(this, "posOut", 0);
          __publicField(this, "finished", false);
          __publicField(this, "state32");
          __publicField(this, "destroyed", false);
          __publicField(this, "blockLen");
          __publicField(this, "suffix");
          __publicField(this, "outputLen");
          __publicField(this, "enableXOF", false);
          __publicField(this, "rounds");
          this.blockLen = blockLen;
          this.suffix = suffix;
          this.outputLen = outputLen;
          this.enableXOF = enableXOF;
          this.rounds = rounds;
          anumber(outputLen, "outputLen");
          if (!(0 < blockLen && blockLen < 200))
            throw new Error("only keccak-f1600 function is supported");
          this.state = new Uint8Array(200);
          this.state32 = u32(this.state);
        }
        clone() {
          return this._cloneInto();
        }
        keccak() {
          swap32IfBE(this.state32);
          keccakP(this.state32, this.rounds);
          swap32IfBE(this.state32);
          this.posOut = 0;
          this.pos = 0;
        }
        update(data) {
          aexists(this);
          abytes(data);
          const { blockLen, state } = this;
          const len = data.length;
          for (let pos = 0; pos < len; ) {
            const take = Math.min(blockLen - this.pos, len - pos);
            for (let i = 0; i < take; i++)
              state[this.pos++] ^= data[pos++];
            if (this.pos === blockLen)
              this.keccak();
          }
          return this;
        }
        finish() {
          if (this.finished)
            return;
          this.finished = true;
          const { state, suffix, pos, blockLen } = this;
          state[pos] ^= suffix;
          if ((suffix & 128) !== 0 && pos === blockLen - 1)
            this.keccak();
          state[blockLen - 1] ^= 128;
          this.keccak();
        }
        writeInto(out) {
          aexists(this, false);
          abytes(out);
          this.finish();
          const bufferOut = this.state;
          const { blockLen } = this;
          for (let pos = 0, len = out.length; pos < len; ) {
            if (this.posOut >= blockLen)
              this.keccak();
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
          }
          return out;
        }
        xofInto(out) {
          if (!this.enableXOF)
            throw new Error("XOF is not possible for this instance");
          return this.writeInto(out);
        }
        xof(bytes) {
          anumber(bytes);
          return this.xofInto(new Uint8Array(bytes));
        }
        digestInto(out) {
          aoutput(out, this);
          if (this.finished)
            throw new Error("digest() was already called");
          this.writeInto(out);
          this.destroy();
          return out;
        }
        digest() {
          return this.digestInto(new Uint8Array(this.outputLen));
        }
        destroy() {
          this.destroyed = true;
          clean(this.state);
        }
        _cloneInto(to) {
          const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
          to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
          to.state32.set(this.state32);
          to.pos = this.pos;
          to.posOut = this.posOut;
          to.finished = this.finished;
          to.rounds = rounds;
          to.suffix = suffix;
          to.outputLen = outputLen;
          to.enableXOF = enableXOF;
          to.destroyed = this.destroyed;
          return to;
        }
      };
      genShake = (suffix, blockLen, outputLen, info = {}) => createHasher((opts = {}) => new Keccak(blockLen, suffix, opts.dkLen === void 0 ? outputLen : opts.dkLen, true), info);
      shake128 = /* @__PURE__ */ genShake(31, 168, 16, /* @__PURE__ */ oidNist(11));
      shake256 = /* @__PURE__ */ genShake(31, 136, 32, /* @__PURE__ */ oidNist(12));
    }
  });

  // ../../node_modules/@noble/curves/utils.js
  function abool(value, title = "") {
    if (typeof value !== "boolean") {
      const prefix = title && `"${title}" `;
      throw new Error(prefix + "expected boolean, got type=" + typeof value);
    }
    return value;
  }
  var init_utils2 = __esm({
    "../../node_modules/@noble/curves/utils.js"() {
    }
  });

  // ../../node_modules/@noble/curves/abstract/fft.js
  function checkU32(n) {
    if (!Number.isSafeInteger(n) || n < 0 || n > 4294967295)
      throw new Error("wrong u32 integer:" + n);
    return n;
  }
  function isPowerOfTwo(x) {
    checkU32(x);
    return (x & x - 1) === 0 && x !== 0;
  }
  function reverseBits(n, bits) {
    checkU32(n);
    let reversed = 0;
    for (let i = 0; i < bits; i++, n >>>= 1)
      reversed = reversed << 1 | n & 1;
    return reversed;
  }
  function log2(n) {
    checkU32(n);
    return 31 - Math.clz32(n);
  }
  function bitReversalInplace(values) {
    const n = values.length;
    if (n < 2 || !isPowerOfTwo(n))
      throw new Error("n must be a power of 2 and greater than 1. Got " + n);
    const bits = log2(n);
    for (let i = 0; i < n; i++) {
      const j = reverseBits(i, bits);
      if (i < j) {
        const tmp = values[i];
        values[i] = values[j];
        values[j] = tmp;
      }
    }
    return values;
  }
  var FFTCore;
  var init_fft = __esm({
    "../../node_modules/@noble/curves/abstract/fft.js"() {
      FFTCore = (F2, coreOpts) => {
        const { N: N2, roots, dit, invertButterflies = false, skipStages = 0, brp = true } = coreOpts;
        const bits = log2(N2);
        if (!isPowerOfTwo(N2))
          throw new Error("FFT: Polynomial size should be power of two");
        const isDit = dit !== invertButterflies;
        isDit;
        return (values) => {
          if (values.length !== N2)
            throw new Error("FFT: wrong Polynomial length");
          if (dit && brp)
            bitReversalInplace(values);
          for (let i = 0, g = 1; i < bits - skipStages; i++) {
            const s = dit ? i + 1 + skipStages : bits - i;
            const m = 1 << s;
            const m2 = m >> 1;
            const stride = N2 >> s;
            for (let k = 0; k < N2; k += m) {
              for (let j = 0, grp = g++; j < m2; j++) {
                const rootPos = invertButterflies ? dit ? N2 - grp : grp : j * stride;
                const i0 = k + j;
                const i1 = k + j + m2;
                const omega = roots[rootPos];
                const b = values[i1];
                const a = values[i0];
                if (isDit) {
                  const t = F2.mul(b, omega);
                  values[i0] = F2.add(a, t);
                  values[i1] = F2.sub(a, t);
                } else if (invertButterflies) {
                  values[i0] = F2.add(b, a);
                  values[i1] = F2.mul(F2.sub(b, a), omega);
                } else {
                  values[i0] = F2.add(a, b);
                  values[i1] = F2.mul(F2.sub(a, b), omega);
                }
              }
            }
          }
          if (!dit && brp)
            bitReversalInplace(values);
          return values;
        };
      };
    }
  });

  // ../../node_modules/@noble/post-quantum/utils.js
  function equalBytes(a, b) {
    if (a.length !== b.length)
      return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
      diff |= a[i] ^ b[i];
    return diff === 0;
  }
  function validateOpts(opts) {
    if (typeof opts !== "object" || opts === null || isBytes(opts))
      throw new Error("expected opts to be an object");
  }
  function validateVerOpts(opts) {
    validateOpts(opts);
    if (opts.context !== void 0)
      abytes(opts.context, void 0, "opts.context");
  }
  function validateSigOpts(opts) {
    validateVerOpts(opts);
    if (opts.extraEntropy !== false && opts.extraEntropy !== void 0)
      abytes(opts.extraEntropy, void 0, "opts.extraEntropy");
  }
  function splitCoder(label, ...lengths) {
    const getLength = (c) => typeof c === "number" ? c : c.bytesLen;
    const bytesLen = lengths.reduce((sum, a) => sum + getLength(a), 0);
    return {
      bytesLen,
      encode: (bufs) => {
        const res = new Uint8Array(bytesLen);
        for (let i = 0, pos = 0; i < lengths.length; i++) {
          const c = lengths[i];
          const l = getLength(c);
          const b = typeof c === "number" ? bufs[i] : c.encode(bufs[i]);
          abytes(b, l, label);
          res.set(b, pos);
          if (typeof c !== "number")
            b.fill(0);
          pos += l;
        }
        return res;
      },
      decode: (buf) => {
        abytes(buf, bytesLen, label);
        const res = [];
        for (const c of lengths) {
          const l = getLength(c);
          const b = buf.subarray(0, l);
          res.push(typeof c === "number" ? b : c.decode(b));
          buf = buf.subarray(l);
        }
        return res;
      }
    };
  }
  function vecCoder(c, vecLen) {
    const bytesLen = vecLen * c.bytesLen;
    return {
      bytesLen,
      encode: (u) => {
        if (u.length !== vecLen)
          throw new Error(`vecCoder.encode: wrong length=${u.length}. Expected: ${vecLen}`);
        const res = new Uint8Array(bytesLen);
        for (let i = 0, pos = 0; i < u.length; i++) {
          const b = c.encode(u[i]);
          res.set(b, pos);
          b.fill(0);
          pos += b.length;
        }
        return res;
      },
      decode: (a) => {
        abytes(a, bytesLen);
        const r = [];
        for (let i = 0; i < a.length; i += c.bytesLen)
          r.push(c.decode(a.subarray(i, i + c.bytesLen)));
        return r;
      }
    };
  }
  function cleanBytes(...list) {
    for (const t of list) {
      if (Array.isArray(t))
        for (const b of t)
          b.fill(0);
      else
        t.fill(0);
    }
  }
  function getMask(bits) {
    return (1 << bits) - 1;
  }
  function getMessage(msg, ctx = EMPTY) {
    abytes(msg);
    abytes(ctx);
    if (ctx.length > 255)
      throw new Error("context should be less than 255 bytes");
    return concatBytes(new Uint8Array([0, ctx.length]), ctx, msg);
  }
  function checkHash(hash, requiredStrength = 0) {
    if (!hash.oid || !equalBytes(hash.oid.subarray(0, 10), oidNistP))
      throw new Error("hash.oid is invalid: expected NIST hash");
    const collisionResistance = hash.outputLen * 8 / 2;
    if (requiredStrength > collisionResistance) {
      throw new Error("Pre-hash security strength too low: " + collisionResistance + ", required: " + requiredStrength);
    }
  }
  function getMessagePrehash(hash, msg, ctx = EMPTY) {
    abytes(msg);
    abytes(ctx);
    if (ctx.length > 255)
      throw new Error("context should be less than 255 bytes");
    const hashed = hash(msg);
    return concatBytes(new Uint8Array([1, ctx.length]), ctx, hash.oid, hashed);
  }
  var randomBytes2, EMPTY, oidNistP;
  var init_utils3 = __esm({
    "../../node_modules/@noble/post-quantum/utils.js"() {
      init_utils();
      init_utils();
      randomBytes2 = randomBytes;
      EMPTY = Uint8Array.of();
      oidNistP = /* @__PURE__ */ Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2]);
    }
  });

  // ../../node_modules/@noble/post-quantum/_crystals.js
  var genCrystals, createXofShake, XOF128, XOF256;
  var init_crystals = __esm({
    "../../node_modules/@noble/post-quantum/_crystals.js"() {
      init_fft();
      init_sha3();
      init_utils3();
      genCrystals = (opts) => {
        const { newPoly: newPoly2, N: N2, Q: Q2, F: F2, ROOT_OF_UNITY: ROOT_OF_UNITY2, brvBits, isKyber } = opts;
        const mod2 = (a, modulo = Q2) => {
          const result = a % modulo | 0;
          return (result >= 0 ? result | 0 : modulo + result | 0) | 0;
        };
        const smod2 = (a, modulo = Q2) => {
          const r = mod2(a, modulo) | 0;
          return (r > modulo >> 1 ? r - modulo | 0 : r) | 0;
        };
        function getZettas() {
          const out = newPoly2(N2);
          for (let i = 0; i < N2; i++) {
            const b = reverseBits(i, brvBits);
            const p = BigInt(ROOT_OF_UNITY2) ** BigInt(b) % BigInt(Q2);
            out[i] = Number(p) | 0;
          }
          return out;
        }
        const nttZetas = getZettas();
        const field = {
          add: (a, b) => mod2((a | 0) + (b | 0)) | 0,
          sub: (a, b) => mod2((a | 0) - (b | 0)) | 0,
          mul: (a, b) => mod2((a | 0) * (b | 0)) | 0,
          inv: (_a) => {
            throw new Error("not implemented");
          }
        };
        const nttOpts = {
          N: N2,
          roots: nttZetas,
          invertButterflies: true,
          skipStages: isKyber ? 1 : 0,
          brp: false
        };
        const dif = FFTCore(field, __spreadValues({ dit: false }, nttOpts));
        const dit = FFTCore(field, __spreadValues({ dit: true }, nttOpts));
        const NTT2 = {
          encode: (r) => {
            return dif(r);
          },
          decode: (r) => {
            dit(r);
            for (let i = 0; i < r.length; i++)
              r[i] = mod2(F2 * r[i]);
            return r;
          }
        };
        const bitsCoder2 = (d, c) => {
          const mask = getMask(d);
          const bytesLen = d * (N2 / 8);
          return {
            bytesLen,
            encode: (poly) => {
              const r = new Uint8Array(bytesLen);
              for (let i = 0, buf = 0, bufLen = 0, pos = 0; i < poly.length; i++) {
                buf |= (c.encode(poly[i]) & mask) << bufLen;
                bufLen += d;
                for (; bufLen >= 8; bufLen -= 8, buf >>= 8)
                  r[pos++] = buf & getMask(bufLen);
              }
              return r;
            },
            decode: (bytes) => {
              const r = newPoly2(N2);
              for (let i = 0, buf = 0, bufLen = 0, pos = 0; i < bytes.length; i++) {
                buf |= bytes[i] << bufLen;
                bufLen += 8;
                for (; bufLen >= d; bufLen -= d, buf >>= d)
                  r[pos++] = c.decode(buf & mask);
              }
              return r;
            }
          };
        };
        return { mod: mod2, smod: smod2, nttZetas, NTT: NTT2, bitsCoder: bitsCoder2 };
      };
      createXofShake = (shake) => (seed, blockLen) => {
        if (!blockLen)
          blockLen = shake.blockLen;
        const _seed = new Uint8Array(seed.length + 2);
        _seed.set(seed);
        const seedLen = seed.length;
        const buf = new Uint8Array(blockLen);
        let h = shake.create({});
        let calls = 0;
        let xofs = 0;
        return {
          stats: () => ({ calls, xofs }),
          get: (x, y) => {
            _seed[seedLen + 0] = x;
            _seed[seedLen + 1] = y;
            h.destroy();
            h = shake.create({}).update(_seed);
            calls++;
            return () => {
              xofs++;
              return h.xofInto(buf);
            };
          },
          clean: () => {
            h.destroy();
            cleanBytes(buf, _seed);
          }
        };
      };
      XOF128 = /* @__PURE__ */ createXofShake(shake128);
      XOF256 = /* @__PURE__ */ createXofShake(shake256);
    }
  });

  // ../../node_modules/@noble/post-quantum/ml-dsa.js
  var ml_dsa_exports = {};
  __export(ml_dsa_exports, {
    PARAMS: () => PARAMS,
    ml_dsa44: () => ml_dsa44,
    ml_dsa65: () => ml_dsa65,
    ml_dsa87: () => ml_dsa87
  });
  function validateInternalOpts(opts) {
    validateOpts(opts);
    if (opts.externalMu !== void 0)
      abool(opts.externalMu, "opts.externalMu");
  }
  function RejNTTPoly(xof) {
    const r = newPoly(N);
    for (let j = 0; j < N; ) {
      const b = xof();
      if (b.length % 3)
        throw new Error("RejNTTPoly: unaligned block");
      for (let i = 0; j < N && i <= b.length - 3; i += 3) {
        const t = (b[i + 0] | b[i + 1] << 8 | b[i + 2] << 16) & 8388607;
        if (t < Q)
          r[j++] = t;
      }
    }
    return r;
  }
  function getDilithium(opts) {
    const { K, L, GAMMA1, GAMMA2, TAU, ETA, OMEGA } = opts;
    const { CRH_BYTES, TR_BYTES, C_TILDE_BYTES, XOF128: XOF1282, XOF256: XOF2562, securityLevel } = opts;
    if (![2, 4].includes(ETA))
      throw new Error("Wrong ETA");
    if (![1 << 17, 1 << 19].includes(GAMMA1))
      throw new Error("Wrong GAMMA1");
    if (![GAMMA2_1, GAMMA2_2].includes(GAMMA2))
      throw new Error("Wrong GAMMA2");
    const BETA = TAU * ETA;
    const decompose = (r) => {
      const rPlus = mod(r);
      const r0 = smod(rPlus, 2 * GAMMA2) | 0;
      if (rPlus - r0 === Q - 1)
        return { r1: 0 | 0, r0: r0 - 1 | 0 };
      const r1 = Math.floor((rPlus - r0) / (2 * GAMMA2)) | 0;
      return { r1, r0 };
    };
    const HighBits = (r) => decompose(r).r1;
    const LowBits = (r) => decompose(r).r0;
    const MakeHint = (z, r) => {
      const res0 = z <= GAMMA2 || z > Q - GAMMA2 || z === Q - GAMMA2 && r === 0 ? 0 : 1;
      return res0;
    };
    const UseHint = (h, r) => {
      const m = Math.floor((Q - 1) / (2 * GAMMA2));
      const { r1, r0 } = decompose(r);
      if (h === 1)
        return r0 > 0 ? mod(r1 + 1, m) | 0 : mod(r1 - 1, m) | 0;
      return r1 | 0;
    };
    const Power2Round = (r) => {
      const rPlus = mod(r);
      const r0 = smod(rPlus, 2 ** D) | 0;
      return { r1: Math.floor((rPlus - r0) / 2 ** D) | 0, r0 };
    };
    const hintCoder = {
      bytesLen: OMEGA + K,
      encode: (h) => {
        if (h === false)
          throw new Error("hint.encode: hint is false");
        const res = new Uint8Array(OMEGA + K);
        for (let i = 0, k = 0; i < K; i++) {
          for (let j = 0; j < N; j++)
            if (h[i][j] !== 0)
              res[k++] = j;
          res[OMEGA + i] = k;
        }
        return res;
      },
      decode: (buf) => {
        const h = [];
        let k = 0;
        for (let i = 0; i < K; i++) {
          const hi = newPoly(N);
          if (buf[OMEGA + i] < k || buf[OMEGA + i] > OMEGA)
            return false;
          for (let j = k; j < buf[OMEGA + i]; j++) {
            if (j > k && buf[j] <= buf[j - 1])
              return false;
            hi[buf[j]] = 1;
          }
          k = buf[OMEGA + i];
          h.push(hi);
        }
        for (let j = k; j < OMEGA; j++)
          if (buf[j] !== 0)
            return false;
        return h;
      }
    };
    const ETACoder = polyCoder(ETA === 2 ? 3 : 4, (i) => ETA - i, (i) => {
      if (!(-ETA <= i && i <= ETA))
        throw new Error(`malformed key s1/s3 ${i} outside of ETA range [${-ETA}, ${ETA}]`);
      return i;
    });
    const T0Coder = polyCoder(13, (i) => (1 << D - 1) - i);
    const T1Coder = polyCoder(10);
    const ZCoder = polyCoder(GAMMA1 === 1 << 17 ? 18 : 20, (i) => smod(GAMMA1 - i));
    const W1Coder = polyCoder(GAMMA2 === GAMMA2_1 ? 6 : 4);
    const W1Vec = vecCoder(W1Coder, K);
    const publicCoder = splitCoder("publicKey", 32, vecCoder(T1Coder, K));
    const secretCoder = splitCoder("secretKey", 32, 32, TR_BYTES, vecCoder(ETACoder, L), vecCoder(ETACoder, K), vecCoder(T0Coder, K));
    const sigCoder = splitCoder("signature", C_TILDE_BYTES, vecCoder(ZCoder, L), hintCoder);
    const CoefFromHalfByte = ETA === 2 ? (n) => n < 15 ? 2 - n % 5 : false : (n) => n < 9 ? 4 - n : false;
    function RejBoundedPoly(xof) {
      const r = newPoly(N);
      for (let j = 0; j < N; ) {
        const b = xof();
        for (let i = 0; j < N && i < b.length; i += 1) {
          const d1 = CoefFromHalfByte(b[i] & 15);
          const d2 = CoefFromHalfByte(b[i] >> 4 & 15);
          if (d1 !== false)
            r[j++] = d1;
          if (j < N && d2 !== false)
            r[j++] = d2;
        }
      }
      return r;
    }
    const SampleInBall = (seed) => {
      const pre = newPoly(N);
      const s = shake256.create({}).update(seed);
      const buf = new Uint8Array(shake256.blockLen);
      s.xofInto(buf);
      const masks = buf.slice(0, 8);
      for (let i = N - TAU, pos = 8, maskPos = 0, maskBit = 0; i < N; i++) {
        let b = i + 1;
        for (; b > i; ) {
          b = buf[pos++];
          if (pos < shake256.blockLen)
            continue;
          s.xofInto(buf);
          pos = 0;
        }
        pre[i] = pre[b];
        pre[b] = 1 - ((masks[maskPos] >> maskBit++ & 1) << 1);
        if (maskBit >= 8) {
          maskPos++;
          maskBit = 0;
        }
      }
      return pre;
    };
    const polyPowerRound = (p) => {
      const res0 = newPoly(N);
      const res1 = newPoly(N);
      for (let i = 0; i < p.length; i++) {
        const { r0, r1 } = Power2Round(p[i]);
        res0[i] = r0;
        res1[i] = r1;
      }
      return { r0: res0, r1: res1 };
    };
    const polyUseHint = (u, h) => {
      for (let i = 0; i < N; i++)
        u[i] = UseHint(h[i], u[i]);
      return u;
    };
    const polyMakeHint = (a, b) => {
      const v = newPoly(N);
      let cnt = 0;
      for (let i = 0; i < N; i++) {
        const h = MakeHint(a[i], b[i]);
        v[i] = h;
        cnt += h;
      }
      return { v, cnt };
    };
    const signRandBytes = 32;
    const seedCoder = splitCoder("seed", 32, 64, 32);
    const internal = {
      info: { type: "internal-ml-dsa" },
      lengths: {
        secretKey: secretCoder.bytesLen,
        publicKey: publicCoder.bytesLen,
        seed: 32,
        signature: sigCoder.bytesLen,
        signRand: signRandBytes
      },
      keygen: (seed) => {
        const seedDst = new Uint8Array(32 + 2);
        const randSeed = seed === void 0;
        if (randSeed)
          seed = randomBytes2(32);
        abytes(seed, 32, "seed");
        seedDst.set(seed);
        if (randSeed)
          cleanBytes(seed);
        seedDst[32] = K;
        seedDst[33] = L;
        const [rho, rhoPrime, K_] = seedCoder.decode(shake256(seedDst, { dkLen: seedCoder.bytesLen }));
        const xofPrime = XOF2562(rhoPrime);
        const s1 = [];
        for (let i = 0; i < L; i++)
          s1.push(RejBoundedPoly(xofPrime.get(i & 255, i >> 8 & 255)));
        const s2 = [];
        for (let i = L; i < L + K; i++)
          s2.push(RejBoundedPoly(xofPrime.get(i & 255, i >> 8 & 255)));
        const s1Hat = s1.map((i) => NTT.encode(i.slice()));
        const t0 = [];
        const t1 = [];
        const xof = XOF1282(rho);
        const t = newPoly(N);
        for (let i = 0; i < K; i++) {
          cleanBytes(t);
          for (let j = 0; j < L; j++) {
            const aij = RejNTTPoly(xof.get(j, i));
            polyAdd(t, MultiplyNTTs(aij, s1Hat[j]));
          }
          NTT.decode(t);
          const { r0, r1 } = polyPowerRound(polyAdd(t, s2[i]));
          t0.push(r0);
          t1.push(r1);
        }
        const publicKey = publicCoder.encode([rho, t1]);
        const tr = shake256(publicKey, { dkLen: TR_BYTES });
        const secretKey = secretCoder.encode([rho, K_, tr, s1, s2, t0]);
        xof.clean();
        xofPrime.clean();
        cleanBytes(rho, rhoPrime, K_, s1, s2, s1Hat, t, t0, t1, tr, seedDst);
        return { publicKey, secretKey };
      },
      getPublicKey: (secretKey) => {
        const [rho, _K, _tr, s1, s2, _t0] = secretCoder.decode(secretKey);
        const xof = XOF1282(rho);
        const s1Hat = s1.map((p) => NTT.encode(p.slice()));
        const t1 = [];
        const tmp = newPoly(N);
        for (let i = 0; i < K; i++) {
          tmp.fill(0);
          for (let j = 0; j < L; j++) {
            const aij = RejNTTPoly(xof.get(j, i));
            polyAdd(tmp, MultiplyNTTs(aij, s1Hat[j]));
          }
          NTT.decode(tmp);
          polyAdd(tmp, s2[i]);
          const { r1 } = polyPowerRound(tmp);
          t1.push(r1);
        }
        xof.clean();
        cleanBytes(tmp, s1Hat, _t0, s1, s2);
        return publicCoder.encode([rho, t1]);
      },
      // NOTE: random is optional.
      sign: (msg, secretKey, opts2 = {}) => {
        validateSigOpts(opts2);
        validateInternalOpts(opts2);
        let { extraEntropy: random, externalMu = false } = opts2;
        const [rho, _K, tr, s1, s2, t0] = secretCoder.decode(secretKey);
        const A = [];
        const xof = XOF1282(rho);
        for (let i = 0; i < K; i++) {
          const pv = [];
          for (let j = 0; j < L; j++)
            pv.push(RejNTTPoly(xof.get(j, i)));
          A.push(pv);
        }
        xof.clean();
        for (let i = 0; i < L; i++)
          NTT.encode(s1[i]);
        for (let i = 0; i < K; i++) {
          NTT.encode(s2[i]);
          NTT.encode(t0[i]);
        }
        const mu = externalMu ? msg : shake256.create({ dkLen: CRH_BYTES }).update(tr).update(msg).digest();
        const rnd = random === false ? new Uint8Array(32) : random === void 0 ? randomBytes2(signRandBytes) : random;
        abytes(rnd, 32, "extraEntropy");
        const rhoprime = shake256.create({ dkLen: CRH_BYTES }).update(_K).update(rnd).update(mu).digest();
        abytes(rhoprime, CRH_BYTES);
        const x256 = XOF2562(rhoprime, ZCoder.bytesLen);
        main_loop: for (let kappa = 0; ; ) {
          const y = [];
          for (let i = 0; i < L; i++, kappa++)
            y.push(ZCoder.decode(x256.get(kappa & 255, kappa >> 8)()));
          const z = y.map((i) => NTT.encode(i.slice()));
          const w2 = [];
          for (let i = 0; i < K; i++) {
            const wi = newPoly(N);
            for (let j = 0; j < L; j++)
              polyAdd(wi, MultiplyNTTs(A[i][j], z[j]));
            NTT.decode(wi);
            w2.push(wi);
          }
          const w1 = w2.map((j) => j.map(HighBits));
          const cTilde = shake256.create({ dkLen: C_TILDE_BYTES }).update(mu).update(W1Vec.encode(w1)).digest();
          const cHat = NTT.encode(SampleInBall(cTilde));
          const cs1 = s1.map((i) => MultiplyNTTs(i, cHat));
          for (let i = 0; i < L; i++) {
            polyAdd(NTT.decode(cs1[i]), y[i]);
            if (polyChknorm(cs1[i], GAMMA1 - BETA))
              continue main_loop;
          }
          let cnt = 0;
          const h = [];
          for (let i = 0; i < K; i++) {
            const cs2 = NTT.decode(MultiplyNTTs(s2[i], cHat));
            const r0 = polySub(w2[i], cs2).map(LowBits);
            if (polyChknorm(r0, GAMMA2 - BETA))
              continue main_loop;
            const ct0 = NTT.decode(MultiplyNTTs(t0[i], cHat));
            if (polyChknorm(ct0, GAMMA2))
              continue main_loop;
            polyAdd(r0, ct0);
            const hint = polyMakeHint(r0, w1[i]);
            h.push(hint.v);
            cnt += hint.cnt;
          }
          if (cnt > OMEGA)
            continue;
          x256.clean();
          const res = sigCoder.encode([cTilde, cs1, h]);
          cleanBytes(cTilde, cs1, h, cHat, w1, w2, z, y, rhoprime, mu, s1, s2, t0, ...A);
          return res;
        }
        throw new Error("Unreachable code path reached, report this error");
      },
      verify: (sig, msg, publicKey, opts2 = {}) => {
        validateInternalOpts(opts2);
        const { externalMu = false } = opts2;
        const [rho, t1] = publicCoder.decode(publicKey);
        const tr = shake256(publicKey, { dkLen: TR_BYTES });
        if (sig.length !== sigCoder.bytesLen)
          return false;
        const [cTilde, z, h] = sigCoder.decode(sig);
        if (h === false)
          return false;
        for (let i = 0; i < L; i++)
          if (polyChknorm(z[i], GAMMA1 - BETA))
            return false;
        const mu = externalMu ? msg : shake256.create({ dkLen: CRH_BYTES }).update(tr).update(msg).digest();
        const c = NTT.encode(SampleInBall(cTilde));
        const zNtt = z.map((i) => i.slice());
        for (let i = 0; i < L; i++)
          NTT.encode(zNtt[i]);
        const wTick1 = [];
        const xof = XOF1282(rho);
        for (let i = 0; i < K; i++) {
          const ct12d = MultiplyNTTs(NTT.encode(polyShiftl(t1[i])), c);
          const Az = newPoly(N);
          for (let j = 0; j < L; j++) {
            const aij = RejNTTPoly(xof.get(j, i));
            polyAdd(Az, MultiplyNTTs(aij, zNtt[j]));
          }
          const wApprox = NTT.decode(polySub(Az, ct12d));
          wTick1.push(polyUseHint(wApprox, h[i]));
        }
        xof.clean();
        const c2 = shake256.create({ dkLen: C_TILDE_BYTES }).update(mu).update(W1Vec.encode(wTick1)).digest();
        for (const t of h) {
          const sum = t.reduce((acc, i) => acc + i, 0);
          if (!(sum <= OMEGA))
            return false;
        }
        for (const t of z)
          if (polyChknorm(t, GAMMA1 - BETA))
            return false;
        return equalBytes(cTilde, c2);
      }
    };
    return {
      info: { type: "ml-dsa" },
      internal,
      securityLevel,
      keygen: internal.keygen,
      lengths: internal.lengths,
      getPublicKey: internal.getPublicKey,
      sign: (msg, secretKey, opts2 = {}) => {
        validateSigOpts(opts2);
        const M = getMessage(msg, opts2.context);
        const res = internal.sign(M, secretKey, opts2);
        cleanBytes(M);
        return res;
      },
      verify: (sig, msg, publicKey, opts2 = {}) => {
        validateVerOpts(opts2);
        return internal.verify(sig, getMessage(msg, opts2.context), publicKey);
      },
      prehash: (hash) => {
        checkHash(hash, securityLevel);
        return {
          info: { type: "hashml-dsa" },
          securityLevel,
          lengths: internal.lengths,
          keygen: internal.keygen,
          getPublicKey: internal.getPublicKey,
          sign: (msg, secretKey, opts2 = {}) => {
            validateSigOpts(opts2);
            const M = getMessagePrehash(hash, msg, opts2.context);
            const res = internal.sign(M, secretKey, opts2);
            cleanBytes(M);
            return res;
          },
          verify: (sig, msg, publicKey, opts2 = {}) => {
            validateVerOpts(opts2);
            return internal.verify(sig, getMessagePrehash(hash, msg, opts2.context), publicKey);
          }
        };
      }
    };
  }
  var N, Q, ROOT_OF_UNITY, F, D, GAMMA2_1, GAMMA2_2, PARAMS, newPoly, mod, smod, NTT, bitsCoder, id, polyCoder, polyAdd, polySub, polyShiftl, polyChknorm, MultiplyNTTs, ml_dsa44, ml_dsa65, ml_dsa87;
  var init_ml_dsa = __esm({
    "../../node_modules/@noble/post-quantum/ml-dsa.js"() {
      init_utils2();
      init_sha3();
      init_crystals();
      init_utils3();
      N = 256;
      Q = 8380417;
      ROOT_OF_UNITY = 1753;
      F = 8347681;
      D = 13;
      GAMMA2_1 = Math.floor((Q - 1) / 88) | 0;
      GAMMA2_2 = Math.floor((Q - 1) / 32) | 0;
      PARAMS = {
        2: { K: 4, L: 4, D, GAMMA1: 2 ** 17, GAMMA2: GAMMA2_1, TAU: 39, ETA: 2, OMEGA: 80 },
        3: { K: 6, L: 5, D, GAMMA1: 2 ** 19, GAMMA2: GAMMA2_2, TAU: 49, ETA: 4, OMEGA: 55 },
        5: { K: 8, L: 7, D, GAMMA1: 2 ** 19, GAMMA2: GAMMA2_2, TAU: 60, ETA: 2, OMEGA: 75 }
      };
      newPoly = (n) => new Int32Array(n);
      ({ mod, smod, NTT, bitsCoder } = genCrystals({
        N,
        Q,
        F,
        ROOT_OF_UNITY,
        newPoly,
        isKyber: false,
        brvBits: 8
      }));
      id = (n) => n;
      polyCoder = (d, compress = id, verify = id) => bitsCoder(d, {
        encode: (i) => compress(verify(i)),
        decode: (i) => verify(compress(i))
      });
      polyAdd = (a, b) => {
        for (let i = 0; i < a.length; i++)
          a[i] = mod(a[i] + b[i]);
        return a;
      };
      polySub = (a, b) => {
        for (let i = 0; i < a.length; i++)
          a[i] = mod(a[i] - b[i]);
        return a;
      };
      polyShiftl = (p) => {
        for (let i = 0; i < N; i++)
          p[i] <<= D;
        return p;
      };
      polyChknorm = (p, B) => {
        for (let i = 0; i < N; i++)
          if (Math.abs(smod(p[i])) >= B)
            return true;
        return false;
      };
      MultiplyNTTs = (a, b) => {
        const c = newPoly(N);
        for (let i = 0; i < a.length; i++)
          c[i] = mod(a[i] * b[i]);
        return c;
      };
      ml_dsa44 = /* @__PURE__ */ getDilithium(__spreadProps(__spreadValues({}, PARAMS[2]), {
        CRH_BYTES: 64,
        TR_BYTES: 64,
        C_TILDE_BYTES: 32,
        XOF128,
        XOF256,
        securityLevel: 128
      }));
      ml_dsa65 = /* @__PURE__ */ getDilithium(__spreadProps(__spreadValues({}, PARAMS[3]), {
        CRH_BYTES: 64,
        TR_BYTES: 64,
        C_TILDE_BYTES: 48,
        XOF128,
        XOF256,
        securityLevel: 192
      }));
      ml_dsa87 = /* @__PURE__ */ getDilithium(__spreadProps(__spreadValues({}, PARAMS[5]), {
        CRH_BYTES: 64,
        TR_BYTES: 64,
        C_TILDE_BYTES: 64,
        XOF128,
        XOF256,
        securityLevel: 256
      }));
    }
  });

  // ../pqc-crypto/dist/mlDsa.js
  var require_mlDsa = __commonJS({
    "../pqc-crypto/dist/mlDsa.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.mlDsa65Verify = exports.mlDsa65Sign = exports.mlDsa65Keygen = void 0;
      var ml_dsa_js_1 = (init_ml_dsa(), __toCommonJS(ml_dsa_exports));
      function mlDsa65Keygen(seed) {
        const keys = ml_dsa_js_1.ml_dsa65.keygen(seed);
        return { publicKey: keys.publicKey, secretKey: keys.secretKey };
      }
      exports.mlDsa65Keygen = mlDsa65Keygen;
      function mlDsa65Sign2(message, secretKey) {
        return ml_dsa_js_1.ml_dsa65.sign(message, secretKey);
      }
      exports.mlDsa65Sign = mlDsa65Sign2;
      function mlDsa65Verify2(signature, message, publicKey) {
        return ml_dsa_js_1.ml_dsa65.verify(signature, message, publicKey);
      }
      exports.mlDsa65Verify = mlDsa65Verify2;
    }
  });

  // ../device-cloud-credentials/dist/types.js
  var WEB_GRACE_TTL_MS = 15 * 60 * 1e3;

  // ../device-cloud-credentials/dist/seal.js
  async function deriveKey(session, saltBytes) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(`${session.sessionId}::${session.key1}::${session.key2}`), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 1e5,
      hash: "SHA-256"
    }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function unsealCredentials(envelope, session) {
    if (envelope.expiresAt) {
      const exp = Date.parse(envelope.expiresAt);
      if (!Number.isNaN(exp) && Date.now() > exp) {
        throw new Error("Sealed cloud credentials expired (web grace TTL)");
      }
    }
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const key = await deriveKey(session, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(envelope.encryptedData));
    return JSON.parse(new TextDecoder().decode(decrypted));
  }
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
      out[i] = binary.charCodeAt(i);
    return out;
  }

  // ../device-cloud-credentials/dist/stores/webSealedStore.js
  var KEY_PREFIX = "pn_device_cloud_creds_v1:";
  var WebSealedStore = class {
    constructor(storage = globalThis.localStorage) {
      __publicField(this, "storage");
      this.storage = storage;
    }
    async get(identityId) {
      const raw = this.storage.getItem(KEY_PREFIX + identityId);
      if (!raw)
        return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.expiresAt && Date.parse(parsed.expiresAt) < Date.now()) {
          await this.clear(identityId);
          return null;
        }
        return parsed;
      } catch (e) {
        return null;
      }
    }
    async set(identityId, envelope) {
      this.storage.setItem(KEY_PREFIX + identityId, JSON.stringify(envelope));
    }
    async clear(identityId) {
      this.storage.removeItem(KEY_PREFIX + identityId);
    }
  };

  // ../device-cloud-credentials/dist/providerToken.js
  var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
  async function postToken(tokenUrl, body) {
    var _a, _b;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!res.ok)
      return null;
    const data = await res.json();
    const accessToken = ((_a = data.access_token) == null ? void 0 : _a.trim()) || "";
    if (!accessToken)
      return null;
    const expiresIn = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) && data.expires_in > 0 ? data.expires_in : 3600;
    const refreshToken = ((_b = data.refresh_token) == null ? void 0 : _b.trim()) || void 0;
    return { accessToken, refreshToken, expiresIn };
  }
  function applyClientSecret(body, clientSecret) {
    const secret = clientSecret == null ? void 0 : clientSecret.trim();
    if (secret)
      body.set("client_secret", secret);
  }
  async function refreshProviderAccessToken(opts) {
    const body = new URLSearchParams({
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      grant_type: "refresh_token"
    });
    applyClientSecret(body, opts.clientSecret);
    if (opts.scope)
      body.set("scope", opts.scope);
    return postToken(opts.tokenUrl, body);
  }

  // ../device-cloud-credentials/dist/driveTokenResolver.js
  var DRIVE_TOKEN_SKEW_MS = 6e4;
  function warnDeadEnd(path, reason) {
    try {
      console.warn("[DriveToken] no usable Drive token", { path, reason });
    } catch (e) {
    }
  }
  function googleAccountsFromEnvelope(env) {
    const envelope = env;
    if (!envelope)
      return [];
    const accounts = envelope.googleDriveAccounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      return accounts;
    }
    return envelope.googleDrive ? [envelope.googleDrive] : [];
  }
  function stringField(acct, ...keys) {
    for (const key of keys) {
      const value = acct[key];
      if (typeof value === "string" && value.trim())
        return value.trim();
    }
    return null;
  }
  function accountAccessToken(acct) {
    return stringField(acct, "access_token", "accessToken");
  }
  function accountRefreshToken(acct) {
    return stringField(acct, "refresh_token", "refreshToken");
  }
  function accountExpiresAtMs(acct) {
    var _a;
    const raw = (_a = acct.expires_at) != null ? _a : acct.expiresAt;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0)
      return null;
    return raw < 1e12 ? raw * 1e3 : raw;
  }
  function isAccessTokenFresh(acct, nowMs = Date.now()) {
    if (!accountAccessToken(acct))
      return false;
    const expiresAt = accountExpiresAtMs(acct);
    if (expiresAt == null)
      return false;
    return expiresAt - DRIVE_TOKEN_SKEW_MS > nowMs;
  }
  function pickGoogleAccount(env) {
    var _a;
    const accounts = googleAccountsFromEnvelope(env);
    if (accounts.length === 0)
      return null;
    return (_a = accounts.find((acct) => accountAccessToken(acct) || accountRefreshToken(acct))) != null ? _a : accounts[0];
  }
  function freshAccessTokenFromEnvelope(env, nowMs = Date.now()) {
    for (const acct of googleAccountsFromEnvelope(env)) {
      if (isAccessTokenFresh(acct, nowMs))
        return accountAccessToken(acct);
    }
    return null;
  }
  async function refreshDriveAccessToken(opts) {
    var _a, _b, _c;
    if (!((_a = opts.clientId) == null ? void 0 : _a.trim()) || !((_b = opts.clientSecret) == null ? void 0 : _b.trim()) || !((_c = opts.refreshToken) == null ? void 0 : _c.trim())) {
      warnDeadEnd(opts.path, "no_credentials");
      return { token: null, reason: "no_credentials" };
    }
    let minted;
    try {
      minted = await refreshProviderAccessToken({
        tokenUrl: GOOGLE_TOKEN_URL,
        clientId: opts.clientId.trim(),
        clientSecret: opts.clientSecret.trim(),
        refreshToken: opts.refreshToken.trim()
      });
    } catch (e) {
      warnDeadEnd(opts.path, "refresh_failed");
      return { token: null, reason: "refresh_failed" };
    }
    if (!minted) {
      warnDeadEnd(opts.path, "refresh_rejected");
      return { token: null, reason: "refresh_rejected" };
    }
    return {
      token: minted.accessToken,
      reason: "ok",
      expiresAt: Date.now() + minted.expiresIn * 1e3
    };
  }
  async function resolveGoogleOAuthClient(opts) {
    var _a, _b, _c, _d, _e;
    let clientId = ((_a = opts.clientId) == null ? void 0 : _a.trim()) || "";
    let clientSecret = ((_b = opts.clientSecret) == null ? void 0 : _b.trim()) || "";
    if (clientId && clientSecret)
      return { clientId, clientSecret };
    const base = (_c = opts.apiEndpoint) == null ? void 0 : _c.replace(/\/$/, "");
    if (!base)
      return null;
    try {
      const res = await fetch(`${base}/api/public-config`);
      if (!res.ok)
        return null;
      const data = await res.json();
      if (!clientId)
        clientId = ((_d = data.googleDriveClientId) == null ? void 0 : _d.trim()) || "";
      if (!clientSecret)
        clientSecret = ((_e = data.googleDriveClientSecret) == null ? void 0 : _e.trim()) || "";
    } catch (e) {
      return null;
    }
    if (!clientId || !clientSecret)
      return null;
    return { clientId, clientSecret };
  }
  async function resolveFreshDriveToken(opts) {
    var _a, _b, _c;
    const nowMs = (_a = opts.now) != null ? _a : Date.now();
    const account = pickGoogleAccount(opts.envelope);
    if (!account) {
      warnDeadEnd(opts.path, "no_account");
      return { token: null, reason: "no_account" };
    }
    const fresh = freshAccessTokenFromEnvelope(opts.envelope, nowMs);
    if (fresh)
      return { token: fresh, reason: "ok" };
    const refreshToken = accountRefreshToken(account);
    if (!refreshToken) {
      const reason = accountExpiresAtMs(account) == null ? "expiry_unknown" : "expired";
      warnDeadEnd(opts.path, reason);
      return { token: null, reason };
    }
    const hasDirectClient = Boolean(((_b = opts.clientId) == null ? void 0 : _b.trim()) && ((_c = opts.clientSecret) == null ? void 0 : _c.trim()));
    if (!opts.apiEndpoint && !hasDirectClient) {
      warnDeadEnd(opts.path, "no_api_endpoint");
      return { token: null, reason: "no_api_endpoint" };
    }
    const oauthClient = await resolveGoogleOAuthClient(opts);
    if (!oauthClient) {
      warnDeadEnd(opts.path, "no_credentials");
      return { token: null, reason: "no_credentials" };
    }
    return refreshDriveAccessToken({
      refreshToken,
      clientId: oauthClient.clientId,
      clientSecret: oauthClient.clientSecret,
      path: opts.path
    });
  }

  // ../device-cloud-credentials/dist/cloudVault.js
  var CLOUD_VAULT_SEAL_SESSION_ID = "pn-cloud-creds-v1";
  var CLOUD_VAULT_MLKEM_SESSION_ID = "pn-cloud-creds-v1-mlkem";
  function cloudVaultSealSessionFromMlKem(mlKemSecretKey) {
    return {
      sessionId: CLOUD_VAULT_MLKEM_SESSION_ID,
      key1: "mlkem",
      key2: mlKemSecretKey
    };
  }
  function canonicalCloudSealSession(key1, key2) {
    return {
      sessionId: CLOUD_VAULT_SEAL_SESSION_ID,
      key1: key1.trim(),
      key2
    };
  }
  async function unsealCloudVault(envelope, key1, key2) {
    return unsealCredentials(envelope, canonicalCloudSealSession(key1, key2));
  }
  async function unsealCloudVaultWithMlKem(envelope, mlKemSecretKey) {
    return unsealCredentials(envelope, cloudVaultSealSessionFromMlKem(mlKemSecretKey));
  }
  async function unsealCloudVaultWithAnyFactor(envelope, factors) {
    const errors = [];
    if (factors.mlKemSecretKey) {
      try {
        return await unsealCloudVaultWithMlKem(envelope, factors.mlKemSecretKey);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "mlkem unseal failed");
      }
    }
    if (factors.key1 && factors.key2) {
      try {
        return await unsealCloudVault(envelope, factors.key1, factors.key2);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "identity unseal failed");
      }
    }
    throw new Error(errors.join("; ") || "No cloud vault unseal factors");
  }
  function isSealedEnvelopeShape(value) {
    if (!value || typeof value !== "object")
      return false;
    const o = value;
    return typeof o.encryptedData === "string" && o.encryptedData.length > 0 && typeof o.iv === "string" && o.iv.length > 0 && typeof o.salt === "string" && o.salt.length > 0 && typeof o.updatedAt === "string";
  }

  // ../user-owned-storage/dist/pnLayout.js
  var METADATA_DIR = "_metadata";
  var INTEGRATORS_DIR = "integrators";
  function metadataPath(...segments) {
    return [METADATA_DIR, ...segments].join("/");
  }
  function integratorPath(clientId, ...segments) {
    return [INTEGRATORS_DIR, clientId, ...segments].join("/");
  }
  var TABLE_PATHS = {
    connections: metadataPath("connections"),
    followers: metadataPath("followers"),
    following: metadataPath("following"),
    notifications: metadataPath("notifications"),
    activityLedger: metadataPath("activity_ledger"),
    engagement: metadataPath("engagement"),
    messagingLedger: metadataPath("messaging_ledger"),
    prismLedger: metadataPath("prism_ledger"),
    preferences: metadataPath("preferences"),
    zkpDataPoints: metadataPath("zkp-data-points"),
    thirdPartyPermissions: metadataPath("third-party-permissions"),
    publicFileIndex: metadataPath("public-file-index"),
    ownerFileIndex: metadataPath("owner-file-index"),
    groups: metadataPath("groups"),
    devices: metadataPath("devices"),
    ownedAssets: metadataPath("owned-assets"),
    recovery: metadataPath("recovery"),
    messageRequests: metadataPath("message_requests"),
    dataPointRequests: metadataPath("data-point-requests")
  };
  var JSON_BLOB_PATHS = {
    profile: metadataPath("profile.json"),
    preferences: metadataPath("preferences.json"),
    devicePolicy: metadataPath("device-policy.json"),
    migrationManifest: integratorPath("_pn_migration_manifest.json")
  };

  // ../pen-protocol/dist/curated/registerHelpers.js
  function proseStarter(input) {
    return [
      `You are authoring a Pen document with template {{template_id}} ("${input.title}").`,
      input.focus,
      "Sections for this template: {{section_list}}.",
      'Emit ONLY a PenAgentBuild JSON object: { "templateId", "title", "sections": [{ "slug", "plainText" }] }.',
      "Use only the section slugs listed. Do not invent folder paths, file layouts, or parallel formats.",
      "Never include secrets, Key 1, Key 2, tokens, or raw account identifiers.",
      "User request:",
      "{{user_input}}"
    ].join("\n");
  }
  function withSeedBundle(base, seed) {
    return __spreadProps(__spreadValues({}, base), { seedSections: seed.seedSections, seedPagePresentation: seed.seedPagePresentation, seedPageLayout: seed.seedPageLayout });
  }

  // ../pen-protocol/dist/table.js
  var TABLE_PAYLOAD_VERSION = "table.v1";
  function emptyPollTable(options = [
    { id: "opt_a", label: "Option A", tally: 0 },
    { id: "opt_b", label: "Option B", tally: 0 }
  ]) {
    return {
      version: TABLE_PAYLOAD_VERSION,
      columns: [
        { id: "label", title: "Label", type: "string" },
        { id: "tally", title: "Tally", type: "number" }
      ],
      rows: options.map((o) => {
        var _a;
        return {
          id: o.id,
          cells: { label: o.label, tally: (_a = o.tally) != null ? _a : 0 }
        };
      })
    };
  }
  function tablePayloadToTipTap(payload) {
    return {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "application/vnd.par-noir.table+json" },
          content: [{ type: "text", text: JSON.stringify(payload) }]
        }
      ]
    };
  }
  function tableSectionFromPayload(slug, payload) {
    return {
      slug,
      doc: tablePayloadToTipTap(payload),
      layerGeom: "px"
    };
  }

  // ../pen-protocol/dist/starterSeeds.js
  var CHARCOAL = "#0c0c0c";
  var PAPER = "#f4f1ec";
  var INK = "#141414";
  var TEAL = "#0f766e";
  var GOLD = "#b8956c";
  var MUTED = "#6b6560";
  var CARD = "#171717";
  var PAPER_CARD = "#ffffff";
  var SANS = "Montserrat, Helvetica, sans-serif";
  var SERIF = "Source Serif 4, Georgia, serif";
  var MONO = "Courier New, monospace";
  function tipTapParagraphs(...paras) {
    return {
      type: "doc",
      content: paras.map((text) => ({
        type: "paragraph",
        content: text ? [{ type: "text", text }] : []
      }))
    };
  }
  function tipTapHeading(text, level = 1) {
    return {
      type: "heading",
      attrs: { level },
      content: text ? [{ type: "text", text }] : []
    };
  }
  function tipTapDoc(...nodes) {
    return {
      type: "doc",
      content: nodes.flatMap((n) => n.type === "doc" ? n.content || [] : [n])
    };
  }
  function tipTapStyled(text, opts = {}) {
    const attrs = {};
    if (opts.fontSize != null) {
      attrs.fontSize = typeof opts.fontSize === "number" ? `${opts.fontSize}px` : opts.fontSize;
    }
    if (opts.fontFamily)
      attrs.fontFamily = opts.fontFamily;
    if (opts.color)
      attrs.color = opts.color;
    const marks = [];
    if (Object.keys(attrs).length)
      marks.push({ type: "textStyle", attrs });
    if (opts.bold)
      marks.push({ type: "bold" });
    const markBag = marks.length ? { marks } : {};
    return {
      type: "doc",
      content: text.split("\n").map((line) => ({
        type: "paragraph",
        content: line ? [__spreadValues({ type: "text", text: line }, markBag)] : []
      }))
    };
  }
  function textLayer(id2, text, geom, extra) {
    var _a;
    return __spreadValues(__spreadProps(__spreadValues({
      id: id2,
      kind: "text"
    }, geom), {
      name: id2,
      positionLocked: (_a = extra == null ? void 0 : extra.positionLocked) != null ? _a : true,
      textDoc: tipTapParagraphs(text)
    }), extra);
  }
  function socialPresentation(partial = {}) {
    var _a, _b, _c, _d, _e;
    return {
      fontFamily: partial.fontFamily || SANS,
      fontSize: (_a = partial.fontSize) != null ? _a : 42,
      textColor: partial.textColor || PAPER,
      textStyle: partial.textStyle || "plain",
      dropShadowColor: partial.dropShadowColor || "#000000",
      dropShadowBlur: (_b = partial.dropShadowBlur) != null ? _b : 12,
      dropShadowOffsetX: (_c = partial.dropShadowOffsetX) != null ? _c : 2,
      dropShadowOffsetY: (_d = partial.dropShadowOffsetY) != null ? _d : 2,
      backgroundColor: partial.backgroundColor || CHARCOAL,
      backgroundImage: partial.backgroundImage,
      backgroundGradient: partial.backgroundGradient,
      textAlign: partial.textAlign || "center",
      padding: (_e = partial.padding) != null ? _e : 36
    };
  }
  function paperPresentation(partial = {}) {
    var _a, _b;
    return {
      fontFamily: partial.fontFamily || SERIF,
      fontSize: (_a = partial.fontSize) != null ? _a : 18,
      textColor: partial.textColor || INK,
      textStyle: partial.textStyle || "plain",
      dropShadowColor: "#000000",
      dropShadowBlur: 0,
      dropShadowOffsetX: 0,
      dropShadowOffsetY: 0,
      backgroundColor: partial.backgroundColor || PAPER,
      backgroundImage: partial.backgroundImage,
      backgroundGradient: partial.backgroundGradient,
      textAlign: partial.textAlign || "left",
      padding: (_b = partial.padding) != null ? _b : 48
    };
  }
  function seedSetBasic() {
    return {
      seedPageLayout: "flow",
      seedPagePresentation: socialPresentation({
        backgroundColor: CHARCOAL,
        backgroundGradient: `linear-gradient(180deg, ${CHARCOAL} 0%, #12100e 100%)`,
        textAlign: "left",
        fontSize: 22,
        textColor: PAPER,
        padding: 24,
        dropShadowBlur: 0
      }),
      seedSections: [
        {
          slug: "primary",
          doc: tipTapDoc(tipTapHeading("Primary", 2), tipTapParagraphs("Set = multi-media assembly. Primary leads; sources orbit.")),
          layers: [
            textLayer("layer_cover", "", { x: 0, y: 0, w: 360, h: 280, zIndex: 1 }, {
              backgroundGradient: `linear-gradient(135deg, ${TEAL} 0%, #1c1917 70%)`,
              textDoc: tipTapParagraphs("")
            }),
            textLayer("layer_scrim", "", { x: 0, y: 180, w: 360, h: 100, zIndex: 2 }, {
              backgroundGradient: "linear-gradient(180deg, rgba(12,12,12,0) 0%, rgba(12,12,12,0.95) 100%)",
              textDoc: tipTapParagraphs("")
            }),
            textLayer("layer_label", "PRIMARY", { x: 24, y: 220, w: 140, h: 24, zIndex: 3 }, {
              textDoc: tipTapStyled("PRIMARY", {
                fontSize: 11,
                fontFamily: SANS,
                color: TEAL,
                bold: true
              })
            }),
            textLayer("layer_title", "Field notes, assembled", { x: 24, y: 248, w: 312, h: 40, zIndex: 3 }, {
              textDoc: tipTapStyled("Field notes, assembled", {
                fontSize: 22,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }),
            textLayer("layer_blurb", "Mix image, note, and audio refs \u2014 not a same-type slide deck.", { x: 24, y: 320, w: 312, h: 72, zIndex: 2 }, {
              textDoc: tipTapStyled("Mix image, note, and audio refs \u2014 not a same-type slide deck.", { fontSize: 14, fontFamily: SANS, color: "#b8b2aa" })
            })
          ]
        },
        {
          slug: "sources",
          doc: tipTapDoc(tipTapHeading("Sources", 3), tipTapParagraphs("Embeds from other templates / posts.")),
          layers: [
            textLayer("layer_header", "SOURCES", { x: 24, y: 36, w: 200, h: 28, zIndex: 2 }, {
              textDoc: tipTapStyled("SOURCES", {
                fontSize: 12,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }),
            textLayer("layer_src_a", "Image post \u2014 loading dock light", { x: 24, y: 88, w: 312, h: 56, zIndex: 2 }, {
              backgroundColor: CARD,
              strokeColor: "#2a2824",
              strokeWidth: 1,
              textDoc: tipTapStyled("Image post \u2014 loading dock light", {
                fontSize: 14,
                fontFamily: SANS,
                color: PAPER
              })
            }),
            textLayer("layer_src_b", "Metric \u2014 weekly activation", { x: 24, y: 160, w: 312, h: 56, zIndex: 2 }, {
              backgroundColor: CARD,
              strokeColor: "#2a2824",
              strokeWidth: 1,
              textDoc: tipTapStyled("Metric \u2014 weekly activation", {
                fontSize: 14,
                fontFamily: SANS,
                color: PAPER
              })
            }),
            textLayer("layer_src_c", "Audio \u2014 late sketch, take 3", { x: 24, y: 232, w: 312, h: 56, zIndex: 2 }, {
              backgroundColor: CARD,
              strokeColor: "#2a2824",
              strokeWidth: 1,
              textDoc: tipTapStyled("Audio \u2014 late sketch, take 3", {
                fontSize: 14,
                fontFamily: SANS,
                color: PAPER
              })
            }),
            textLayer("layer_hint", "Attach \u2192 From Pen to bind each source.", { x: 24, y: 320, w: 312, h: 40, zIndex: 2 }, {
              textDoc: tipTapStyled("Attach \u2192 From Pen to bind each source.", {
                fontSize: 12,
                fontFamily: SANS,
                color: MUTED
              })
            })
          ]
        }
      ]
    };
  }
  function seedTablePrimitive() {
    return {
      seedPageLayout: "letter",
      seedPagePresentation: paperPresentation({
        backgroundColor: PAPER_CARD,
        fontFamily: MONO,
        fontSize: 14
      }),
      seedSections: [tableSectionFromPayload("grid", emptyPollTable())]
    };
  }
  function seedRegister() {
    return {
      seedPageLayout: "letter",
      seedPagePresentation: paperPresentation({
        backgroundColor: PAPER,
        fontFamily: MONO,
        fontSize: 14,
        textColor: INK
      }),
      seedSections: [
        {
          slug: "rows",
          doc: tipTapParagraphs("id | label | notes", "row-1 | Launch checklist | Ready", "row-2 | Review queue | Open"),
          layers: [
            textLayer("layer_header", "Register", { x: 48, y: 40, w: 280, h: 36, zIndex: 1 }, {
              textDoc: tipTapStyled("Register", {
                fontSize: 20,
                fontFamily: SANS,
                color: INK,
                bold: true
              })
            }),
            textLayer("layer_accent", "", { x: 48, y: 84, w: 48, h: 3, zIndex: 1 }, { backgroundColor: TEAL, textDoc: tipTapParagraphs("") })
          ]
        }
      ]
    };
  }
  function seedAssetKey() {
    return {
      seedPageLayout: "letter",
      seedPagePresentation: paperPresentation({
        backgroundColor: CHARCOAL,
        textColor: PAPER,
        fontFamily: MONO,
        fontSize: 14
      }),
      seedSections: [
        {
          slug: "grant",
          doc: tipTapParagraphs("asset: (id)", "scope: personal", "price: \u2014"),
          layers: [
            textLayer("layer_header", "Asset key", { x: 48, y: 40, w: 280, h: 36, zIndex: 1 }, {
              textDoc: tipTapStyled("Asset key", {
                fontSize: 20,
                fontFamily: SANS,
                color: PAPER,
                bold: true
              })
            }),
            textLayer("layer_accent", "", { x: 48, y: 84, w: 48, h: 3, zIndex: 1 }, { backgroundColor: GOLD, textDoc: tipTapParagraphs("") }),
            textLayer("layer_card", "asset: (id)\nscope: personal\nprice: \u2014", { x: 48, y: 120, w: 400, h: 120, zIndex: 1 }, {
              backgroundColor: CARD,
              strokeColor: "#2a2824",
              strokeWidth: 1,
              textDoc: tipTapStyled("asset: (id)\nscope: personal\nprice: \u2014", {
                fontSize: 14,
                fontFamily: MONO,
                color: "#d4ebe4"
              })
            })
          ]
        },
        {
          slug: "proof",
          doc: tipTapParagraphs("license-key proof placeholder"),
          layers: []
        }
      ]
    };
  }

  // ../pen-protocol/dist/pageGeometry.js
  var CSS_PX_PER_IN = 96;
  var LETTER_WIDTH_PX = Math.round(8.5 * CSS_PX_PER_IN);
  var LETTER_HEIGHT_PX = Math.round(11 * CSS_PX_PER_IN);
  var A4_WIDTH_PX = Math.round(210 / 25.4 * CSS_PX_PER_IN);
  var A4_HEIGHT_PX = Math.round(297 / 25.4 * CSS_PX_PER_IN);
  var DEFAULT_VIDEO_ASPECT = 16 / 9;
  var MOBILE_SHORT_PX = 360;
  var PAGE_SIZE_PRESETS = [
    { id: "flow", label: "Flow", layout: "flow", widthPx: null, heightPx: null },
    { id: "ratio-9-16", label: "9:16", landscapeLabel: "16:9", layout: "flow", widthPx: MOBILE_SHORT_PX, heightPx: 640 },
    { id: "ratio-1-1", label: "1:1", layout: "flow", widthPx: MOBILE_SHORT_PX, heightPx: MOBILE_SHORT_PX },
    { id: "ratio-4-5", label: "4:5", landscapeLabel: "5:4", layout: "flow", widthPx: MOBILE_SHORT_PX, heightPx: 450 },
    { id: "ratio-3-2", label: "2:3", landscapeLabel: "3:2", layout: "flow", widthPx: MOBILE_SHORT_PX, heightPx: 540 },
    { id: "ratio-4-3", label: "3:4", landscapeLabel: "4:3", layout: "flow", widthPx: MOBILE_SHORT_PX, heightPx: 480 },
    { id: "letter", label: "Letter", layout: "letter", widthPx: LETTER_WIDTH_PX, heightPx: LETTER_HEIGHT_PX },
    {
      id: "legal",
      label: "Legal",
      layout: "flow",
      widthPx: Math.round(8.5 * CSS_PX_PER_IN),
      heightPx: Math.round(14 * CSS_PX_PER_IN)
    },
    { id: "a4", label: "A4", layout: "a4", widthPx: A4_WIDTH_PX, heightPx: A4_HEIGHT_PX }
  ];
  var PX_PER_UNIT = {
    in: CSS_PX_PER_IN,
    cm: CSS_PX_PER_IN / 2.54,
    mm: CSS_PX_PER_IN / 25.4
  };

  // ../pen-protocol/dist/layerMotion.js
  var CUT_GAP_SEC = 1 / 30;

  // ../pen-protocol/dist/layers.js
  function scaledContent(current, factor) {
    return Math.round((current != null ? current : 1) * factor * 1e3) / 1e3;
  }

  // ../pen-protocol/dist/widgetElements.js
  function plainDoc(text) {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }]
    };
  }
  function cardSeed(layers) {
    return {
      seedPageLayout: "flow",
      seedPagePresentation: socialPresentation({
        backgroundColor: "transparent",
        backgroundGradient: void 0,
        backgroundImage: void 0,
        fontFamily: "Source Serif 4, Georgia, serif",
        fontSize: 28,
        textAlign: "left",
        textColor: "#141414",
        padding: 0,
        dropShadowBlur: 0,
        dropShadowOffsetX: 0,
        dropShadowOffsetY: 0
      }),
      seedSections: [{ slug: "card", doc: plainDoc(""), layers }]
    };
  }
  function seedWidget() {
    return cardSeed([]);
  }
  function seedAnimationPreset() {
    return cardSeed([
      {
        id: "anim_sample",
        kind: "text",
        name: "Rise",
        x: 48,
        y: 56,
        w: 200,
        h: 48,
        zIndex: 1,
        positionLocked: false,
        textDoc: plainDoc("Rise"),
        motion: {
          keys: [],
          animation: { in: "rise", durationSec: 0.4 }
        }
      }
    ]);
  }
  function seedTransitionPreset() {
    return cardSeed([
      {
        id: "clip_out",
        kind: "text",
        name: "Out",
        x: 48,
        y: 56,
        w: 160,
        h: 48,
        zIndex: 1,
        positionLocked: false,
        textDoc: plainDoc("Out"),
        timelineTrackId: "join",
        inSec: 0,
        outSec: 2
      },
      {
        id: "clip_in",
        kind: "text",
        name: "In",
        x: 48,
        y: 120,
        w: 160,
        h: 48,
        zIndex: 2,
        positionLocked: false,
        textDoc: plainDoc("In"),
        timelineTrackId: "join",
        inSec: 2,
        outSec: 4,
        transitionIn: { preset: "crossfade", durationSec: 0.5 }
      }
    ]);
  }
  function seedTextPreset() {
    return cardSeed([
      {
        id: "text_sample",
        kind: "text",
        name: "Sample",
        x: 32,
        y: 48,
        w: 240,
        h: 64,
        zIndex: 1,
        positionLocked: false,
        textColor: "#141414",
        strokeColor: "#141414",
        strokeWidth: 1,
        strokeStyle: "solid",
        shadowColor: "#000000",
        shadowBlur: 8,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        textDoc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Sample",
                  marks: [
                    {
                      type: "textStyle",
                      attrs: {
                        fontFamily: "Source Serif 4, Georgia, serif",
                        fontSize: "28px",
                        color: "#141414"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    ]);
  }

  // ../pen-protocol/dist/curated/kit.js
  var CURATED_SANS = "Montserrat, Helvetica, sans-serif";
  var CURATED_SERIF = "Source Serif 4, Georgia, serif";
  var CURATED_MONO = "Courier New, monospace";
  function box(x, y, w2, h, z) {
    return { x, y, w: w2, h, z };
  }
  var FRAMES = {
    portrait: { w: 360, h: 640 },
    landscape: { w: 640, h: 360 },
    square: { w: 360, h: 360 }
  };
  var FEED_CHROME = {
    topRail: 0.06,
    bottomNav: 0.08,
    caption: { left: 0.03, right: 0.18, bottom: 0.08, height: 0.1 },
    /** Rail sits `bottom` up from the screen edge and never rises past `top`; icons scale with screen height. */
    rail: { right: 0.02, top: 0.5, bottom: 0.2, iconOfHeight: 0.9 * 0.3 / (6 + 5 * 0.28), countOverhang: 0.12 }
  };
  var themes = {
    ink: {
      bg: "#0b0b0c",
      ink: "#f5f5f4",
      muted: "rgba(245,245,244,0.62)",
      accent: "#facc15",
      primary: { fill: "#facc15", color: "#0b0b0c" },
      ghost: { fill: "rgba(255,255,255,0.1)", color: "#f5f5f4" },
      field: { fill: "#1c1c1f", color: "#f5f5f4" }
    },
    paper: {
      bg: "#f6f1e7",
      ink: "#1c1917",
      muted: "#78716c",
      accent: "#b45309",
      primary: { fill: "#1c1917", color: "#f6f1e7" },
      ghost: { fill: "#ffffff", color: "#1c1917" },
      field: { fill: "#ffffff", color: "#1c1917" }
    },
    sunset: {
      bg: "#7c2d12",
      ink: "#fff7ed",
      muted: "rgba(255,247,237,0.72)",
      accent: "#fdba74",
      primary: { fill: "#fff7ed", color: "#7c2d12" },
      ghost: { fill: "rgba(255,255,255,0.16)", color: "#fff7ed" },
      field: { fill: "#fff7ed", color: "#431407" }
    },
    forest: {
      bg: "#052e16",
      ink: "#ecfdf5",
      muted: "rgba(236,253,245,0.68)",
      accent: "#86efac",
      primary: { fill: "#86efac", color: "#052e16" },
      ghost: { fill: "rgba(255,255,255,0.12)", color: "#ecfdf5" },
      field: { fill: "#ecfdf5", color: "#052e16" }
    },
    night: {
      bg: "#0f172a",
      ink: "#e2e8f0",
      muted: "rgba(226,232,240,0.62)",
      accent: "#818cf8",
      primary: { fill: "#818cf8", color: "#0f172a" },
      ghost: { fill: "rgba(255,255,255,0.1)", color: "#e2e8f0" },
      field: { fill: "#1e293b", color: "#e2e8f0" }
    },
    citrus: {
      bg: "#fef9c3",
      ink: "#1a2e05",
      muted: "#4d7c0f",
      accent: "#65a30d",
      primary: { fill: "#1a2e05", color: "#fef9c3" },
      ghost: { fill: "#ffffff", color: "#1a2e05" },
      field: { fill: "#ffffff", color: "#1a2e05" }
    },
    rose: {
      bg: "#fff1f2",
      ink: "#4c0519",
      muted: "#9f1239",
      accent: "#e11d48",
      primary: { fill: "#e11d48", color: "#ffffff" },
      ghost: { fill: "#ffffff", color: "#4c0519" },
      field: { fill: "#ffffff", color: "#4c0519" }
    },
    slate: {
      bg: "#e2e8f0",
      ink: "#0f172a",
      muted: "#475569",
      accent: "#0369a1",
      primary: { fill: "#0f172a", color: "#ffffff" },
      ghost: { fill: "#ffffff", color: "#0f172a" },
      field: { fill: "#ffffff", color: "#0f172a" }
    }
  };
  function familyOf(font) {
    if (font.family === "serif")
      return CURATED_SERIF;
    if (font.family === "mono")
      return CURATED_MONO;
    return CURATED_SANS;
  }
  function richDoc(content, font) {
    const lines = Array.isArray(content) ? content : [content];
    const marks = [
      { type: "textStyle", attrs: { fontFamily: familyOf(font), fontSize: `${font.size}px`, color: font.color } }
    ];
    if (font.bold)
      marks.push({ type: "bold" });
    if (font.italic)
      marks.push({ type: "italic" });
    return {
      type: "doc",
      content: lines.map((line) => __spreadProps(__spreadValues({
        type: "paragraph"
      }, font.align && font.align !== "left" ? { attrs: { textAlign: font.align } } : {}), {
        content: line ? [{ type: "text", text: line, marks }] : []
      }))
    };
  }
  var TEXT_PAD_PX = 8;
  function padTextLayers(layers, frame, skip) {
    var _a, _b, _c, _d;
    const art = layers.find((layer) => layer.widgetElement === "html");
    const frameW = (_b = (_a = frame == null ? void 0 : frame.w) != null ? _a : art == null ? void 0 : art.w) != null ? _b : 360;
    const frameH = (_d = (_c = frame == null ? void 0 : frame.h) != null ? _c : art == null ? void 0 : art.h) != null ? _d : 360;
    return layers.map((layer) => {
      if (layer.widgetElement !== "text" || layer.backgroundColor !== "transparent")
        return layer;
      if (skip == null ? void 0 : skip(layer))
        return layer;
      const x = Math.max(0, layer.x - TEXT_PAD_PX);
      const y = Math.max(0, layer.y - TEXT_PAD_PX);
      const right = Math.min(frameW, layer.x + layer.w + TEXT_PAD_PX);
      const bottom = Math.min(frameH, layer.y + layer.h + TEXT_PAD_PX);
      return __spreadProps(__spreadValues({}, layer), { x, y, w: right - x, h: bottom - y });
    });
  }
  function curatedCardSeed(layers) {
    layers = padTextLayers(layers);
    return {
      seedPageLayout: "flow",
      seedPagePresentation: socialPresentation({
        backgroundColor: "transparent",
        backgroundGradient: void 0,
        backgroundImage: void 0,
        fontFamily: CURATED_SERIF,
        fontSize: 28,
        textAlign: "left",
        textColor: "#141414",
        padding: 0,
        dropShadowBlur: 0,
        dropShadowOffsetX: 0,
        dropShadowOffsetY: 0
      }),
      seedSections: [{ slug: "card", doc: plainDoc(""), layers }]
    };
  }
  function artLayer(id2, htmlSource, h = 360, w2 = 360) {
    return { id: id2, kind: "text", widgetElement: "html", name: "Art", x: 0, y: 0, w: w2, h, zIndex: 1, positionLocked: false, htmlSource };
  }
  function pageArt(id2, htmlSource, frame) {
    return artLayer(id2, htmlSource, frame.h, frame.w);
  }
  function slotLayer(id2, b, name, htmlSource, extra = {}) {
    return __spreadValues({ id: id2, kind: "text", widgetElement: "html", name, x: b.x, y: b.y, w: b.w, h: b.h, zIndex: b.z, positionLocked: false, htmlSource }, extra);
  }
  function motion(layer, animation) {
    return __spreadProps(__spreadValues({}, layer), { motion: { keys: [], animation: __spreadValues({ durationSec: 0.5 }, animation) } });
  }
  function groupLayers(id2, name, children) {
    const z = Math.max(...children.map((layer) => layer.zIndex)) + 1;
    const group = { id: id2, kind: "group", name, x: 0, y: 0, w: 0, h: 0, zIndex: z, backgroundColor: "transparent" };
    return [group, ...children.map((layer) => __spreadProps(__spreadValues({}, layer), { parentGroupId: id2 }))];
  }
  function embedWidget(prefix, widgetTemplateId, name, seed, at) {
    var _a, _b, _c;
    const scale = (_a = at.scale) != null ? _a : 1;
    const layers = (_c = (_b = seed().seedSections[0]) == null ? void 0 : _b.layers) != null ? _c : [];
    const reId = (id2) => `${prefix}_${id2}`;
    const children = layers.map((layer) => __spreadValues(__spreadValues(__spreadValues(__spreadProps(__spreadValues({}, layer), {
      id: reId(layer.id),
      parentGroupId: prefix,
      x: at.x + layer.x * scale,
      y: at.y + layer.y * scale,
      w: layer.w * scale,
      h: layer.h * scale,
      zIndex: at.z + layer.zIndex
    }), scale !== 1 ? { contentScale: scaledContent(layer.contentScale, scale) } : {}), layer.revealLayerId ? { revealLayerId: reId(layer.revealLayerId) } : {}), layer.bindRowId ? { bindRowId: reId(layer.bindRowId) } : {}));
    const group = {
      id: prefix,
      kind: "group",
      name,
      widgetTemplateId,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      zIndex: Math.max(...children.map((layer) => layer.zIndex)) + 1,
      backgroundColor: "transparent"
    };
    return [group, ...children];
  }
  function sealGroups(layers) {
    return layers.map((layer) => {
      if (layer.kind !== "group")
        return layer;
      const members = layers.filter((member) => member.parentGroupId === layer.id);
      if (!members.length)
        return layer;
      const x = Math.min(...members.map((m) => m.x));
      const y = Math.min(...members.map((m) => m.y));
      const w2 = Math.max(...members.map((m) => m.x + m.w)) - x;
      const h = Math.max(...members.map((m) => m.y + m.h)) - y;
      return __spreadProps(__spreadValues({}, layer), { x, y, w: w2, h });
    });
  }
  function pageSeed(frame, pages, presentation = {}) {
    return {
      seedPageLayout: "flow",
      seedPagePresentation: socialPresentation(__spreadValues({
        backgroundColor: "#0b0b0c",
        fontFamily: CURATED_SERIF,
        fontSize: 28,
        textAlign: "left",
        textColor: "#f5f5f4",
        padding: 0,
        dropShadowBlur: 0,
        dropShadowOffsetX: 0,
        dropShadowOffsetY: 0
      }, presentation)),
      seedSections: pages.map((page) => {
        const embedded = new Set(page.layers.filter((l) => l.kind === "group" && l.widgetTemplateId).map((l) => l.id));
        const padded = padTextLayers(page.layers, frame, (layer) => Boolean(layer.parentGroupId && embedded.has(layer.parentGroupId)));
        return { slug: page.slug, doc: plainDoc(""), layers: sealGroups(padded) };
      })
    };
  }
  function stackSections(page, sections) {
    const out = [];
    let top = 0;
    sections.forEach((seed, index) => {
      var _a, _b;
      const layers = (_b = (_a = seed().seedSections[0]) == null ? void 0 : _a.layers) != null ? _b : [];
      const reId = (id2) => `${page}_${index}_${id2}`;
      let height = 0;
      for (const layer of layers) {
        if (layer.widgetElement === "html")
          height = Math.max(height, layer.h);
        out.push(__spreadValues(__spreadValues(__spreadProps(__spreadValues({}, layer), {
          id: reId(layer.id),
          y: layer.y + top
        }), layer.revealLayerId ? { revealLayerId: reId(layer.revealLayerId) } : {}), layer.bindRowId ? { bindRowId: reId(layer.bindRowId) } : {}));
      }
      top += height;
    });
    return out;
  }
  function artHtml(background, shapes, css = "") {
    return `<style>html,body{margin:0;height:100%;overflow:hidden}body{background:${background};position:relative}.s{position:absolute;border-radius:50%}.r{position:absolute}${css}</style>${shapes}`;
  }
  function textLayer2(id2, b, content, font, extra = {}) {
    const first = Array.isArray(content) ? content[0] || "" : content;
    return __spreadValues({
      id: id2,
      kind: "text",
      widgetElement: "text",
      name: first.slice(0, 24) || "Text",
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      zIndex: b.z,
      positionLocked: false,
      backgroundColor: "transparent",
      textDoc: richDoc(content, font)
    }, extra);
  }
  function panelLayer(id2, b, fill, content, font, extra = {}) {
    return textLayer2(id2, b, content, font, __spreadValues({
      name: extra.name || "Panel",
      backgroundColor: fill,
      cornerRadius: 12
    }, extra));
  }
  function buttonLayer(id2, b, face, look, extra, opts = {}) {
    var _a, _b;
    return __spreadValues(__spreadProps(__spreadValues({
      id: id2,
      kind: "interactive",
      widgetElement: "button",
      name: face,
      label: face,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      zIndex: b.z,
      positionLocked: false,
      backgroundColor: look.fill,
      textColor: look.color,
      cornerRadius: (_a = opts.radius) != null ? _a : Math.round(b.h / 2)
    }, opts.stroke ? { strokeColor: opts.stroke, strokeWidth: 1 } : {}), {
      textDoc: richDoc(face, { size: (_b = opts.size) != null ? _b : 14, color: look.color, bold: true, align: "center" })
    }), extra);
  }
  function inputLayer(id2, b, placeholder, look, extra = {}) {
    return __spreadValues({
      id: id2,
      kind: "text",
      widgetElement: "input",
      name: placeholder.replace(/…$/, "") || "Field",
      label: placeholder,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      zIndex: b.z,
      positionLocked: false,
      backgroundColor: look.fill,
      textColor: look.color,
      cornerRadius: 10
    }, extra);
  }
  function scoreLayer(id2, b, color, fill = "transparent") {
    return {
      id: id2,
      kind: "text",
      widgetElement: "score",
      name: "Score",
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      zIndex: b.z,
      positionLocked: false,
      backgroundColor: fill,
      textColor: color,
      cornerRadius: Math.round(b.h / 2)
    };
  }
  function countdownLayer(id2, b, color, days, fill = "transparent") {
    return {
      id: id2,
      kind: "text",
      widgetElement: "time",
      name: "Countdown",
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      zIndex: b.z,
      positionLocked: false,
      backgroundColor: fill,
      textColor: color,
      cornerRadius: Math.round(b.h / 2),
      timeFace: "countdown",
      closesAt: new Date(Date.now() + days * 24 * 60 * 60 * 1e3).toISOString()
    };
  }
  function clockLayer(id2, b, color, time, fill = "transparent") {
    return {
      id: id2,
      kind: "text",
      widgetElement: "time",
      name: "Clock",
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      zIndex: b.z,
      positionLocked: false,
      backgroundColor: fill,
      textColor: color,
      cornerRadius: Math.round(b.h / 2),
      timeFace: "clock",
      clockTime: time
    };
  }
  function eventStartIn(days, hour) {
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1e3);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  // ../pen-protocol/dist/curated/polls.js
  function seedPollQuick() {
    const t = themes.night;
    const slot = { fill: "rgba(129,140,248,0.14)", color: t.ink };
    return curatedCardSeed([
      artLayer("pq_art", artHtml("linear-gradient(170deg,#0f172a 0%,#1e1b4b 100%)", '<div class="grid"></div><div class="s" style="width:120px;height:120px;right:-30px;top:-30px;background:rgba(129,140,248,0.35)"></div>', ".grid{position:absolute;right:16px;top:20px;width:120px;height:84px;background-image:linear-gradient(rgba(226,232,240,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(226,232,240,0.12) 1px,transparent 1px);background-size:17px 17px}")),
      textLayer2("pq_kicker", box(24, 20, 200, 20, 2), "WEEKLY LIVE", { size: 11, color: t.accent, bold: true }),
      textLayer2("pq_question", box(24, 44, 250, 68, 3), "Best time for the weekly live?", { family: "serif", size: 25, color: t.ink, bold: true }, { name: "Question" }),
      textLayer2("pq_closes", box(24, 120, 80, 24, 4), "Closes in", { size: 12, color: t.muted }),
      countdownLayer("pq_time", box(96, 120, 116, 24, 5), t.ink, 1, "rgba(129,140,248,0.25)"),
      buttonLayer("pq_mon", box(24, 160, 312, 40, 6), "Monday \xB7 6 pm", slot, { behavior: "poll.vote", bindRowId: "pq_mon" }, { radius: 10, stroke: "rgba(129,140,248,0.5)" }),
      buttonLayer("pq_wed", box(24, 208, 312, 40, 7), "Wednesday \xB7 noon", slot, { behavior: "poll.vote", bindRowId: "pq_wed" }, { radius: 10, stroke: "rgba(129,140,248,0.5)" }),
      buttonLayer("pq_sat", box(24, 256, 312, 40, 8), "Saturday \xB7 10 am", slot, { behavior: "poll.vote", bindRowId: "pq_sat" }, { radius: 10, stroke: "rgba(129,140,248,0.5)" }),
      textLayer2("pq_note", box(24, 312, 312, 24, 9), "One vote per person.", { size: 11, color: t.muted })
    ]);
  }
  function seedPollWriteInWidget() {
    const option = { fill: "rgba(255,255,255,0.16)", color: "#ffffff" };
    return curatedCardSeed([
      artLayer("pw_art", artHtml("linear-gradient(150deg,#0f766e 0%,#1e3a8a 60%,#312e81 100%)", '<div class="s" style="width:220px;height:220px;right:-60px;top:-70px;background:rgba(253,230,138,0.25)"></div><div class="s" style="width:140px;height:140px;left:-40px;bottom:-50px;background:rgba(255,255,255,0.12)"></div>')),
      textLayer2("pw_kicker", box(24, 12, 200, 32, 2), "COMMUNITY POLL", { size: 11, color: "#fde68a", bold: true }),
      textLayer2("pw_question", box(24, 42, 312, 56, 3), "What should we build next?", { family: "serif", size: 24, color: "#ffffff", bold: true }, { name: "Question" }),
      countdownLayer("pw_time", box(22, 100, 90, 20, 4), "#fde68a", 2),
      buttonLayer("pw_opt_a", box(24, 130, 312, 36, 5), "Live audio rooms", option, { behavior: "poll.vote", bindRowId: "pw_opt_a" }),
      buttonLayer("pw_opt_b", box(24, 174, 312, 36, 6), "Shared notebooks", option, { behavior: "poll.vote", bindRowId: "pw_opt_b" }),
      buttonLayer("pw_opt_c", box(24, 218, 312, 36, 7), "Offline mode", option, { behavior: "poll.vote", bindRowId: "pw_opt_c" }),
      inputLayer("pw_writein_field", box(24, 268, 216, 36, 8), "Something else\u2026", { fill: "#ffffff", color: "#141414" }, { name: "Write-in", cornerRadius: 18 }),
      buttonLayer("pw_writein", box(248, 268, 88, 36, 9), "Vote", { fill: "#fde68a", color: "#1e1b4b" }, { behavior: "poll.vote", bindRowId: "pw_writein", writeIn: true, label: "Other", name: "Other" }),
      textLayer2("pw_note", box(24, 314, 312, 32, 10), "Only the creator sees write-in answers.", { size: 11, color: "rgba(255,255,255,0.7)" })
    ]);
  }
  function seedPollThisorthat() {
    return curatedCardSeed([
      artLayer("tt_art", artHtml("#0c4a6e", '<div class="r" style="left:0;top:0;width:180px;height:360px;background:linear-gradient(180deg,#0369a1,#0c4a6e)"></div><div class="r" style="left:180px;top:0;width:180px;height:360px;background:linear-gradient(180deg,#fbbf24,#f97316)"></div><div class="tri" style="left:14px;top:120px;border-width:0 70px 110px 70px"></div><div class="tri" style="left:76px;top:150px;border-width:0 52px 80px 52px;border-color:transparent transparent #e0f2fe transparent"></div><div class="s" style="left:248px;top:112px;width:64px;height:64px;background:#fff7ed"></div><div class="r" style="left:180px;top:200px;width:180px;height:36px;background:repeating-linear-gradient(90deg,#38bdf8 0 18px,#7dd3fc 18px 36px);opacity:.85"></div><div class="vs">VS</div>', ".tri{position:absolute;width:0;height:0;border-style:solid;border-color:transparent transparent #bae6fd transparent}.vs{position:absolute;left:154px;top:150px;width:52px;height:52px;border-radius:50%;background:#0b0b0c;color:#fff;font:800 16px Montserrat,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;border:3px solid #fff}")),
      textLayer2("tt_kicker", box(0, 20, 360, 20, 2), "TRAVEL POLL", { size: 11, color: "#ffffff", bold: true, align: "center" }),
      textLayer2("tt_question", box(0, 42, 360, 40, 3), "Weekend escape?", { family: "serif", size: 28, color: "#ffffff", bold: true, align: "center" }, { name: "Question" }),
      buttonLayer("tt_mountains", box(24, 256, 140, 52, 4), "Mountains", { fill: "#ffffff", color: "#0c4a6e" }, { behavior: "poll.vote", bindRowId: "tt_mountains" }, { size: 16, radius: 14 }),
      buttonLayer("tt_beach", box(196, 256, 140, 52, 5), "Beach", { fill: "#ffffff", color: "#9a3412" }, { behavior: "poll.vote", bindRowId: "tt_beach" }, { size: 16, radius: 14 }),
      textLayer2("tt_note", box(0, 322, 360, 20, 6), "Pick a side", { size: 12, color: "#ffffff", bold: true, align: "center" })
    ]);
  }
  function seedPollRating() {
    const t = themes.paper;
    const dot = { fill: "#ffffff", color: t.ink };
    const ids = ["rt_1", "rt_2", "rt_3", "rt_4", "rt_5"];
    return curatedCardSeed([
      artLayer("rt_art", artHtml("#f6f1e7", '<div class="bar" style="left:196px;height:16px"></div><div class="bar" style="left:226px;height:28px"></div><div class="bar" style="left:256px;height:40px"></div><div class="bar" style="left:286px;height:52px"></div><div class="bar" style="left:316px;height:64px;background:#b45309"></div><div class="r" style="left:24px;right:24px;top:236px;height:2px;background:#e7e0d2"></div>', ".bar{position:absolute;bottom:24px;width:20px;border-radius:4px 4px 0 0;background:#d6c7a8}")),
      textLayer2("rt_kicker", box(24, 24, 200, 20, 2), "EPISODE 42", { size: 11, color: t.accent, bold: true }),
      textLayer2("rt_question", box(24, 48, 312, 64, 3), "How was today's episode?", { family: "serif", size: 26, color: t.ink, bold: true }, { name: "Question" }),
      textLayer2("rt_sub", box(24, 116, 312, 22, 4), "Rate it from 1 to 5.", { size: 13, color: t.muted }),
      ...ids.map((id2, i) => buttonLayer(id2, box(24 + i * 65, 168, 52, 52, 5 + i), String(i + 1), i === 4 ? t.primary : dot, { behavior: "poll.vote", bindRowId: id2 }, { size: 18, stroke: "#d6c7a8" })),
      textLayer2("rt_low", box(24, 246, 100, 20, 10), "Meh", { size: 12, color: t.muted, bold: true }),
      textLayer2("rt_high", box(236, 246, 100, 20, 11), "Loved it", { size: 12, color: t.muted, bold: true, align: "right" })
    ]);
  }
  function seedPollHottake() {
    return curatedCardSeed([
      artLayer("ht_art", artHtml("linear-gradient(160deg,#450a0a 0%,#7f1d1d 100%)", '<div class="meter"></div><div class="needle"></div><div class="lab" style="left:24px">COLD</div><div class="lab" style="right:24px;text-align:right">SPICY</div>', ".meter{position:absolute;left:24px;right:24px;top:180px;height:14px;border-radius:7px;background:linear-gradient(90deg,#38bdf8,#facc15 50%,#ef4444)}.needle{position:absolute;left:250px;top:170px;width:6px;height:34px;border-radius:3px;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.25)}.lab{position:absolute;top:206px;width:80px;font:700 10px Montserrat,Helvetica,sans-serif;letter-spacing:2px;color:rgba(255,255,255,.6)}")),
      textLayer2("ht_kicker", box(24, 22, 200, 20, 2), "HOT TAKE", { size: 11, color: "#fca5a5", bold: true }),
      textLayer2("ht_question", box(24, 46, 312, 110, 3), "Pineapple belongs on pizza.", { family: "serif", size: 32, color: "#ffffff", bold: true }, { name: "Question" }),
      buttonLayer("ht_agree", box(24, 248, 150, 48, 4), "Agree", { fill: "#22c55e", color: "#052e16" }, { behavior: "poll.vote", bindRowId: "ht_agree" }, { size: 16 }),
      buttonLayer("ht_disagree", box(186, 248, 150, 48, 5), "Disagree", { fill: "#ffffff", color: "#7f1d1d" }, { behavior: "poll.vote", bindRowId: "ht_disagree" }, { size: 16 }),
      textLayer2("ht_note", box(24, 312, 312, 24, 6), "See where everyone landed after you vote.", { size: 11, color: "rgba(255,255,255,0.7)" })
    ]);
  }
  function seedPollHidden() {
    const t = themes.ink;
    const pick = { fill: "rgba(250,204,21,0.1)", color: t.ink };
    return curatedCardSeed([
      artLayer("hr_art", artHtml("#0b0b0c", '<div class="dots"></div><div class="pin" style="left:262px;top:40px"></div><div class="pin" style="left:300px;top:76px"></div><div class="pin" style="left:236px;top:92px"></div>', ".dots{position:absolute;left:200px;top:20px;width:150px;height:110px;background-image:radial-gradient(rgba(245,245,244,.22) 1.5px,transparent 1.6px);background-size:10px 10px}.pin{position:absolute;width:12px;height:12px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#facc15}")),
      textLayer2("hr_kicker", box(24, 22, 170, 20, 2), "GUESS AND REVEAL", { size: 11, color: t.accent, bold: true }),
      textLayer2("hr_question", box(24, 46, 200, 64, 3), "Guess the launch city", { family: "serif", size: 26, color: t.ink, bold: true }, { name: "Question" }),
      buttonLayer("hr_lisbon", box(24, 128, 312, 40, 4), "Lisbon", pick, { behavior: "poll.vote", bindRowId: "hr_lisbon" }, { radius: 10, stroke: "rgba(250,204,21,0.4)" }),
      buttonLayer("hr_seoul", box(24, 176, 312, 40, 5), "Seoul", pick, { behavior: "poll.vote", bindRowId: "hr_seoul" }, { radius: 10, stroke: "rgba(250,204,21,0.4)" }),
      buttonLayer("hr_mexico", box(24, 224, 312, 40, 6), "Mexico City", pick, { behavior: "poll.vote", bindRowId: "hr_mexico" }, { radius: 10, stroke: "rgba(250,204,21,0.4)" }),
      textLayer2("hr_note", box(24, 280, 200, 40, 7), "Results show when the poll closes.", { size: 12, color: t.muted }),
      countdownLayer("hr_time", box(224, 284, 112, 28, 8), t.bg, 3, t.accent)
    ]);
  }
  function seedPollRank() {
    const t = themes.slate;
    const row = { fill: "#ffffff", color: t.ink };
    return curatedCardSeed([
      artLayer("rk_art", artHtml("#e2e8f0", '<div class="pod" style="left:250px;height:30px;background:#94a3b8"></div><div class="pod" style="left:280px;height:46px;background:#0369a1"></div><div class="pod" style="left:310px;height:22px;background:#cbd5e1"></div>', ".pod{position:absolute;bottom:0;width:30px}")),
      textLayer2("rk_kicker", box(24, 22, 200, 20, 2), "YOUR TOP THREE", { size: 11, color: t.accent, bold: true }),
      textLayer2("rk_question", box(24, 46, 312, 64, 3), "Rank our next three episodes", { family: "serif", size: 25, color: t.ink, bold: true }, { name: "Question" }),
      textLayer2("rk_sub", box(24, 110, 312, 22, 4), "Tap your favorite first, then the rest in order.", { size: 12, color: t.muted }),
      buttonLayer("rk_a", box(24, 144, 312, 44, 5), "The night shift diaries", row, { behavior: "widget.rank", bindRowId: "rk_a" }, { radius: 12, stroke: "#cbd5e1" }),
      buttonLayer("rk_b", box(24, 196, 312, 44, 6), "Inside a seed vault", row, { behavior: "widget.rank", bindRowId: "rk_b" }, { radius: 12, stroke: "#cbd5e1" }),
      buttonLayer("rk_c", box(24, 248, 312, 44, 7), "Cooking with no recipe", row, { behavior: "widget.rank", bindRowId: "rk_c" }, { radius: 12, stroke: "#cbd5e1" })
    ]);
  }
  function seedPollBudget() {
    const t = themes.forest;
    const bucket = { fill: "rgba(134,239,172,0.14)", color: t.ink };
    return curatedCardSeed([
      artLayer("bs_art", artHtml("linear-gradient(165deg,#052e16 0%,#14532d 100%)", '<div class="r" style="left:24px;top:314px;width:140px;height:14px;border-radius:7px 0 0 7px;background:#86efac"></div><div class="r" style="left:164px;top:314px;width:100px;height:14px;background:#4ade80"></div><div class="r" style="left:264px;top:314px;width:72px;height:14px;border-radius:0 7px 7px 0;background:#16a34a"></div>')),
      textLayer2("bs_kicker", box(24, 22, 200, 20, 2), "ROADMAP VOTE", { size: 11, color: t.accent, bold: true }),
      textLayer2("bs_question", box(24, 46, 312, 64, 3), "Where should our next month go?", { family: "serif", size: 25, color: t.ink, bold: true }, { name: "Question" }),
      textLayer2("bs_sub", box(24, 110, 312, 22, 4), "Share 100 points across the three.", { size: 12, color: t.muted }),
      buttonLayer("bs_speed", box(24, 144, 312, 44, 5), "A faster app", bucket, { behavior: "widget.allocate", bindRowId: "bs_speed", allocateTotal: 100 }, { radius: 12 }),
      buttonLayer("bs_features", box(24, 196, 312, 44, 6), "New features", bucket, { behavior: "widget.allocate", bindRowId: "bs_features", allocateTotal: 100 }, { radius: 12 }),
      buttonLayer("bs_docs", box(24, 248, 312, 44, 7), "Better guides", bucket, { behavior: "widget.allocate", bindRowId: "bs_docs", allocateTotal: 100 }, { radius: 12 }),
      textLayer2("bs_total", box(24, 292, 312, 20, 8), "Total: 100 points", { size: 11, color: t.muted, bold: true })
    ]);
  }

  // ../pen-protocol/dist/curated/quizzes.js
  function seedQuizWidget() {
    const answer = { fill: "#ffffff", color: "#7c2d12" };
    return curatedCardSeed([
      artLayer("qz_art", artHtml("linear-gradient(160deg,#f97316 0%,#db2777 70%,#9d174d 100%)", '<div class="s" style="width:180px;height:180px;right:-50px;bottom:-40px;background:rgba(255,255,255,0.18)"></div><div class="s" style="width:60px;height:60px;left:280px;top:24px;background:rgba(255,255,255,0.3)"></div>')),
      textLayer2("qz_kicker", box(24, 12, 200, 32, 2), "QUICK QUIZ", { size: 11, color: "#ffedd5", bold: true }),
      textLayer2("qz_question", box(24, 42, 250, 64, 3), "Which planet has the most moons?", { family: "serif", size: 24, color: "#ffffff", bold: true }, { name: "Question" }),
      buttonLayer("qz_a", box(24, 120, 312, 36, 4), "Jupiter", answer, { behavior: "quiz.answer", bindRowId: "qz_a" }),
      buttonLayer("qz_b", box(24, 164, 312, 36, 5), "Saturn", answer, { behavior: "quiz.answer", bindRowId: "qz_b", correct: true }),
      buttonLayer("qz_c", box(24, 208, 312, 36, 6), "Neptune", answer, { behavior: "quiz.answer", bindRowId: "qz_c" }),
      buttonLayer("qz_reveal", box(24, 260, 140, 32, 7), "Show answer", { fill: "rgba(0,0,0,0.25)", color: "#ffffff" }, { behavior: "widget.reveal", revealLayerId: "qz_answer", revealMode: "show" }),
      textLayer2("qz_answer", box(24, 300, 312, 44, 8), "Saturn. It has 146 confirmed moons.", { size: 14, color: "#ffffff", bold: true }, { visible: false })
    ]);
  }
  function seedQuizTruefalse() {
    const t = themes.citrus;
    return curatedCardSeed([
      artLayer("tf_art", artHtml("#fef9c3", '<div class="s" style="width:96px;height:96px;right:28px;top:26px;background:#bef264"></div><div class="s" style="width:52px;height:52px;right:96px;top:84px;background:#65a30d;opacity:.6"></div><div class="s" style="width:28px;height:28px;right:60px;top:118px;background:#1a2e05;opacity:.25"></div>')),
      textLayer2("tf_kicker", box(24, 24, 200, 20, 2), "OCEAN FACTS", { size: 11, color: t.accent, bold: true }),
      textLayer2("tf_statement", box(24, 50, 220, 100, 3), "An octopus has three hearts.", { family: "serif", size: 28, color: t.ink, bold: true }, { name: "Question" }),
      buttonLayer("tf_true", box(24, 176, 150, 52, 4), "True", t.primary, { behavior: "quiz.answer", bindRowId: "tf_true", correct: true }, { size: 17, radius: 14 }),
      buttonLayer("tf_false", box(186, 176, 150, 52, 5), "False", t.ghost, { behavior: "quiz.answer", bindRowId: "tf_false" }, { size: 17, radius: 14, stroke: "#a3e635" }),
      buttonLayer("tf_why", box(24, 244, 120, 30, 6), "Why?", { fill: "transparent", color: t.ink }, { behavior: "widget.reveal", revealLayerId: "tf_explain", revealMode: "toggle" }, { size: 13, stroke: t.ink }),
      textLayer2("tf_explain", box(24, 284, 312, 56, 7), "True. Two hearts pump blood to the gills and one pumps it to the rest of the body.", { size: 13, color: t.ink }, { visible: false })
    ]);
  }
  function seedQuizImage() {
    const t = themes.night;
    const pick = { fill: "rgba(255,255,255,0.08)", color: t.ink };
    return curatedCardSeed([
      artLayer("gi_art", artHtml("radial-gradient(circle at 70% 30%,#312e81 0%,#0f172a 70%)", '<div class="tower"><div class="leg l"></div><div class="leg r"></div><div class="deck" style="top:60px"></div><div class="deck" style="top:104px;width:92px;left:-16px"></div><div class="spire"></div></div><div class="s" style="left:250px;top:30px;width:6px;height:6px;background:#fde68a"></div><div class="s" style="left:322px;top:60px;width:4px;height:4px;background:#fde68a"></div>', ".tower{position:absolute;left:258px;top:40px;width:60px;height:150px;filter:blur(1.5px)}.leg{position:absolute;bottom:0;width:10px;height:140px;background:#a5b4fc}.leg.l{left:8px;transform:skewX(10deg)}.leg.r{right:8px;transform:skewX(-10deg)}.deck{position:absolute;left:-4px;width:68px;height:6px;background:#a5b4fc}.spire{position:absolute;left:27px;top:-10px;width:6px;height:40px;background:#a5b4fc}")),
      textLayer2("gi_kicker", box(24, 24, 200, 20, 2), "TRAVEL TRIVIA", { size: 11, color: t.accent, bold: true }),
      textLayer2("gi_question", box(24, 48, 210, 96, 3), "Which landmark is hiding in the haze?", { family: "serif", size: 24, color: t.ink, bold: true }, { name: "Question" }),
      buttonLayer("gi_a", box(24, 200, 100, 40, 4), "Big Ben", pick, { behavior: "quiz.answer", bindRowId: "gi_a" }, { radius: 10, stroke: "rgba(165,180,252,0.4)" }),
      buttonLayer("gi_b", box(130, 200, 100, 40, 5), "Eiffel Tower", pick, { behavior: "quiz.answer", bindRowId: "gi_b", correct: true }, { radius: 10, size: 12, stroke: "rgba(165,180,252,0.4)" }),
      buttonLayer("gi_c", box(236, 200, 100, 40, 6), "CN Tower", pick, { behavior: "quiz.answer", bindRowId: "gi_c" }, { radius: 10, size: 12, stroke: "rgba(165,180,252,0.4)" }),
      buttonLayer("gi_hint", box(24, 256, 110, 30, 7), "Show it", t.primary, { behavior: "widget.reveal", revealLayerId: "gi_answer", revealMode: "show" }, { size: 13 }),
      textLayer2("gi_answer", box(24, 294, 312, 44, 8), "The Eiffel Tower, Paris. Finished in 1889.", { size: 14, color: t.ink, bold: true }, { visible: false })
    ]);
  }
  function seedQuizRiddle() {
    const t = themes.paper;
    return curatedCardSeed([
      artLayer("rd_art", artHtml("#f6f1e7", '<div class="q">?</div><div class="r" style="left:24px;right:24px;top:236px;height:1px;background:#d6c7a8"></div>', ".q{position:absolute;right:20px;top:-30px;font:700 220px Georgia,serif;color:#eadfca;line-height:1}")),
      textLayer2("rd_kicker", box(24, 24, 200, 20, 2), "MONDAY RIDDLE", { size: 11, color: t.accent, bold: true }),
      textLayer2("rd_riddle", box(24, 52, 300, 120, 3), ["What has keys", "but can't open a single lock?"], { family: "serif", size: 22, color: t.ink, italic: true }, { name: "Question" }),
      buttonLayer("rd_reveal", box(24, 184, 160, 40, 4), "Reveal answer", t.primary, { behavior: "widget.reveal", revealLayerId: "rd_answer", revealMode: "toggle" }),
      textLayer2("rd_answer", box(24, 252, 312, 60, 5), "A piano.", { family: "serif", size: 34, color: t.accent, bold: true }, { visible: false }),
      textLayer2("rd_footer", box(24, 324, 312, 20, 6), "New riddle every morning", { size: 11, color: t.muted })
    ]);
  }
  function seedQuizPersonality() {
    const t = themes.rose;
    const card = { fill: "#ffffff", color: t.ink };
    return curatedCardSeed([
      artLayer("pp_art", artHtml("linear-gradient(170deg,#fff1f2 0%,#ffe4e6 100%)", '<div class="s" style="width:160px;height:160px;right:-50px;top:-60px;background:#fecdd3"></div><div class="s" style="width:70px;height:70px;right:70px;top:40px;background:#fda4af;opacity:.6"></div>')),
      textLayer2("pp_kicker", box(24, 16, 200, 20, 2), "WHICH ONE ARE YOU?", { size: 11, color: t.accent, bold: true }),
      textLayer2("pp_question", box(24, 38, 250, 62, 3), "Pick your perfect Sunday", { family: "serif", size: 24, color: t.ink, bold: true }, { name: "Question" }),
      buttonLayer("pp_a", box(24, 104, 312, 56, 4), "Slow brunch and a long book", card, { behavior: "poll.vote", bindRowId: "pp_a" }, { radius: 14, stroke: "#fecdd3" }),
      textLayer2("pp_a_note", box(24, 164, 312, 18, 5), "The Unhurried", { size: 11, color: t.muted, bold: true }),
      buttonLayer("pp_b", box(24, 188, 312, 56, 6), "A trail run before sunrise", card, { behavior: "poll.vote", bindRowId: "pp_b" }, { radius: 14, stroke: "#fecdd3" }),
      textLayer2("pp_b_note", box(24, 248, 312, 18, 7), "The Early Bird", { size: 11, color: t.muted, bold: true }),
      buttonLayer("pp_c", box(24, 272, 312, 56, 8), "Friends, a grill, and loud music", card, { behavior: "poll.vote", bindRowId: "pp_c" }, { radius: 14, stroke: "#fecdd3" }),
      textLayer2("pp_c_note", box(24, 332, 312, 18, 9), "The Host", { size: 11, color: t.muted, bold: true })
    ]);
  }
  function seedQuizMulti() {
    const t = themes.ink;
    const ans = { fill: "rgba(255,255,255,0.08)", color: t.ink };
    const q = (id2, frame, text) => textLayer2(id2, box(24, 56, 312, 64, 3), text, { family: "serif", size: 22, color: t.ink, bold: true }, { stepFrame: frame });
    const a = (id2, frame, row, face, correct = false) => buttonLayer(id2, box(24, 132 + row * 46, 312, 38, 10 + frame * 3 + row), face, ans, __spreadValues({ behavior: "quiz.answer", bindRowId: id2, stepFrame: frame }, correct ? { correct: true } : {}), { radius: 10, stroke: "rgba(250,204,21,0.3)" });
    return curatedCardSeed([
      artLayer("mq_art", artHtml("#0b0b0c", '<div class="r" style="left:0;top:0;width:360px;height:4px;background:linear-gradient(90deg,#facc15,#f97316)"></div><div class="s" style="width:200px;height:200px;right:-120px;bottom:-120px;border:28px solid rgba(250,204,21,0.12)"></div>')),
      textLayer2("mq_kicker", box(24, 24, 160, 20, 2), "SCIENCE QUIZ", { size: 11, color: t.accent, bold: true }),
      scoreLayer("mq_score", box(236, 20, 100, 26, 4), t.bg, t.accent),
      q("mq_q1", 0, "What gas do plants take in?"),
      a("mq_q1_a", 0, 0, "Oxygen"),
      a("mq_q1_b", 0, 1, "Carbon dioxide", true),
      a("mq_q1_c", 0, 2, "Nitrogen"),
      q("mq_q2", 1, "How many bones are in an adult human?"),
      a("mq_q2_a", 1, 0, "206", true),
      a("mq_q2_b", 1, 1, "186"),
      a("mq_q2_c", 1, 2, "312"),
      q("mq_q3", 2, "Which is the hottest planet?"),
      a("mq_q3_a", 2, 0, "Mercury"),
      a("mq_q3_b", 2, 1, "Venus", true),
      a("mq_q3_c", 2, 2, "Mars"),
      textLayer2("mq_done", box(24, 56, 312, 90, 3), ["That is the quiz.", "Send your score to the host."], { family: "serif", size: 22, color: t.ink, bold: true }, { stepFrame: 3 }),
      buttonLayer("mq_send", box(24, 170, 200, 44, 20), "Send my score", t.primary, { behavior: "widget.submit", label: "Science quiz score", stepFrame: 3 }),
      buttonLayer("mq_back", box(24, 300, 100, 36, 30), "Back", t.ghost, { behavior: "widget.step", stepDir: "prev" }),
      buttonLayer("mq_next", box(236, 300, 100, 36, 31), "Next", t.primary, { behavior: "widget.step", stepDir: "next" })
    ]);
  }
  function seedQuizUncover() {
    return curatedCardSeed([
      artLayer("tu_art", artHtml("linear-gradient(150deg,#4c1d95 0%,#7c3aed 100%)", '<div class="ticket"><div class="notch" style="left:-14px"></div><div class="notch" style="right:-14px"></div><div class="perf"></div></div>', ".ticket{position:absolute;left:24px;top:120px;width:312px;height:132px;border-radius:14px;background:#faf5ff}.notch{position:absolute;top:52px;width:28px;height:28px;border-radius:50%;background:#6d28d9}.perf{position:absolute;left:20px;right:20px;top:66px;border-top:2px dashed #ddd6fe}")),
      textLayer2("tu_kicker", box(24, 24, 200, 20, 2), "MYSTERY REWARD", { size: 11, color: "#ddd6fe", bold: true }),
      textLayer2("tu_title", box(24, 48, 312, 60, 3), "Tap the ticket to uncover your code", { family: "serif", size: 22, color: "#ffffff", bold: true }),
      panelLayer("tu_cover", box(44, 136, 272, 44, 4), "#c4b5fd", "Scratch here", { size: 15, color: "#4c1d95", bold: true, align: "center" }, { name: "Cover", cornerRadius: 10 }),
      textLayer2("tu_code", box(44, 192, 272, 48, 5), "CALM20", { family: "mono", size: 30, color: "#4c1d95", bold: true, align: "center" }, { visible: false, name: "Code" }),
      buttonLayer("tu_tap", box(24, 276, 312, 44, 6), "Uncover", { fill: "#facc15", color: "#2e1065" }, { behavior: "widget.reveal", revealLayerId: "tu_code", revealMode: "toggle" }, { size: 15 }),
      textLayer2("tu_fine", box(24, 330, 312, 20, 7), "20% off your first order. Ends Sunday.", { size: 11, color: "rgba(255,255,255,0.75)" })
    ]);
  }

  // ../pen-protocol/dist/curated/events.js
  function seedRsvpWidget() {
    const pick = { fill: "rgba(255,255,255,0.14)", color: "#ffffff" };
    return curatedCardSeed([
      artLayer("rv_art", artHtml("radial-gradient(circle at 30% 20%,#4c1d95 0%,#111827 70%)", '<div class="s" style="width:10px;height:10px;left:300px;top:40px;background:#f472b6"></div><div class="s" style="width:6px;height:6px;left:260px;top:90px;background:#fde68a"></div><div class="s" style="width:14px;height:14px;left:320px;top:130px;background:#34d399"></div><div class="s" style="width:8px;height:8px;left:230px;top:30px;background:#60a5fa"></div><div class="s" style="width:200px;height:200px;left:-80px;bottom:-90px;background:rgba(244,114,182,0.2)"></div>')),
      textLayer2("rv_kicker", box(24, 16, 200, 32, 2), "YOU'RE INVITED", { size: 11, color: "#f9a8d4", bold: true }),
      textLayer2("rv_title", box(24, 48, 312, 72, 3), "Rooftop launch party", { family: "serif", size: 30, color: "#ffffff", bold: true }, { name: "Question" }),
      textLayer2("rv_details", box(24, 116, 312, 40, 4), "Friday \xB7 7pm \xB7 Pier 17", { size: 15, color: "rgba(255,255,255,0.85)" }),
      textLayer2("rv_starts", box(24, 162, 120, 32, 5), "Starts in", { size: 12, color: "rgba(255,255,255,0.7)" }),
      countdownLayer("rv_time", box(22, 192, 90, 28, 6), "#fde68a", 2),
      buttonLayer("rv_going", box(24, 280, 100, 40, 7), "Going", { fill: "#f472b6", color: "#111827" }, { behavior: "poll.vote", bindRowId: "rv_going" }),
      buttonLayer("rv_maybe", box(130, 280, 100, 40, 8), "Maybe", pick, { behavior: "poll.vote", bindRowId: "rv_maybe" }),
      buttonLayer("rv_no", box(236, 280, 100, 40, 9), "Can't go", pick, { behavior: "poll.vote", bindRowId: "rv_no" })
    ]);
  }
  function seedEventLaunch() {
    const t = themes.ink;
    return curatedCardSeed([
      artLayer("lc_art", artHtml("radial-gradient(circle at 50% 120%,#7c2d12 0%,#0b0b0c 60%)", '<div class="rocket"></div><div class="s" style="left:40px;top:40px;width:3px;height:3px;background:#fff"></div><div class="s" style="left:300px;top:70px;width:2px;height:2px;background:#fff"></div><div class="s" style="left:220px;top:30px;width:3px;height:3px;background:#fde68a"></div><div class="s" style="left:90px;top:110px;width:2px;height:2px;background:#fff"></div>', ".rocket{position:absolute;left:162px;top:210px;width:36px;height:150px;border-radius:18px 18px 4px 4px;background:linear-gradient(180deg,#f5f5f4,#a8a29e);box-shadow:0 40px 60px 20px rgba(249,115,22,.35)}")),
      textLayer2("lc_kicker", box(0, 34, 360, 20, 2), "LAUNCHING SOON", { size: 11, color: t.accent, bold: true, align: "center" }),
      textLayer2("lc_title", box(24, 58, 312, 76, 3), "Pen 2.0 goes live", { family: "serif", size: 34, color: t.ink, bold: true, align: "center" }),
      countdownLayer("lc_time", box(110, 142, 140, 32, 4), t.bg, 5, t.accent),
      buttonLayer("lc_remind", box(24, 296, 312, 44, 5), "Remind me", { fill: "#ffffff", color: "#0b0b0c" }, { behavior: "cta.calendar", eventTitle: "Pen 2.0 launch", eventStart: eventStartIn(5, 17), eventDurationMin: 30, eventLocation: "parnoir.com" }, { size: 15 })
    ]);
  }
  function seedEventLive() {
    return curatedCardSeed([
      artLayer("lv_art", artHtml("linear-gradient(90deg,#18181b 0%,#3f0d12 100%)", '<div class="r" style="left:20px;top:18px;width:64px;height:24px;border-radius:12px;background:#dc2626"></div><div class="eq"><i style="height:20px"></i><i style="height:34px"></i><i style="height:14px"></i><i style="height:28px"></i><i style="height:40px"></i></div>', ".eq{position:absolute;left:206px;top:40px;display:flex;gap:4px;align-items:flex-end;height:40px}.eq i{display:block;width:5px;border-radius:2px;background:rgba(248,113,113,.55)}"), 120),
      textLayer2("lv_pill", box(20, 14, 64, 20, 2), "LIVE", { size: 11, color: "#ffffff", bold: true, align: "center" }),
      textLayer2("lv_title", box(20, 52, 190, 52, 3), "Studio Q&A with the team", { family: "serif", size: 18, color: "#ffffff", bold: true }),
      buttonLayer("lv_watch", box(256, 38, 84, 44, 4), "Watch", { fill: "#ffffff", color: "#18181b" }, { behavior: "cta.open", openUrl: "https://parnoir.com/live" }, { size: 14 })
    ]);
  }
  function seedEventCheckin() {
    const t = themes.forest;
    return curatedCardSeed([
      artLayer("ci_art", artHtml("linear-gradient(180deg,#052e16 0%,#14532d 100%)", '<div class="bld" style="left:196px;width:44px;height:120px"></div><div class="bld" style="left:244px;width:56px;height:160px"></div><div class="bld" style="left:304px;width:40px;height:96px"></div><div class="win"></div>', ".bld{position:absolute;bottom:0;background:#166534;border-radius:4px 4px 0 0}.win{position:absolute;left:254px;bottom:20px;width:36px;height:120px;background-image:linear-gradient(#bbf7d0 6px,transparent 6px);background-size:12px 18px;opacity:.45}")),
      textLayer2("ci_kicker", box(24, 24, 200, 20, 2), "TONIGHT \xB7 DOORS 7 PM", { size: 11, color: t.accent, bold: true }),
      textLayer2("ci_title", box(24, 48, 180, 96, 3), "Makers meetup at The Foundry", { family: "serif", size: 24, color: t.ink, bold: true }),
      textLayer2("ci_addr", box(24, 148, 180, 40, 4), ["21 Mill Street", "Second floor"], { size: 12, color: t.muted }),
      buttonLayer("ci_stamp", box(24, 216, 160, 52, 5), "Check in", t.primary, { behavior: "widget.stamp", label: "Check in" }, { size: 16, radius: 14 }),
      textLayer2("ci_note", box(24, 280, 170, 40, 6), "Tap when you arrive. Show the stamp at the door.", { size: 11, color: t.muted })
    ]);
  }
  function seedEventSavedate() {
    const t = themes.rose;
    return curatedCardSeed([
      artLayer("sd_art", artHtml("#fff1f2", '<div class="cal"><div class="top">JUN</div><div class="day">12</div></div><div class="s" style="width:220px;height:220px;right:-90px;bottom:-110px;background:#fecdd3"></div>', ".cal{position:absolute;left:24px;top:24px;width:96px;height:108px;border-radius:14px;background:#fff;box-shadow:0 6px 18px rgba(159,18,57,.15);overflow:hidden;text-align:center;font-family:Montserrat,Helvetica,sans-serif}.cal .top{background:#e11d48;color:#fff;font-weight:800;font-size:14px;letter-spacing:3px;padding:6px 0}.cal .day{font-size:52px;font-weight:800;color:#4c0519;line-height:72px}")),
      textLayer2("sd_kicker", box(140, 30, 196, 20, 2), "JUNE 2027 \xB7 PORTLAND", { size: 11, color: t.accent, bold: true }),
      textLayer2("sd_title", box(140, 54, 196, 80, 3), "Maya and Theo are getting married", { family: "serif", size: 21, color: t.ink, bold: true }),
      textLayer2("sd_place", box(24, 156, 312, 44, 4), ["Saturday, 4 pm", "Glasshouse Gardens, Portland"], { size: 13, color: t.muted }),
      buttonLayer("sd_cal", box(24, 224, 200, 44, 5), "Add to calendar", t.primary, { behavior: "cta.calendar", eventTitle: "Maya and Theo wedding", eventLocation: "Glasshouse Gardens, Portland", eventStart: new Date(2027, 5, 12, 16).toISOString(), eventDurationMin: 300 }),
      textLayer2("sd_note", box(24, 284, 220, 40, 6), "Formal invitation to follow.", { family: "serif", size: 13, color: t.ink, italic: true })
    ]);
  }
  function seedEventAgenda() {
    const t = themes.slate;
    const row = { fill: "#ffffff", color: t.ink };
    const detail = (id2, lines) => panelLayer(id2, box(24, 254, 312, 84, 10), "#0f172a", lines, { size: 13, color: "#e2e8f0" }, { visible: false, name: "Details" });
    return curatedCardSeed([
      artLayer("ag_art", artHtml("#e2e8f0", '<div class="r" style="left:24px;top:94px;width:2px;height:144px;background:#94a3b8"></div><div class="hint">Tap a session for the room and details</div>', ".hint{position:absolute;left:24px;top:254px;width:312px;height:84px;box-sizing:border-box;border:2px dashed #cbd5e1;border-radius:12px;display:flex;align-items:center;justify-content:center;font:600 12px Montserrat,Helvetica,sans-serif;color:#64748b}")),
      textLayer2("ag_kicker", box(24, 22, 200, 20, 2), "CONFERENCE DAY", { size: 11, color: t.accent, bold: true }),
      textLayer2("ag_title", box(24, 44, 312, 40, 3), "Saturday agenda", { family: "serif", size: 26, color: t.ink, bold: true }),
      buttonLayer("ag_1", box(36, 96, 300, 40, 4), "9:00  Keynote", row, { behavior: "widget.reveal", revealLayerId: "ag_1_d", revealMode: "tab" }, { radius: 10, stroke: "#cbd5e1" }),
      buttonLayer("ag_2", box(36, 144, 300, 40, 5), "11:30  Hands-on workshops", row, { behavior: "widget.reveal", revealLayerId: "ag_2_d", revealMode: "tab" }, { radius: 10, stroke: "#cbd5e1" }),
      buttonLayer("ag_3", box(36, 192, 300, 40, 6), "15:00  Closing panel", row, { behavior: "widget.reveal", revealLayerId: "ag_3_d", revealMode: "tab" }, { radius: 10, stroke: "#cbd5e1" }),
      detail("ag_1_d", ["Main hall", "Why calm software wins, with the founding team."]),
      detail("ag_2_d", ["Rooms A to D", "Pick one: widgets, publishing, design systems, or audio."]),
      detail("ag_3_d", ["Main hall", "Five creators on building an audience without an algorithm."])
    ]);
  }

  // ../pen-protocol/dist/curated/links.js
  function seedLinkCardWidget() {
    return curatedCardSeed([
      artLayer("lk_art", artHtml("linear-gradient(135deg,#fef3c7 0%,#fde68a 45%,#f59e0b 100%)", '<div class="s" style="width:260px;height:260px;right:-90px;top:-90px;background:rgba(255,255,255,0.45)"></div><div class="r" style="left:32px;top:108px;width:64px;height:6px;background:#111827"></div>')),
      textLayer2("lk_kicker", box(24, 16, 200, 32, 2), "NEW ON THE BLOG", { size: 11, color: "#92400e", bold: true }),
      textLayer2("lk_title", box(24, 120, 312, 88, 3), "How we built a calmer feed", { family: "serif", size: 30, color: "#111827", bold: true }),
      textLayer2("lk_sub", box(24, 208, 312, 64, 4), "Six choices that put people before engagement.", { size: 14, color: "#3f3f46" }),
      buttonLayer("lk_open", box(24, 288, 160, 44, 5), "Read the story", { fill: "#111827", color: "#ffffff" }, { behavior: "cta.open", openUrl: "https://parnoir.com" })
    ]);
  }
  function seedLinkBio() {
    const t = themes.paper;
    const link = { fill: "#ffffff", color: t.ink };
    const row = (id2, i, face, url) => buttonLayer(id2, box(24, 140 + i * 50, 312, 42, 4 + i), face, link, { behavior: "cta.open", openUrl: url }, { radius: 12, stroke: "#e7e0d2" });
    return curatedCardSeed([
      artLayer("lb_art", artHtml("#f6f1e7", '<div class="av"></div>', ".av{position:absolute;left:150px;top:18px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle at 50% 38%,#fcd34d 0 13px,transparent 14px),radial-gradient(circle at 50% 100%,#fcd34d 0 26px,transparent 27px),#b45309;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.12)}")),
      textLayer2("lb_name", box(0, 84, 360, 26, 2), "Ana Ruiz", { family: "serif", size: 20, color: t.ink, bold: true, align: "center" }),
      textLayer2("lb_bio", box(0, 108, 360, 22, 3), "Ceramics, slow travel, and notes from the studio", { size: 11, color: t.muted, align: "center" }),
      row("lb_shop", 0, "Shop the spring glazes", "https://parnoir.com/shop"),
      row("lb_news", 1, "Studio newsletter", "https://parnoir.com/news"),
      row("lb_class", 2, "Book a wheel class", "https://parnoir.com/classes"),
      row("lb_video", 3, "Watch the kiln opening", "https://parnoir.com/video")
    ]);
  }
  function seedLinkTeaser() {
    const t = themes.slate;
    return curatedCardSeed([
      artLayer("rmt_art", artHtml("#ffffff", '<div class="r" style="left:0;top:0;width:8px;height:360px;background:#0369a1"></div>')),
      textLayer2("rmt_kicker", box(28, 22, 260, 20, 2), "ESSAY \xB7 6 MIN READ", { size: 11, color: t.accent, bold: true }),
      textLayer2("rmt_title", box(28, 46, 304, 64, 3), "The case for boring technology", { family: "serif", size: 24, color: t.ink, bold: true }),
      textLayer2("rmt_excerpt", box(28, 116, 304, 60, 4), "The tools that last are rarely the ones that trend. They are the ones you forget are there.", { family: "serif", size: 14, color: "#334155" }),
      buttonLayer("rmt_more", box(28, 184, 120, 32, 5), "Read more", { fill: "#e0f2fe", color: "#0369a1" }, { behavior: "widget.reveal", revealLayerId: "rmt_rest", revealMode: "toggle" }, { size: 13 }),
      textLayer2("rmt_rest", box(28, 224, 304, 72, 6), "Every new dependency is a promise to keep. Choose the ones with a long history, a small surface, and people who still answer email.", { family: "serif", size: 13, color: "#334155" }, { visible: false }),
      buttonLayer("rmt_full", box(28, 304, 160, 40, 7), "Full article", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/essays/boring" })
    ]);
  }
  function seedLinkAppbadge() {
    const badge = { fill: "#000000", color: "#ffffff" };
    return curatedCardSeed([
      artLayer("ab_art", artHtml("linear-gradient(160deg,#ecfeff 0%,#cffafe 100%)", '<div class="phone"><div class="screen"><div class="tile" style="top:16px"></div><div class="tile" style="top:52px;width:60%"></div><div class="tile" style="top:88px"></div><div class="dot"></div></div></div>', ".phone{position:absolute;left:220px;top:40px;width:110px;height:220px;border-radius:22px;background:#0f172a;padding:8px;box-sizing:border-box;transform:rotate(6deg);box-shadow:0 20px 40px rgba(14,116,144,.3)}.screen{position:relative;width:100%;height:100%;border-radius:15px;background:linear-gradient(180deg,#22d3ee,#0e7490)}.tile{position:absolute;left:10px;width:74px;height:24px;border-radius:6px;background:rgba(255,255,255,.35)}.dot{position:absolute;left:36px;bottom:12px;width:22px;height:22px;border-radius:50%;background:#fff}")),
      textLayer2("ab_kicker", box(24, 34, 180, 20, 2), "NOW ON MOBILE", { size: 11, color: "#0e7490", bold: true }),
      textLayer2("ab_title", box(24, 58, 186, 96, 3), "Take your notes anywhere", { family: "serif", size: 26, color: "#083344", bold: true }),
      textLayer2("ab_sub", box(24, 160, 186, 44, 4), "Offline, synced, and private by default.", { size: 13, color: "#155e75" }),
      buttonLayer("ab_ios", box(24, 232, 150, 44, 5), "App Store", badge, { behavior: "cta.open", openUrl: "https://apps.apple.com" }, { radius: 10 }),
      buttonLayer("ab_android", box(24, 284, 150, 44, 6), "Google Play", badge, { behavior: "cta.open", openUrl: "https://play.google.com" }, { radius: 10 })
    ]);
  }
  function seedLinkSwipeup() {
    return curatedCardSeed([
      artLayer("su_art", artHtml("linear-gradient(180deg,#1e1b4b 0%,#7c3aed 55%,#f472b6 100%)", '<div class="s" style="width:300px;height:300px;left:-80px;top:120px;background:rgba(255,255,255,0.08)"></div><div class="s" style="width:180px;height:180px;right:-60px;top:40px;background:rgba(253,230,138,0.2)"></div><div class="chev" style="top:470px"></div><div class="chev" style="top:486px;opacity:.6"></div>', ".chev{position:absolute;left:166px;width:28px;height:28px;border-left:4px solid #fff;border-top:4px solid #fff;transform:rotate(45deg)}"), 640),
      textLayer2("su_kicker", box(24, 48, 312, 20, 2), "LIMITED DROP", { size: 12, color: "#fde68a", bold: true }),
      textLayer2("su_title", box(24, 76, 312, 180, 3), ["The midnight", "collection", "is here"], { family: "serif", size: 44, color: "#ffffff", bold: true }),
      textLayer2("su_sub", box(24, 270, 280, 60, 4), "Twelve pieces, hand-dyed in small batches. When they are gone, they are gone.", { size: 15, color: "rgba(255,255,255,0.85)" }),
      textLayer2("su_ends", box(24, 360, 312, 20, 5), "DROP CLOSES IN", { size: 11, color: "#fde68a", bold: true, align: "center" }),
      countdownLayer("su_timer", box(80, 386, 200, 44, 6), "#ffffff", 3, "rgba(30,27,75,0.45)"),
      buttonLayer("su_go", box(60, 540, 240, 52, 7), "Swipe up to shop", { fill: "#ffffff", color: "#4c1d95" }, { behavior: "cta.open", openUrl: "https://parnoir.com/midnight" }, { size: 16 })
    ]);
  }
  function seedLinkMessage() {
    const t = themes.night;
    return curatedCardSeed([
      artLayer("mm_art", artHtml("#0f172a", '<div class="b in" style="top:110px;width:150px">Do you take custom orders?</div><div class="b out" style="top:160px;width:120px">Always. Tell me more.</div>', ".b{position:absolute;padding:10px 12px;border-radius:16px;font:500 12px Montserrat,Helvetica,sans-serif;line-height:1.3}.in{left:24px;background:#1e293b;color:#e2e8f0;border-bottom-left-radius:4px}.out{right:24px;background:#818cf8;color:#0f172a;border-bottom-right-radius:4px}")),
      textLayer2("mm_kicker", box(24, 24, 200, 20, 2), "DIRECT LINE", { size: 11, color: t.accent, bold: true }),
      textLayer2("mm_title", box(24, 48, 312, 40, 3), "Questions? Message me.", { family: "serif", size: 24, color: t.ink, bold: true }),
      textLayer2("mm_sub", box(24, 228, 312, 40, 4), "I reply within a day, usually sooner.", { size: 13, color: t.muted }),
      buttonLayer("mm_send", box(24, 280, 200, 48, 5), "Send a message", t.primary, { behavior: "widget.submit", label: "Message from your widget" }, { size: 15 })
    ]);
  }

  // ../pen-protocol/dist/curated/forms.js
  function seedFormNewsletter() {
    const t = themes.paper;
    return curatedCardSeed([
      artLayer("nl_art", artHtml("#f6f1e7", '<div class="env"><div class="flap"></div></div>', ".env{position:absolute;right:28px;top:28px;width:96px;height:64px;border-radius:6px;background:#fff;border:2px solid #1c1917;overflow:hidden}.flap{position:absolute;left:-2px;top:-36px;width:96px;height:64px;border:2px solid #1c1917;transform:rotate(45deg) skew(-8deg,-8deg);transform-origin:0 100%;background:#f6f1e7}")),
      textLayer2("nl_kicker", box(24, 28, 180, 20, 2), "EVERY OTHER SUNDAY", { size: 11, color: t.accent, bold: true }),
      textLayer2("nl_title", box(24, 52, 210, 72, 3), "The Slow Letter", { family: "serif", size: 30, color: t.ink, bold: true }),
      textLayer2("nl_sub", box(24, 130, 312, 44, 4), "One essay, three links, and nothing you need to reply to.", { size: 13, color: t.muted }),
      inputLayer("nl_email", box(24, 196, 312, 44, 5), "you@example.com", t.field, { name: "Email", strokeColor: "#d6c7a8", strokeWidth: 1 }),
      buttonLayer("nl_sub_btn", box(24, 250, 312, 44, 6), "Subscribe", t.primary, { behavior: "widget.submit", label: "Newsletter signup" }, { radius: 10 }),
      textLayer2("nl_privacy", box(24, 306, 312, 32, 7), "Unsubscribe any time. Your address is never shared.", { size: 11, color: t.muted })
    ]);
  }
  function seedFormContact() {
    const t = themes.night;
    return curatedCardSeed([
      artLayer("ct_art", artHtml("linear-gradient(160deg,#0f172a 0%,#172554 100%)", '<div class="r" style="left:24px;top:68px;width:40px;height:3px;background:#818cf8"></div>')),
      textLayer2("ct_title", box(24, 20, 312, 40, 2), "Get in touch", { family: "serif", size: 26, color: t.ink, bold: true }),
      inputLayer("ct_name", box(24, 88, 150, 40, 3), "Your name", t.field, { name: "Name" }),
      inputLayer("ct_email", box(186, 88, 150, 40, 4), "Email", t.field, { name: "Email" }),
      inputLayer("ct_msg", box(24, 138, 312, 120, 5), "How can we help?", t.field, { name: "Message" }),
      buttonLayer("ct_send", box(24, 272, 140, 44, 6), "Send", t.primary, { behavior: "widget.submit", label: "Contact form" }, { size: 15 }),
      textLayer2("ct_note", box(176, 278, 160, 36, 7), "We answer within two working days.", { size: 11, color: t.muted })
    ]);
  }
  function seedFormFeedback() {
    const t = themes.citrus;
    return curatedCardSeed([
      artLayer("fb_art", artHtml("#fef9c3", '<div class="bub"></div>', '.bub{position:absolute;right:28px;top:24px;width:70px;height:52px;border-radius:14px;background:#bef264}.bub:after{content:"";position:absolute;left:14px;bottom:-12px;border:8px solid transparent;border-top-color:#bef264;border-left-color:#bef264}')),
      textLayer2("fb_kicker", box(24, 28, 200, 20, 2), "TWO MINUTES", { size: 11, color: t.accent, bold: true }),
      textLayer2("fb_title", box(24, 52, 230, 64, 3), "What would make this better?", { family: "serif", size: 24, color: t.ink, bold: true }),
      inputLayer("fb_text", box(24, 128, 312, 136, 4), "Be as blunt as you like\u2026", t.field, { name: "Feedback", strokeColor: "#d9f99d", strokeWidth: 1 }),
      buttonLayer("fb_send", box(24, 280, 160, 44, 5), "Send feedback", t.primary, { behavior: "widget.submit", label: "Feedback" }),
      textLayer2("fb_anon", box(196, 286, 140, 32, 6), "Read by the whole team.", { size: 11, color: t.muted })
    ]);
  }
  function seedFormWaitlist() {
    const t = themes.ink;
    return curatedCardSeed([
      artLayer("wl_art", artHtml("radial-gradient(circle at 50% 0%,#422006 0%,#0b0b0c 65%)", '<div class="ring" style="width:140px;height:140px;left:110px;top:-60px"></div><div class="ring" style="width:220px;height:220px;left:70px;top:-100px;opacity:.5"></div>', ".ring{position:absolute;border-radius:50%;border:1px solid rgba(250,204,21,.4)}")),
      textLayer2("wl_kicker", box(0, 96, 360, 20, 2), "PRIVATE BETA", { size: 11, color: t.accent, bold: true, align: "center" }),
      textLayer2("wl_title", box(24, 120, 312, 44, 3), "Be first in line", { family: "serif", size: 30, color: t.ink, bold: true, align: "center" }),
      textLayer2("wl_sub", box(24, 166, 312, 24, 4), "We let in fifty people a week.", { size: 13, color: t.muted, align: "center" }),
      inputLayer("wl_email", box(24, 214, 312, 44, 5), "Email address", t.field, { name: "Email", strokeColor: "rgba(250,204,21,0.3)", strokeWidth: 1 }),
      buttonLayer("wl_join", box(24, 268, 312, 44, 6), "Join waitlist", t.primary, { behavior: "widget.submit", label: "Waitlist" }, { size: 15, radius: 10 })
    ]);
  }
  function seedFormQuote() {
    const t = themes.slate;
    return curatedCardSeed([
      artLayer("rq_art", artHtml("#e2e8f0", '<div class="ruler"></div>', ".ruler{position:absolute;left:0;top:0;width:360px;height:12px;background:repeating-linear-gradient(90deg,#94a3b8 0 1px,transparent 1px 12px),#cbd5e1}")),
      textLayer2("rq_kicker", box(24, 28, 200, 20, 2), "STUDIO NORTH", { size: 11, color: t.accent, bold: true }),
      textLayer2("rq_title", box(24, 50, 312, 36, 3), "Plan your project", { family: "serif", size: 26, color: t.ink, bold: true }),
      inputLayer("rq_name", box(24, 100, 312, 40, 4), "Name and company", t.field, { name: "Name" }),
      inputLayer("rq_project", box(24, 150, 312, 64, 5), "What are you building?", t.field, { name: "Project" }),
      inputLayer("rq_budget", box(24, 224, 150, 40, 6), "Budget", t.field, { name: "Budget" }),
      inputLayer("rq_date", box(186, 224, 150, 40, 7), "Ideal start date", t.field, { name: "Start" }),
      buttonLayer("rq_send", box(24, 280, 312, 44, 8), "Send request", t.primary, { behavior: "widget.submit", label: "Quote request" }, { radius: 10 })
    ]);
  }
  function seedFormMultistep() {
    const t = themes.forest;
    const step = (id2, frame) => textLayer2(id2, box(24, 24, 200, 20, 2), `STEP ${frame + 1} OF 3`, { size: 11, color: t.accent, bold: true }, { stepFrame: frame });
    return curatedCardSeed([
      artLayer("ms_art", artHtml("linear-gradient(170deg,#052e16 0%,#14532d 100%)", '<div class="dot" style="left:258px"></div><div class="dot" style="left:284px"></div><div class="dot" style="left:310px"></div>', ".dot{position:absolute;top:28px;width:14px;height:14px;border-radius:50%;border:2px solid #86efac;box-sizing:border-box}")),
      step("ms_s1", 0),
      textLayer2("ms_q1", box(24, 52, 312, 40, 3), "What should we call you?", { family: "serif", size: 22, color: t.ink, bold: true }, { stepFrame: 0 }),
      inputLayer("ms_name", box(24, 120, 312, 44, 4), "Your name", t.field, { name: "Name", stepFrame: 0 }),
      step("ms_s2", 1),
      textLayer2("ms_q2", box(24, 52, 312, 40, 3), "Where can we reach you?", { family: "serif", size: 22, color: t.ink, bold: true }, { stepFrame: 1 }),
      inputLayer("ms_email", box(24, 120, 312, 44, 4), "Email address", t.field, { name: "Email", stepFrame: 1 }),
      step("ms_s3", 2),
      textLayer2("ms_q3", box(24, 52, 312, 40, 3), "Anything we should know?", { family: "serif", size: 22, color: t.ink, bold: true }, { stepFrame: 2 }),
      inputLayer("ms_msg", box(24, 104, 312, 100, 4), "A few words\u2026", t.field, { name: "Message", stepFrame: 2 }),
      buttonLayer("ms_send", box(24, 220, 312, 44, 6), "Send", t.primary, { behavior: "widget.submit", label: "Intake form", stepFrame: 2 }, { radius: 10 }),
      buttonLayer("ms_back", box(24, 296, 100, 40, 7), "Back", t.ghost, { behavior: "widget.step", stepDir: "prev" }),
      buttonLayer("ms_next", box(236, 296, 100, 40, 8), "Next", t.primary, { behavior: "widget.step", stepDir: "next" })
    ]);
  }

  // ../pen-protocol/dist/curated/community.js
  function seedCommunityFeatures() {
    const t = themes.night;
    const row = { fill: "rgba(255,255,255,0.06)", color: t.ink };
    const idea = (id2, i, face) => buttonLayer(id2, box(24, 116 + i * 52, 312, 44, 4 + i), face, row, { behavior: "widget.rank", bindRowId: id2 }, { radius: 10, stroke: "rgba(129,140,248,0.35)" });
    return curatedCardSeed([
      artLayer("fbd_art", artHtml("#0f172a", '<div class="r" style="left:0;top:0;width:360px;height:96px;background:linear-gradient(90deg,#312e81,#0f172a)"></div><div class="r" style="right:24px;top:30px;width:40px;height:40px;border-radius:10px;border:2px dashed rgba(129,140,248,.6)"></div>')),
      textLayer2("fbd_kicker", box(24, 22, 200, 20, 2), "COMMUNITY ROADMAP", { size: 11, color: t.accent, bold: true }),
      textLayer2("fbd_title", box(24, 44, 260, 44, 3), "What should we ship next?", { family: "serif", size: 22, color: t.ink, bold: true }),
      idea("fbd_dark", 0, "Dark mode everywhere"),
      idea("fbd_export", 1, "Export to PDF"),
      idea("fbd_collab", 2, "Live co-editing"),
      idea("fbd_api", 3, "Public API"),
      textLayer2("fbd_note", box(24, 326, 312, 20, 8), "Tap in order, most wanted first.", { size: 11, color: t.muted })
    ]);
  }
  function seedCommunityGuestbook() {
    const t = themes.paper;
    return curatedCardSeed([
      artLayer("gb_art", artHtml("#f6f1e7", '<div class="page"></div>', ".page{position:absolute;left:24px;top:96px;width:312px;height:120px;border-radius:6px;background:#fffdf8;background-image:repeating-linear-gradient(#fffdf8 0 23px,#e7dcc4 23px 24px);border:1px solid #e7dcc4}")),
      textLayer2("gb_kicker", box(24, 22, 200, 20, 2), "OPEN STUDIO \xB7 SPRING 2026", { size: 11, color: t.accent, bold: true }),
      textLayer2("gb_title", box(24, 44, 312, 40, 3), "You were here", { family: "serif", size: 26, color: t.ink, bold: true, italic: true }),
      inputLayer("gb_note", box(36, 108, 288, 96, 4), "Leave a line for the next visitor\u2026", { fill: "transparent", color: t.ink }, { name: "Note" }),
      buttonLayer("gb_sign", box(24, 236, 160, 44, 5), "Sign the book", t.primary, { behavior: "widget.submit", label: "Guestbook entry" }),
      textLayer2("gb_hint", box(24, 292, 312, 40, 6), "Signing saves your note with the date you stopped by.", { size: 11, color: t.muted })
    ]);
  }
  function seedCommunityChallenge() {
    const t = themes.forest;
    const day = { fill: "rgba(134,239,172,0.12)", color: t.ink };
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return curatedCardSeed([
      artLayer("ch_art", artHtml("linear-gradient(170deg,#052e16 0%,#166534 100%)", '<div class="flag"></div>', '.flag{position:absolute;right:30px;top:24px;width:4px;height:72px;background:#86efac}.flag:after{content:"";position:absolute;left:4px;top:0;width:44px;height:28px;background:#86efac;clip-path:polygon(0 0,100% 50%,0 100%)}')),
      textLayer2("ch_kicker", box(24, 22, 200, 20, 2), "7-DAY CHALLENGE", { size: 11, color: t.accent, bold: true }),
      textLayer2("ch_title", box(24, 44, 250, 64, 3), "Ten minutes outside, every day", { family: "serif", size: 22, color: t.ink, bold: true }),
      ...days.slice(0, 4).map((d, i) => buttonLayer(`ch_${d.toLowerCase()}`, box(24 + i * 81, 136, 69, 56, 4 + i), d, day, { behavior: "widget.toggle", bindRowId: `ch_${d.toLowerCase()}` }, { radius: 12, stroke: "rgba(134,239,172,0.4)" })),
      ...days.slice(4).map((d, i) => buttonLayer(`ch_${d.toLowerCase()}`, box(64 + i * 81, 204, 69, 56, 8 + i), d, day, { behavior: "widget.toggle", bindRowId: `ch_${d.toLowerCase()}` }, { radius: 12, stroke: "rgba(134,239,172,0.4)" })),
      textLayer2("ch_note", box(24, 284, 312, 40, 12), "Tap a day when you have done it. Tap again to undo.", { size: 12, color: t.muted })
    ]);
  }
  function seedCommunityReactions() {
    const t = themes.rose;
    const words = ["Love", "Fun", "Wow", "Hmm", "Sad"];
    const fills = ["#e11d48", "#f97316", "#eab308", "#64748b", "#3b82f6"];
    return curatedCardSeed([
      artLayer("rb_art", artHtml("#fff1f2", '<div class="s" style="width:34px;height:34px;left:250px;top:30px;background:#fda4af"></div><div class="s" style="width:22px;height:22px;left:292px;top:22px;background:#fdba74"></div><div class="s" style="width:16px;height:16px;left:300px;top:62px;background:#fde047"></div>')),
      textLayer2("rb_kicker", box(24, 28, 200, 20, 2), "HOW DID THIS LAND?", { size: 11, color: t.accent, bold: true }),
      textLayer2("rb_title", box(24, 52, 312, 72, 3), "React to the new chapter", { family: "serif", size: 26, color: t.ink, bold: true }, { name: "Question" }),
      ...words.map((w2, i) => buttonLayer(`rb_${w2.toLowerCase()}`, box(24 + i * 63, 168, 57, 57, 4 + i), w2, { fill: fills[i], color: "#ffffff" }, { behavior: "poll.vote", bindRowId: `rb_${w2.toLowerCase()}` }, { size: 12 })),
      textLayer2("rb_note", box(24, 250, 312, 40, 9), "Counts appear once you react.", { size: 12, color: t.muted })
    ]);
  }
  function seedCommunityAma() {
    const t = themes.sunset;
    return curatedCardSeed([
      artLayer("ama_art", artHtml("linear-gradient(160deg,#9a3412 0%,#7c2d12 100%)", '<div class="mic"></div>', '.mic{position:absolute;right:36px;top:26px;width:34px;height:54px;border-radius:17px;background:#fdba74}.mic:after{content:"";position:absolute;left:15px;top:58px;width:4px;height:22px;background:#fdba74}')),
      textLayer2("ama_kicker", box(24, 24, 200, 20, 2), "ASK ME ANYTHING", { size: 11, color: t.accent, bold: true }),
      textLayer2("ama_title", box(24, 48, 240, 72, 3), "I've run a bakery for ten years. Ask away.", { family: "serif", size: 20, color: t.ink, bold: true }),
      inputLayer("ama_q", box(24, 136, 312, 96, 4), "Your question\u2026", t.field, { name: "Question" }),
      buttonLayer("ama_ask", box(24, 246, 120, 44, 5), "Ask", t.primary, { behavior: "widget.submit", label: "AMA question" }, { size: 15 }),
      textLayer2("ama_when", box(156, 244, 180, 18, 6), "ANSWERS GO LIVE IN", { size: 10, color: t.accent, bold: true }),
      countdownLayer("ama_live", box(156, 264, 180, 28, 7), t.ink, 4, "rgba(67,20,7,0.45)")
    ]);
  }

  // ../pen-protocol/dist/curated/social.js
  function seedSocialQuote() {
    const t = themes.paper;
    return curatedCardSeed([
      artLayer("qc_art", artHtml("#1c1917", '<div class="mark">&ldquo;</div><div class="r" style="left:24px;top:262px;width:48px;height:3px;background:#f59e0b"></div>', ".mark{position:absolute;left:14px;top:-34px;font:700 180px Georgia,serif;color:#44403c;line-height:1}")),
      textLayer2("qc_quote", box(24, 64, 312, 184, 2), "Simplicity is not the absence of clutter. It is the presence of a clear idea.", { family: "serif", size: 25, color: "#fafaf9", italic: true }),
      textLayer2("qc_who", box(24, 276, 220, 40, 3), ["Lena Ortiz", "Designer, Field Notes"], { size: 12, color: "#d6d3d1", bold: true }),
      buttonLayer("qc_src", box(256, 280, 80, 32, 4), "Source", { fill: "#f59e0b", color: t.ink }, { behavior: "cta.open", openUrl: "https://parnoir.com/quotes" }, { size: 12 })
    ]);
  }
  function seedSocialAnnounce() {
    return curatedCardSeed([
      artLayer("an_art", artHtml("#facc15", '<div class="r" style="left:-40px;top:250px;width:460px;height:40px;background:#0b0b0c;transform:rotate(-6deg)"></div><div class="r" style="left:-40px;top:300px;width:460px;height:14px;background:#0b0b0c;transform:rotate(-6deg);opacity:.25"></div>')),
      textLayer2("an_kicker", box(24, 24, 200, 20, 2), "BIG NEWS", { size: 12, color: "#0b0b0c", bold: true }),
      textLayer2("an_title", box(24, 48, 312, 110, 3), ["We're moving", "to Pen"], { family: "serif", size: 40, color: "#0b0b0c", bold: true }),
      textLayer2("an_body", box(24, 160, 312, 60, 4), "Same writing, new home. Your subscription carries over and nothing changes on your end.", { size: 13, color: "#1c1917" }),
      panelLayer("an_changes", box(24, 160, 312, 128, 6), "#0b0b0c", ["What changes for you", "Nothing to do. Old links redirect, comments come with us, and the price stays the same."], { size: 13, color: "#facc15", bold: true }, { visible: false, name: "What changes" }),
      buttonLayer("an_more", box(24, 302, 120, 40, 5), "Details", { fill: "#0b0b0c", color: "#facc15" }, { behavior: "cta.open", openUrl: "https://parnoir.com/news/pen" }),
      buttonLayer("an_what", box(156, 302, 160, 40, 7), "What changes?", { fill: "rgba(11,11,12,0.12)", color: "#0b0b0c" }, { behavior: "widget.reveal", revealLayerId: "an_changes", revealMode: "toggle" }, { size: 13 })
    ]);
  }
  function seedSocialBeforeafter() {
    const t = themes.slate;
    return curatedCardSeed([
      artLayer("ba_art", artHtml("#0f172a", '<div class="pane"><b style="background:#57534e"></b><b style="background:#e0f2fe"></b><span>Tap Before or After</span></div>', ".pane{position:absolute;left:24px;top:96px;width:312px;height:196px;border-radius:14px;border:1px dashed #334155;box-sizing:border-box;overflow:hidden}.pane b{position:absolute;top:0;bottom:0;width:50%}.pane b:first-child{left:0;opacity:.35}.pane b:nth-child(2){right:0;opacity:.18}.pane span{position:absolute;left:0;right:0;top:86px;text-align:center;font:600 13px Montserrat,Helvetica,sans-serif;color:#e2e8f0}")),
      textLayer2("ba_kicker", box(24, 20, 200, 20, 2), "KITCHEN REDO", { size: 11, color: "#38bdf8", bold: true }),
      textLayer2("ba_title", box(24, 42, 312, 40, 3), "Six weekends later", { family: "serif", size: 24, color: "#f1f5f9", bold: true }),
      panelLayer("ba_before", box(24, 96, 312, 196, 4), "#57534e", ["BEFORE", "Dark cabinets, one light, no counter space."], { size: 14, color: "#f5f5f4", bold: true, align: "center" }, { visible: false, name: "Before", cornerRadius: 14 }),
      panelLayer("ba_after", box(24, 96, 312, 196, 5), "#e0f2fe", ["AFTER", "Open shelves, warm oak, and room to cook."], { size: 14, color: "#0c4a6e", bold: true, align: "center" }, { visible: false, name: "After", cornerRadius: 14 }),
      buttonLayer("ba_b", box(24, 306, 150, 40, 6), "Before", t.ghost, { behavior: "widget.reveal", revealLayerId: "ba_before", revealMode: "tab" }),
      buttonLayer("ba_a", box(186, 306, 150, 40, 7), "After", { fill: "#38bdf8", color: "#0f172a" }, { behavior: "widget.reveal", revealLayerId: "ba_after", revealMode: "tab" })
    ]);
  }
  function seedSocialTip() {
    const t = themes.citrus;
    return curatedCardSeed([
      artLayer("td_art", artHtml("linear-gradient(160deg,#ecfccb 0%,#fef9c3 100%)", '<div class="bulb"></div>', '.bulb{position:absolute;right:40px;top:40px;width:64px;height:64px;border-radius:50%;background:#facc15;box-shadow:0 0 0 14px rgba(250,204,21,.25)}.bulb:after{content:"";position:absolute;left:20px;top:62px;width:24px;height:16px;border-radius:0 0 4px 4px;background:#57534e}')),
      textLayer2("td_kicker", box(24, 28, 200, 20, 2), "KITCHEN NOTES \xB7 NO. 18", { size: 11, color: t.accent, bold: true }),
      textLayer2("td_num", box(24, 60, 200, 66, 3), "Tip #12", { family: "serif", size: 48, color: t.ink, bold: true }),
      textLayer2("td_topic", box(24, 132, 220, 24, 4), "Writing headlines", { size: 14, color: t.muted, bold: true }),
      buttonLayer("td_show", box(24, 176, 140, 40, 5), "Show the tip", t.primary, { behavior: "widget.reveal", revealLayerId: "td_tip", revealMode: "show" }),
      panelLayer("td_tip", box(24, 232, 312, 100, 6), "#ffffff", "Write the headline last. Once the piece is done, you finally know what it is about.", { family: "serif", size: 16, color: t.ink }, { visible: false, name: "Tip" })
    ]);
  }
  function seedSocialStat() {
    const t = themes.night;
    return curatedCardSeed([
      artLayer("st_art", artHtml("#0f172a", '<svg style="position:absolute;left:0;bottom:0" width="360" height="140" viewBox="0 0 360 140"><polyline points="0,130 60,112 120,118 180,80 240,70 300,34 360,12" fill="none" stroke="#818cf8" stroke-width="4"/><polygon points="0,130 60,112 120,118 180,80 240,70 300,34 360,12 360,140 0,140" fill="rgba(129,140,248,0.18)"/></svg>')),
      textLayer2("st_kicker", box(24, 24, 260, 20, 2), "READERS THIS YEAR", { size: 11, color: t.accent, bold: true }),
      textLayer2("st_num", box(24, 62, 312, 72, 3), "3.2M", { family: "serif", size: 76, color: "#ffffff", bold: true }),
      textLayer2("st_label", box(24, 142, 260, 40, 4), "Up 41% from last year, with zero paid promotion.", { size: 14, color: t.muted }),
      buttonLayer("st_report", box(24, 198, 140, 36, 5), "See report", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/report" }, { size: 13 }),
      buttonLayer("st_how", box(176, 198, 160, 36, 6), "How we counted", t.ghost, { behavior: "widget.reveal", revealLayerId: "st_method", revealMode: "toggle" }, { size: 12 }),
      panelLayer("st_method", box(24, 248, 312, 88, 7), "#1e293b", "Unique signed-in readers who finished at least one post, Jan 1 to Dec 31. Bots and repeat visits removed.", { size: 12, color: t.ink }, { visible: false, name: "Method" })
    ]);
  }
  function seedSocialBts() {
    return curatedCardSeed([
      artLayer("bts_art", artHtml("#111111", '<div class="strip"><div class="f" style="background:linear-gradient(135deg,#78350f,#f59e0b)"></div><div class="f" style="background:linear-gradient(135deg,#1e3a8a,#60a5fa)"></div><div class="f" style="background:linear-gradient(135deg,#14532d,#4ade80)"></div></div>', ".strip{position:absolute;left:0;top:70px;width:360px;height:136px;background:#000;display:flex;gap:10px;padding:18px 14px;box-sizing:border-box;background-image:repeating-linear-gradient(90deg,#fff 0 8px,transparent 8px 20px),repeating-linear-gradient(90deg,#fff 0 8px,transparent 8px 20px);background-size:100% 6px,100% 6px;background-position:0 4px,0 126px;background-repeat:repeat-x}.f{flex:1;border-radius:4px}")),
      textLayer2("bts_kicker", box(24, 22, 200, 20, 2), "ON SET \xB7 SHORT FILM", { size: 11, color: "#f59e0b", bold: true }),
      textLayer2("bts_title", box(24, 220, 312, 36, 3), "Day three on set", { family: "serif", size: 24, color: "#ffffff", bold: true }),
      buttonLayer("bts_more", box(24, 262, 150, 36, 4), "What happened", { fill: "#f59e0b", color: "#111111" }, { behavior: "widget.reveal", revealLayerId: "bts_cap", revealMode: "toggle" }, { size: 13 }),
      textLayer2("bts_cap", box(24, 304, 312, 44, 5), "Rain wiped out the morning, so we shot the whole finale under one tarp.", { size: 12, color: "#d4d4d4" }, { visible: false })
    ]);
  }
  function seedSocialMilestone() {
    const t = themes.rose;
    const bits = [
      [40, 30, "#f43f5e", 12],
      [90, 70, "#facc15", 8],
      [300, 40, "#22c55e", 10],
      [260, 90, "#3b82f6", 8],
      [320, 120, "#f97316", 12],
      [60, 120, "#a855f7", 8],
      [200, 24, "#14b8a6", 6]
    ];
    const confetti = bits.map(([x, y, c, s], i) => `<div class="r" style="left:${x}px;top:${y}px;width:${s}px;height:${s * 2}px;background:${c};transform:rotate(${i * 37}deg);border-radius:2px"></div>`).join("");
    return curatedCardSeed([
      artLayer("mlt_art", artHtml("linear-gradient(180deg,#fff1f2 0%,#ffe4e6 100%)", confetti)),
      textLayer2("mlt_kicker", box(0, 140, 360, 20, 2), "THANK YOU", { size: 11, color: t.accent, bold: true, align: "center" }),
      textLayer2("mlt_num", box(0, 162, 360, 56, 3), "10,000 readers", { family: "serif", size: 36, color: t.ink, bold: true, align: "center" }),
      textLayer2("mlt_thanks", box(40, 218, 280, 40, 4), "Thank you for every share, reply, and late-night read.", { size: 13, color: t.muted, align: "center" }),
      buttonLayer("mlt_cheer", box(100, 282, 160, 44, 5), "Celebrate", t.primary, { behavior: "widget.stamp", label: "Celebrated" }, { size: 15 })
    ]);
  }

  // ../pen-protocol/dist/curated/creator.js
  function seedCreatorProduct() {
    const t = themes.paper;
    return curatedCardSeed([
      artLayer("pc_art", artHtml("#f6f1e7", '<div class="plinth"></div><div class="mug"><div class="glaze"></div></div><div class="handle"></div>', ".plinth{position:absolute;left:190px;top:200px;width:150px;height:20px;border-radius:50%;background:#e7dcc4}.mug{position:absolute;left:220px;top:90px;width:90px;height:118px;border-radius:8px 8px 20px 20px;background:#d97706;overflow:hidden}.glaze{position:absolute;left:0;top:0;width:100%;height:36px;background:#fef3c7;border-radius:0 0 40% 40%}.handle{position:absolute;left:302px;top:118px;width:30px;height:48px;border:10px solid #d97706;border-left:none;border-radius:0 24px 24px 0}")),
      textLayer2("pc_kicker", box(24, 28, 160, 20, 2), "HANDMADE", { size: 11, color: t.accent, bold: true }),
      textLayer2("pc_name", box(24, 52, 170, 72, 3), "Amber mug", { family: "serif", size: 24, color: t.ink, bold: true }),
      textLayer2("pc_desc", box(24, 128, 170, 60, 4), "Stoneware, 12 oz, glazed by hand. Every one is a little different.", { size: 12, color: t.muted }),
      textLayer2("pc_price", box(24, 248, 120, 40, 5), "$38", { family: "serif", size: 30, color: t.ink, bold: true }),
      buttonLayer("pc_buy", box(156, 248, 180, 44, 6), "Buy now", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/shop/amber-mug" }),
      textLayer2("pc_ship", box(24, 306, 312, 20, 7), "Ships in 3 to 5 days", { size: 11, color: t.muted })
    ]);
  }
  function seedCreatorTipjar() {
    const t = themes.forest;
    const amt = { fill: "rgba(134,239,172,0.16)", color: t.ink };
    return curatedCardSeed([
      artLayer("tj_art", artHtml("linear-gradient(170deg,#052e16 0%,#14532d 100%)", '<div class="lid"></div><div class="jar"><div class="coin" style="left:16px;bottom:10px"></div><div class="coin" style="left:40px;bottom:16px"></div><div class="coin" style="left:28px;bottom:30px"></div></div>', ".jar{position:absolute;left:246px;top:44px;width:86px;height:110px;border-radius:14px 14px 22px 22px;border:3px solid rgba(236,253,245,.7);overflow:hidden}.lid{position:absolute;left:256px;top:34px;width:72px;height:14px;border-radius:4px;background:#86efac}.coin{position:absolute;width:24px;height:24px;border-radius:50%;background:#facc15;border:2px solid #ca8a04}")),
      textLayer2("tj_kicker", box(24, 28, 200, 20, 2), "THE SLOW HOUR PODCAST", { size: 11, color: t.accent, bold: true }),
      textLayer2("tj_title", box(24, 52, 210, 72, 3), "Enjoying the show? Buy me a coffee.", { family: "serif", size: 21, color: t.ink, bold: true }),
      textLayer2("tj_sub", box(24, 132, 200, 44, 4), "Every tip goes straight to the next episode.", { size: 12, color: t.muted }),
      buttonLayer("tj_3", box(24, 210, 96, 52, 5), "$3", amt, { behavior: "cta.open", openUrl: "https://parnoir.com/tip?amount=3" }, { size: 18, radius: 14, stroke: "rgba(134,239,172,0.5)" }),
      buttonLayer("tj_5", box(132, 210, 96, 52, 6), "$5", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/tip?amount=5" }, { size: 18, radius: 14 }),
      buttonLayer("tj_10", box(240, 210, 96, 52, 7), "$10", amt, { behavior: "cta.open", openUrl: "https://parnoir.com/tip?amount=10" }, { size: 18, radius: 14, stroke: "rgba(134,239,172,0.5)" }),
      textLayer2("tj_note", box(24, 280, 312, 20, 8), "Opens a secure checkout.", { size: 11, color: t.muted })
    ]);
  }
  function seedCreatorPortfolio() {
    const t = themes.ink;
    return curatedCardSeed([
      artLayer("pf_art", artHtml("#0b0b0c", '<div class="g"><i style="background:#f97316"></i><i style="background:#f5f5f4"></i><i style="background:#facc15;grid-row:span 2"></i><i style="background:#3f3f46;grid-column:span 2"></i></div>', ".g{position:absolute;left:24px;top:24px;width:312px;height:164px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:8px}.g i{display:block;border-radius:8px}")),
      textLayer2("pf_kicker", box(24, 204, 200, 20, 2), "CASE STUDY \xB7 2026", { size: 11, color: t.accent, bold: true }),
      textLayer2("pf_title", box(24, 226, 312, 36, 3), "Rebranding Harbor Coffee", { family: "serif", size: 22, color: t.ink, bold: true }),
      textLayer2("pf_role", box(24, 262, 312, 22, 4), "Identity, packaging, and signage", { size: 12, color: t.muted }),
      buttonLayer("pf_view", box(24, 300, 180, 40, 5), "View case study", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/work/harbor" }),
      buttonLayer("pf_hire", box(216, 300, 120, 40, 6), "Hire me", t.ghost, { behavior: "widget.submit", label: "Project inquiry" })
    ]);
  }

  // ../pen-protocol/dist/curated/website.js
  function seedWebNav() {
    const link = { fill: "transparent", color: "#f5f5f4" };
    return curatedCardSeed([
      artLayer("wn_art", artHtml("#0b0b0c", '<div class="r" style="left:0;bottom:0;width:360px;height:1px;background:#27272a"></div><div class="s" style="left:20px;top:46px;width:28px;height:28px;background:#facc15"></div>'), 120),
      textLayer2("wn_brand", box(56, 44, 100, 32, 2), "Northwind", { family: "serif", size: 18, color: "#f5f5f4", bold: true }),
      buttonLayer("wn_home", box(156, 42, 60, 36, 3), "Home", link, { behavior: "page.go", goTo: "page:0" }, { size: 12 }),
      buttonLayer("wn_about", box(218, 42, 60, 36, 4), "About", link, { behavior: "page.go", goTo: "page:1" }, { size: 12 }),
      buttonLayer("wn_contact", box(280, 42, 66, 36, 5), "Contact", { fill: "#facc15", color: "#0b0b0c" }, { behavior: "page.go", goTo: "page:2" }, { size: 12 })
    ]);
  }
  function seedWebHero() {
    const t = themes.ink;
    return curatedCardSeed([
      artLayer("wh_art", artHtml("radial-gradient(circle at 80% 10%,#3f3f46 0%,#0b0b0c 60%)", '<div class="arc"></div>', ".arc{position:absolute;right:-190px;bottom:-200px;width:320px;height:320px;border-radius:50%;border:48px solid rgba(250,204,21,.18)}")),
      textLayer2("wh_kicker", box(24, 40, 260, 20, 2), "BUILT FOR SMALL TEAMS", { size: 11, color: t.accent, bold: true }),
      textLayer2("wh_title", box(24, 70, 312, 126, 3), ["Ship work", "you are proud of"], { family: "serif", size: 38, color: t.ink, bold: true }),
      textLayer2("wh_sub", box(24, 200, 290, 48, 4), "Plans, docs, and feedback in one quiet place. No dashboards to babysit.", { size: 14, color: t.muted }),
      buttonLayer("wh_cta", box(24, 272, 150, 48, 5), "Start free", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/start" }, { size: 15 }),
      buttonLayer("wh_more", box(186, 272, 130, 48, 6), "Learn more", t.ghost, { behavior: "page.go", goTo: "next" })
    ]);
  }
  function seedWebFeatures() {
    const t = themes.paper;
    const tile = (left, icon) => `<div class="tl" style="left:${left}px"><i style="background:${icon}"></i></div>`;
    return curatedCardSeed([
      artLayer("wf_art", artHtml("#f6f1e7", tile(24, "#fde68a") + tile(132, "#bfdbfe") + tile(240, "#bbf7d0"), ".tl{position:absolute;top:96px;width:96px;height:176px;border-radius:12px;background:#fff;border:1px solid #e7e0d2;box-sizing:border-box}.tl i{position:absolute;left:10px;top:12px;width:28px;height:28px;border-radius:8px}")),
      textLayer2("wf_kicker", box(24, 24, 200, 20, 2), "WHY NORTHWIND", { size: 11, color: t.accent, bold: true }),
      textLayer2("wf_title", box(24, 46, 312, 40, 2), "Everything in one place", { family: "serif", size: 24, color: t.ink, bold: true }),
      ...[
        ["Plans", "Roadmaps that update themselves."],
        ["Docs", "Write once, link everywhere."],
        ["Feedback", "Comments right where work happens."]
      ].flatMap(([title, line], i) => [
        textLayer2(`wf_t${i + 1}`, box(32 + i * 108, 146, 80, 20, 4), title, { size: 13, color: t.ink, bold: true }),
        textLayer2(`wf_t${i + 1}_line`, box(32 + i * 108, 172, 80, 92, 4), line, { size: 11, color: t.muted })
      ]),
      buttonLayer("wf_all", box(24, 292, 170, 40, 5), "See all features", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/features" }, { size: 13 })
    ]);
  }
  function seedWebTestimonial() {
    const t = themes.slate;
    return curatedCardSeed([
      artLayer("wt_art", artHtml("#ffffff", '<div class="stars"><i></i><i></i><i></i><i></i><i></i></div><div class="av"></div>', ".stars{position:absolute;left:24px;top:28px;display:flex;gap:4px}.stars i{display:block;width:16px;height:16px;background:#f59e0b;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}.av{position:absolute;left:24px;top:236px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#0369a1,#7dd3fc)}")),
      textLayer2("wt_quote", box(24, 60, 312, 160, 2), '"We cut our weekly status meeting entirely. Everyone just reads the board now."', { family: "serif", size: 21, color: t.ink, italic: true }),
      textLayer2("wt_who", box(84, 238, 252, 44, 3), ["Priya Natarajan", "Head of Ops, Fernway"], { size: 12, color: t.ink, bold: true }),
      buttonLayer("wt_story", box(24, 300, 150, 40, 4), "Read story", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/customers/fernway" }, { size: 13 })
    ]);
  }
  function seedWebPricing() {
    const t = themes.night;
    const col = (id2, x, name, price, perks) => [
      textLayer2(`${id2}_name`, box(x + 10, 96, 76, 18, 3), name, { size: 10, color: t.accent, bold: true }),
      textLayer2(`${id2}_price`, box(x + 10, 118, 76, 30, 3), price, { family: "serif", size: 19, color: "#ffffff", bold: true }),
      textLayer2(`${id2}_perks`, box(x + 10, 170, 76, 100, 3), perks, { size: 11, color: t.muted })
    ];
    const column2 = (left, hot) => `<div class="col" style="left:${left}px;background:${hot ? "#312e81" : "#1e293b"};border-color:${hot ? "#818cf8" : "#334155"}"></div>`;
    return curatedCardSeed([
      artLayer("wp_art", artHtml("#0f172a", column2(24, false) + column2(132, true) + column2(240, false) + '<div class="r" style="left:132px;top:72px;width:96px;height:12px;border-radius:6px 6px 0 0;background:#818cf8"></div><div class="r" style="left:34px;right:34px;top:158px;height:1px;background:rgba(226,232,240,.12)"></div>', ".col{position:absolute;top:84px;width:96px;height:200px;border-radius:12px;border:1px solid;box-sizing:border-box}")),
      textLayer2("wp_title", box(24, 24, 312, 40, 2), "Simple pricing", { family: "serif", size: 24, color: t.ink, bold: true }),
      ...col("wp_free", 24, "FREE", "$0", ["1 project", "Community help"]),
      ...col("wp_pro", 132, "PRO", "$12/mo", ["Unlimited projects", "Priority help"]),
      ...col("wp_team", 240, "TEAM", "$29/mo", ["Up to 20 people", "Admin tools"]),
      buttonLayer("wp_free_go", box(24, 296, 96, 36, 4), "Choose", t.ghost, { behavior: "cta.open", openUrl: "https://parnoir.com/pricing?plan=free" }, { size: 12, radius: 10 }),
      buttonLayer("wp_pro_go", box(132, 296, 96, 36, 5), "Choose", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/pricing?plan=pro" }, { size: 12, radius: 10 }),
      buttonLayer("wp_team_go", box(240, 296, 96, 36, 6), "Choose", t.ghost, { behavior: "cta.open", openUrl: "https://parnoir.com/pricing?plan=team" }, { size: 12, radius: 10 })
    ]);
  }
  function seedWebTeam() {
    const t = themes.paper;
    const person = (id2, x, name, role) => textLayer2(id2, box(x, 184, 104, 48, 3), [name, role], { size: 12, color: t.ink, bold: true, align: "center" });
    return curatedCardSeed([
      artLayer("wtm_art", artHtml("#f6f1e7", '<div class="av" style="left:44px;background:linear-gradient(135deg,#f59e0b,#b45309)"></div><div class="av" style="left:148px;background:linear-gradient(135deg,#60a5fa,#1d4ed8)"></div><div class="av" style="left:252px;background:linear-gradient(135deg,#4ade80,#15803d)"></div>', ".av{position:absolute;top:96px;width:64px;height:64px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.12)}")),
      textLayer2("wtm_kicker", box(24, 24, 200, 20, 2), "THE TEAM", { size: 11, color: t.accent, bold: true }),
      textLayer2("wtm_title", box(24, 46, 312, 40, 2), "Small team, big care", { family: "serif", size: 24, color: t.ink, bold: true }),
      person("wtm_a", 24, "Jonah Lee", "Founder"),
      person("wtm_b", 128, "Sofia Marin", "Design"),
      person("wtm_c", 232, "Kwame Asante", "Engineering"),
      buttonLayer("wtm_join", box(24, 280, 140, 44, 4), "Join us", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/careers" }),
      textLayer2("wtm_hiring", box(176, 288, 160, 28, 5), "We're hiring a writer.", { size: 12, color: t.muted })
    ]);
  }
  function seedWebGallery() {
    const t = themes.ink;
    const slide = (id2, frame, fill, caption) => panelLayer(id2, box(24, 60, 312, 210, 3), fill, caption, { size: 16, color: "#ffffff", bold: true, align: "center" }, { stepFrame: frame, name: `Slide ${frame + 1}`, cornerRadius: 14 });
    return curatedCardSeed([
      artLayer("wg_art", artHtml("#0b0b0c", '<div class="r" style="left:24px;top:60px;width:312px;height:210px;border-radius:14px;background:#18181b"></div>')),
      textLayer2("wg_kicker", box(24, 24, 260, 20, 2), "RECENT WORK", { size: 11, color: t.accent, bold: true }),
      slide("wg_s1", 0, "#c2410c", ["", "", "Harbor Coffee", "Packaging, 2026"]),
      slide("wg_s2", 1, "#1d4ed8", ["", "", "Tidewater Books", "Shop signage, 2025"]),
      slide("wg_s3", 2, "#15803d", ["", "", "Field Day Fest", "Identity, 2025"]),
      buttonLayer("wg_prev", box(24, 290, 100, 40, 4), "Prev", t.ghost, { behavior: "widget.step", stepDir: "prev" }),
      buttonLayer("wg_next", box(236, 290, 100, 40, 5), "Next", t.primary, { behavior: "widget.step", stepDir: "next" })
    ]);
  }
  function seedWebContact() {
    const t = themes.slate;
    return curatedCardSeed([
      artLayer("wc_art", artHtml("#e2e8f0", '<div class="r" style="left:0;top:0;width:360px;height:6px;background:#0369a1"></div>')),
      textLayer2("wc_title", box(24, 26, 312, 36, 2), "Let's talk", { family: "serif", size: 26, color: t.ink, bold: true }),
      textLayer2("wc_info", box(24, 66, 312, 44, 3), ["hello@northwind.studio", "14 Dock Road, Bristol"], { size: 12, color: t.muted, bold: true }),
      inputLayer("wc_name", box(24, 122, 150, 40, 4), "Name", t.field, { name: "Name" }),
      inputLayer("wc_email", box(186, 122, 150, 40, 5), "Email", t.field, { name: "Email" }),
      inputLayer("wc_msg", box(24, 172, 312, 88, 6), "Tell us about your project\u2026", t.field, { name: "Message" }),
      buttonLayer("wc_send", box(24, 276, 140, 44, 7), "Send", t.primary, { behavior: "widget.submit", label: "Website contact" }),
      buttonLayer("wc_mail", box(176, 276, 160, 44, 8), "Email us", t.ghost, { behavior: "cta.open", openUrl: "mailto:hello@northwind.studio" })
    ]);
  }
  function seedWebFooter() {
    const link = { fill: "transparent", color: "#a1a1aa" };
    return curatedCardSeed([
      artLayer("wft_art", artHtml("#18181b", '<div class="r" style="left:20px;right:20px;top:72px;height:1px;background:#3f3f46"></div>'), 120),
      buttonLayer("wft_privacy", box(12, 22, 76, 36, 2), "Privacy", link, { behavior: "cta.open", openUrl: "https://parnoir.com/privacy" }, { size: 11 }),
      buttonLayer("wft_terms", box(92, 22, 70, 36, 3), "Terms", link, { behavior: "cta.open", openUrl: "https://parnoir.com/terms" }, { size: 11 }),
      buttonLayer("wft_press", box(166, 22, 70, 36, 4), "Press", link, { behavior: "cta.open", openUrl: "https://parnoir.com/press" }, { size: 11 }),
      buttonLayer("wft_jobs", box(240, 22, 104, 36, 5), "Careers", link, { behavior: "cta.open", openUrl: "https://parnoir.com/careers" }, { size: 11 }),
      textLayer2("wft_copy", box(20, 82, 320, 24, 6), "\xA9 2026 Northwind Studio. Made with care in Bristol.", { size: 10, color: "#71717a" })
    ]);
  }
  function seedWebStats() {
    const stat = (id2, x, num, label) => [
      textLayer2(id2, box(x, 20, 104, 34, 2), num, { family: "serif", size: 26, color: "#ffffff", bold: true, align: "center" }),
      textLayer2(`${id2}_label`, box(x, 60, 104, 20, 2), label, { size: 11, color: "#e0f2fe", bold: true, align: "center" })
    ];
    return curatedCardSeed([
      artLayer("ws2_art", artHtml("linear-gradient(90deg,#0c4a6e,#0369a1)", '<div class="r" style="left:119px;top:30px;width:1px;height:60px;background:rgba(224,242,254,.3)"></div><div class="r" style="left:240px;top:30px;width:1px;height:60px;background:rgba(224,242,254,.3)"></div>'), 120),
      ...stat("wss_a", 8, "12k", "teams"),
      ...stat("wss_b", 128, "98%", "stay a year"),
      ...stat("wss_c", 248, "4.9", "average rating"),
      textLayer2("wss_source", box(16, 94, 240, 18, 2), "Source: 2026 customer survey", { size: 9, color: "rgba(224,242,254,0.7)" }),
      buttonLayer("wss_more", box(276, 92, 72, 22, 3), "Our data", { fill: "rgba(224,242,254,0.18)", color: "#e0f2fe" }, { behavior: "cta.open", openUrl: "https://parnoir.com/data" }, { size: 10 })
    ]);
  }
  function seedWebLogos() {
    const mark = (id2, x, name, family) => textLayer2(id2, box(x, 54, 64, 24, 2), name, { family, size: 12, color: "#57534e", bold: true, align: "center" });
    return curatedCardSeed([
      artLayer("wl2_art", artHtml("#fafaf9", '<div class="r" style="left:0;top:0;width:360px;height:1px;background:#e7e5e4"></div><div class="r" style="left:0;bottom:0;width:360px;height:1px;background:#e7e5e4"></div>'), 120),
      textLayer2("wlg_kicker", box(16, 18, 200, 20, 2), "TRUSTED BY", { size: 10, color: "#a8a29e", bold: true }),
      buttonLayer("wlg_more", box(266, 14, 80, 28, 3), "Partners", { fill: "#1c1917", color: "#fafaf9" }, { behavior: "cta.open", openUrl: "https://parnoir.com/partners" }, { size: 11 }),
      mark("wlg_1", 8, "Fernway", "serif"),
      mark("wlg_2", 78, "ORBIT", "sans"),
      mark("wlg_3", 148, "tidal", "mono"),
      mark("wlg_4", 218, "Harbor", "serif"),
      mark("wlg_5", 288, "KILN", "sans")
    ]);
  }
  function seedWebCta() {
    return curatedCardSeed([
      artLayer("wca_art", artHtml("linear-gradient(110deg,#facc15 0%,#f97316 100%)", '<div class="s" style="width:160px;height:160px;right:-40px;top:-60px;background:rgba(255,255,255,0.25)"></div>'), 120),
      textLayer2("wca_title", box(20, 24, 200, 72, 2), ["Ready when you are.", "Free for 30 days."], { family: "serif", size: 17, color: "#1c1917", bold: true }),
      buttonLayer("wca_go", box(228, 36, 116, 48, 3), "Get started", { fill: "#1c1917", color: "#ffffff" }, { behavior: "cta.open", openUrl: "https://parnoir.com/start" }, { size: 13 })
    ]);
  }
  function seedWebFaq() {
    const t = themes.paper;
    const q = { fill: "#ffffff", color: t.ink };
    const answer = (id2, text, open = false) => panelLayer(id2, box(24, 244, 312, 96, 10), "#1c1917", text, { size: 13, color: "#f6f1e7" }, { visible: open, name: "Answer" });
    return curatedCardSeed([
      artLayer("wfq_art", artHtml("#f6f1e7", '<div class="r" style="left:24px;top:232px;width:312px;height:1px;background:#e7e0d2"></div>')),
      textLayer2("wfq_title", box(24, 22, 312, 40, 2), "Questions, answered", { family: "serif", size: 24, color: t.ink, bold: true }),
      buttonLayer("wfq_1", box(24, 76, 312, 42, 3), "Can I cancel any time?", q, { behavior: "widget.reveal", revealLayerId: "wfq_1_a", revealMode: "tab" }, { radius: 10, stroke: "#e7e0d2" }),
      buttonLayer("wfq_2", box(24, 126, 312, 42, 4), "Who owns my data?", q, { behavior: "widget.reveal", revealLayerId: "wfq_2_a", revealMode: "tab" }, { radius: 10, stroke: "#e7e0d2" }),
      buttonLayer("wfq_3", box(24, 176, 312, 42, 5), "Do you offer discounts?", q, { behavior: "widget.reveal", revealLayerId: "wfq_3_a", revealMode: "tab" }, { radius: 10, stroke: "#e7e0d2" }),
      answer("wfq_1_a", "Yes. Cancel from settings in two taps and keep access until the end of the month.", true),
      answer("wfq_2_a", "You do. Export everything at any time, and we never sell or share it."),
      answer("wfq_3_a", "Students, nonprofits, and teams under five people get 50% off.")
    ]);
  }
  function seedWebTabs() {
    const t = themes.night;
    const panel = (id2, lines, open = false) => panelLayer(id2, box(24, 132, 312, 200, 10), "#1e293b", lines, { size: 14, color: t.ink }, { visible: open, name: "Tab panel" });
    return curatedCardSeed([
      artLayer("wtb_art", artHtml("#0f172a", '<div class="r" style="left:24px;top:124px;width:312px;height:2px;background:#334155"></div>')),
      textLayer2("wtb_title", box(24, 22, 312, 40, 2), "How it works", { family: "serif", size: 24, color: t.ink, bold: true }),
      buttonLayer("wtb_1", box(24, 76, 96, 40, 3), "Plan", t.ghost, { behavior: "widget.reveal", revealLayerId: "wtb_1_p", revealMode: "tab" }, { radius: 10 }),
      buttonLayer("wtb_2", box(132, 76, 96, 40, 4), "Write", t.ghost, { behavior: "widget.reveal", revealLayerId: "wtb_2_p", revealMode: "tab" }, { radius: 10 }),
      buttonLayer("wtb_3", box(240, 76, 96, 40, 5), "Share", t.ghost, { behavior: "widget.reveal", revealLayerId: "wtb_3_p", revealMode: "tab" }, { radius: 10 }),
      panel("wtb_1_p", ["1. Plan", "Sketch the week on one board. Drag cards between days, and everyone sees the change at once."], true),
      panel("wtb_2_p", ["2. Write", "Open any card into a doc. Headings, checklists, and embeds, without leaving the board."]),
      panel("wtb_3_p", ["3. Share", "Publish a page with one link. Readers comment inline and you reply in place."])
    ]);
  }

  // ../pen-protocol/dist/curated/education.js
  function seedEduFlashcard() {
    const t = themes.paper;
    return curatedCardSeed([
      artLayer("fc_art", artHtml("#e7e0d2", '<div class="card back"></div><div class="card"></div>', '.card{position:absolute;left:28px;top:40px;width:304px;height:216px;border-radius:16px;background:#fffdf8;box-shadow:0 8px 20px rgba(28,25,23,.12)}.card.back{transform:rotate(-4deg) translate(-6px,6px);background:#d6cbb6;box-shadow:none}.card::after{content:"";position:absolute;left:20px;right:20px;top:52px;height:1px;background:#f0b4b4}')),
      textLayer2("fc_kicker", box(48, 56, 200, 20, 2), "BIOLOGY \xB7 CARD 12", { size: 11, color: t.accent, bold: true }),
      textLayer2("fc_term", box(48, 108, 264, 100, 3), "Photosynthesis", { family: "serif", size: 30, color: t.ink, bold: true, align: "center" }),
      panelLayer("fc_def", box(28, 40, 304, 216, 6), "#1c1917", ["", "How plants turn sunlight, water, and carbon dioxide into sugar and oxygen."], { family: "serif", size: 18, color: "#f6f1e7", align: "center" }, { visible: false, name: "Definition", cornerRadius: 16 }),
      buttonLayer("fc_flip", box(110, 284, 140, 48, 7), "Flip card", t.primary, { behavior: "widget.reveal", revealLayerId: "fc_def", revealMode: "toggle" })
    ]);
  }
  function seedEduDeck() {
    const t = themes.rose;
    const cards = [
      ["\xBFD\xF3nde est\xE1 la biblioteca?", "Where is the library?"],
      ["Tengo hambre.", "I am hungry."],
      ["\xBFCu\xE1nto cuesta?", "How much does it cost?"]
    ];
    const layers = cards.flatMap(([front, back], frame) => [
      textLayer2(`dk_front_${frame}`, box(40, 96, 280, 96, 3), front, { family: "serif", size: 24, color: t.ink, bold: true, align: "center" }, { stepFrame: frame }),
      panelLayer(`dk_back_${frame}`, box(40, 196, 280, 52, 4), "#ffe4e6", back, { size: 15, color: t.muted, bold: true, align: "center" }, { stepFrame: frame, visible: false, name: "Answer" }),
      buttonLayer(`dk_show_${frame}`, box(120, 254, 120, 32, 5), "Show answer", t.ghost, { behavior: "widget.reveal", revealLayerId: `dk_back_${frame}`, revealMode: "toggle", stepFrame: frame }, { size: 12, stroke: "#fecdd3" })
    ]);
    return curatedCardSeed([
      artLayer("dk_art", artHtml("#fff1f2", '<div class="r" style="left:32px;top:30px;width:296px;height:268px;border-radius:18px;background:#ffe4e6;transform:rotate(3deg)"></div><div class="r" style="left:24px;top:24px;width:312px;height:276px;border-radius:18px;background:#ffffff;box-shadow:0 6px 18px rgba(76,5,25,.1)"></div>')),
      textLayer2("dk_kicker", box(40, 44, 260, 20, 2), "SPANISH \xB7 TRAVEL PHRASES", { size: 11, color: t.accent, bold: true }),
      ...layers,
      buttonLayer("dk_prev", box(24, 312, 100, 36, 8), "Prev", t.ghost, { behavior: "widget.step", stepDir: "prev" }, { stroke: "#fecdd3" }),
      buttonLayer("dk_next", box(236, 312, 100, 36, 9), "Next card", t.primary, { behavior: "widget.step", stepDir: "next" }, { size: 13 })
    ]);
  }
  function seedEduChecklist() {
    const t = themes.forest;
    const task = { fill: "rgba(255,255,255,0.06)", color: t.ink };
    const tasks = ["Watch the 8-minute intro", "Read chapter 3", "Try the practice set", "Post one question"];
    return curatedCardSeed([
      artLayer("lc_art", artHtml("#052e16", '<div class="r" style="left:24px;top:92px;width:4px;height:236px;border-radius:2px;background:rgba(134,239,172,.25)"></div><div class="s" style="width:200px;height:200px;right:-90px;top:-90px;background:rgba(134,239,172,.12)"></div>')),
      textLayer2("lc_kicker", box(24, 22, 240, 20, 2), "WEEK 3 \xB7 CELL BIOLOGY", { size: 11, color: t.accent, bold: true }),
      textLayer2("lc_title", box(24, 46, 312, 36, 3), "Before Friday", { family: "serif", size: 24, color: t.ink, bold: true }),
      ...tasks.map((face, i) => buttonLayer(`lc_${i + 1}`, box(40, 96 + i * 58, 296, 46, 4 + i), face, task, { behavior: "widget.toggle", bindRowId: `lc_${i + 1}` }, { size: 13, radius: 12, stroke: "rgba(134,239,172,0.35)" }))
    ]);
  }
  function seedEduCheck() {
    const t = themes.citrus;
    const answer = { fill: "#ffffff", color: t.ink };
    return curatedCardSeed([
      artLayer("kc_art", artHtml("#fef9c3", '<div class="r" style="left:0;top:0;width:360px;height:96px;background:#ecfccb"></div><div class="s" style="width:56px;height:56px;right:24px;top:20px;background:#bef264"></div>')),
      textLayer2("kc_kicker", box(24, 18, 200, 20, 2), "QUICK CHECK \xB7 CHEMISTRY", { size: 11, color: t.accent, bold: true }),
      scoreLayer("kc_score", box(280, 32, 56, 32, 3), t.ink),
      textLayer2("kc_q", box(24, 108, 312, 64, 4), "What is the chemical symbol for gold?", { family: "serif", size: 20, color: t.ink, bold: true }),
      buttonLayer("kc_a", box(24, 184, 312, 42, 5), "Ag", answer, { behavior: "quiz.answer", bindRowId: "kc_a" }, { radius: 12, stroke: "#d9f99d" }),
      buttonLayer("kc_b", box(24, 236, 312, 42, 6), "Au", answer, { behavior: "quiz.answer", bindRowId: "kc_b", correct: true }, { radius: 12, stroke: "#d9f99d" }),
      buttonLayer("kc_c", box(24, 288, 312, 42, 7), "Gd", answer, { behavior: "quiz.answer", bindRowId: "kc_c" }, { radius: 12, stroke: "#d9f99d" })
    ]);
  }
  function seedEduVocab() {
    const t = themes.night;
    return curatedCardSeed([
      artLayer("vc_art", artHtml("linear-gradient(160deg,#1e1b4b 0%,#0f172a 70%)", '<div class="q">\u201C</div><div class="hint">Guess what it means, then reveal it</div>', ".q{position:absolute;right:20px;top:-30px;font:700 200px/1 Georgia,serif;color:rgba(129,140,248,.14)}.hint{position:absolute;left:24px;top:160px;width:312px;height:112px;box-sizing:border-box;border:2px dashed rgba(129,140,248,.35);border-radius:12px;display:flex;align-items:center;justify-content:center;font:600 12px Montserrat,Helvetica,sans-serif;color:rgba(226,232,240,.6)}")),
      textLayer2("vc_kicker", box(24, 24, 200, 20, 2), "WORD OF THE DAY", { size: 11, color: t.accent, bold: true }),
      textLayer2("vc_word", box(24, 54, 312, 52, 3), "Sonder", { family: "serif", size: 40, color: t.ink, bold: true }),
      textLayer2("vc_say", box(24, 110, 312, 40, 4), ["/\u02C8s\u0252n.d\u0259r/ \xB7 noun"], { family: "mono", size: 13, color: t.muted }),
      panelLayer("vc_meaning", box(24, 160, 312, 112, 5), "#1e293b", ["The sudden sense that every passer-by lives a life as full as your own.", "", '"Stuck in traffic, she felt a wave of sonder."'], { size: 13, color: t.ink }, { visible: false, name: "Meaning" }),
      buttonLayer("vc_reveal", box(24, 292, 160, 44, 6), "Reveal meaning", t.primary, { behavior: "widget.reveal", revealLayerId: "vc_meaning", revealMode: "toggle" }, { size: 13 })
    ]);
  }

  // ../pen-protocol/dist/curated/utilities.js
  function seedUtilCountdown() {
    const t = themes.sunset;
    return curatedCardSeed([
      artLayer("cd_art", artHtml("linear-gradient(180deg,#9a3412 0%,#7c2d12 55%,#431407 100%)", '<div class="s" style="width:280px;height:280px;left:40px;top:150px;background:radial-gradient(circle,#fdba74 0%,#f97316 45%,rgba(249,115,22,0) 70%)"></div><div class="r" style="left:0;top:262px;width:360px;height:98px;background:#431407"></div>')),
      textLayer2("cd_kicker", box(24, 28, 240, 20, 2), "SUMMER SOLSTICE PARTY", { size: 11, color: t.accent, bold: true }),
      textLayer2("cd_title", box(24, 52, 312, 64, 3), ["Sunset on the roof", "starts in"], { family: "serif", size: 22, color: t.ink, bold: true }),
      countdownLayer("cd_time", box(48, 136, 264, 72, 4), t.ink, 21, "rgba(67,20,7,0.55)"),
      buttonLayer("cd_remind", box(24, 286, 180, 44, 5), "Add to calendar", t.primary, {
        behavior: "cta.calendar",
        eventTitle: "Sunset on the roof",
        eventStart: eventStartIn(21, 19),
        eventLocation: "Rooftop, 210 Marsh St",
        eventDurationMin: 180
      }, { size: 13 })
    ]);
  }
  function seedUtilClock() {
    const t = themes.slate;
    return curatedCardSeed([
      artLayer("ck_art", artHtml("#e2e8f0", '<div class="dial" style="left:24px;background:#ffffff"></div><div class="dial" style="left:192px;background:#0f172a"></div>', ".dial{position:absolute;top:96px;width:144px;height:144px;border-radius:50%;box-shadow:0 6px 16px rgba(15,23,42,.12)}")),
      textLayer2("ck_kicker", box(24, 24, 240, 20, 2), "TEAM HOURS", { size: 11, color: t.accent, bold: true }),
      textLayer2("ck_title", box(24, 46, 312, 36, 3), "When we are online", { family: "serif", size: 22, color: t.ink, bold: true }),
      clockLayer("ck_ny", box(40, 152, 112, 32, 4), t.ink, "09:00"),
      clockLayer("ck_tk", box(208, 152, 112, 32, 5), "#ffffff", "22:00"),
      textLayer2("ck_ny_label", box(24, 252, 144, 44, 6), ["New York", "Mon\u2013Fri"], { size: 13, color: t.ink, bold: true, align: "center" }),
      textLayer2("ck_tk_label", box(192, 252, 144, 44, 7), ["Tokyo", "Mon\u2013Fri"], { size: 13, color: t.ink, bold: true, align: "center" }),
      buttonLayer("ck_book", box(90, 304, 180, 40, 8), "Book a call", t.primary, { behavior: "cta.open", openUrl: "https://parnoir.com/book" }, { size: 13 })
    ]);
  }
  function seedUtilBanner() {
    return curatedCardSeed([
      artLayer("ub_art", artHtml("repeating-linear-gradient(135deg,#fde047 0 18px,#facc15 18px 36px)", '<div class="r" style="left:12px;top:12px;width:336px;height:96px;border-radius:12px;background:#1c1917"></div>'), 120),
      textLayer2("ub_msg", box(28, 28, 196, 64, 2), ["Heads up: shipping pauses", "Dec 24 \u2013 Jan 2."], { size: 13, color: "#fde047", bold: true }),
      buttonLayer("ub_more", box(232, 38, 104, 44, 3), "Learn more", { fill: "#fde047", color: "#1c1917" }, { behavior: "cta.open", openUrl: "https://parnoir.com/shipping" }, { size: 12 })
    ]);
  }
  function seedUtilChecklist() {
    const t = themes.paper;
    const item = { fill: "#ffffff", color: t.ink };
    const items = ["Passport", "Chargers", "Meds", "House keys", "Snacks"];
    return curatedCardSeed([
      artLayer("uc_art", artHtml("#f6f1e7", '<div class="tag"></div>', '.tag{position:absolute;right:24px;top:20px;width:52px;height:64px;border-radius:8px 8px 8px 8px;background:#b45309;clip-path:polygon(0 18%,50% 0,100% 18%,100% 100%,0 100%)}.tag::after{content:"";position:absolute;left:21px;top:12px;width:10px;height:10px;border-radius:50%;background:#f6f1e7}')),
      textLayer2("uc_kicker", box(24, 22, 200, 20, 2), "BEFORE YOU GO", { size: 11, color: t.accent, bold: true }),
      textLayer2("uc_title", box(24, 44, 240, 36, 3), "Packing list", { family: "serif", size: 24, color: t.ink, bold: true }),
      ...items.map((face, i) => buttonLayer(`uc_${i + 1}`, box(24, 96 + i * 50, 312, 40, 4 + i), face, item, { behavior: "widget.toggle", bindRowId: `uc_${i + 1}` }, { size: 13, radius: 10, stroke: "#e7e0d2" }))
    ]);
  }
  function seedUtilTally() {
    const t = themes.ink;
    return curatedCardSeed([
      artLayer("ut_art", artHtml("#0b0b0c", '<div class="ring"></div>', ".ring{position:absolute;left:90px;top:100px;width:180px;height:180px;border-radius:50%;border:2px dashed rgba(250,204,21,.4);box-sizing:border-box}")),
      textLayer2("ut_kicker", box(24, 24, 260, 20, 2), "GLASSES OF WATER TODAY", { size: 11, color: t.accent, bold: true }),
      textLayer2("ut_hint", box(24, 48, 312, 32, 3), "Tap to count", { family: "serif", size: 20, color: t.ink, bold: true }),
      buttonLayer("ut_plus", box(110, 120, 140, 140, 4), "+1", t.primary, { behavior: "widget.stamp", label: "Glass of water" }, { size: 44 }),
      textLayer2("ut_goal", box(24, 300, 312, 28, 5), "Goal: 8 by bedtime", { size: 13, color: t.muted, align: "center" })
    ]);
  }

  // ../pen-protocol/dist/curated/index.js
  var ASPECT = {
    square: "1/1",
    story: "9/16",
    banner: "16/9"
  };
  function w(id2, category, title, description, focus, seed, size = "square") {
    return { id: `widget.${id2}.v1`, category, size, title, description, focus, seed };
  }
  var CURATED_WIDGET_ENTRIES = [
    w("poll_quick", "polls", "Quick poll", "One question, three tap-to-vote answers.", "Edit the question and the three vote buttons.", seedPollQuick),
    w("poll_writein", "polls", "Poll with write-in", "Three options, an Other field, and a closing countdown.", "Keep the vote buttons and the write-in.", seedPollWriteInWidget),
    w("poll_thisorthat", "polls", "This or that", "Two bold halves; tap the one you pick.", "Edit the two choices.", seedPollThisorthat),
    w("poll_rating", "polls", "Rating scale", "Rate from 1 to 5 with labelled ends.", "Edit the prompt and scale labels.", seedPollRating),
    w("poll_hottake", "polls", "Hot take meter", "A spicy prompt with Agree and Disagree.", "Edit the take.", seedPollHottake),
    w("poll_hidden", "polls", "Hidden result poll", "Vote first, then reveal how others voted.", "Update the reveal text with results.", seedPollHidden),
    w("poll_rank", "polls", "Rank favorites", "Tap items in order to rank them.", "Edit the items to rank.", seedPollRank),
    w("poll_budget", "polls", "Budget split", "Spread a fixed budget across buckets.", "Edit the buckets and total.", seedPollBudget),
    w("quiz", "quizzes", "Trivia quiz", "Three answers, one correct, with an explanation.", "Mark the correct answer.", seedQuizWidget),
    w("quiz_truefalse", "quizzes", "True or false", "A single statement to judge.", "Edit the statement and correct side.", seedQuizTruefalse),
    w("quiz_image", "quizzes", "Guess the image", "Name the landmark from the art.", "Edit the art and answers.", seedQuizImage),
    w("quiz_riddle", "quizzes", "Riddle of the day", "A riddle with a hidden answer.", "Edit the riddle and answer.", seedQuizRiddle),
    w("quiz_personality", "quizzes", "Personality pick", "Choose the vibe that fits you.", "Edit the three vibes.", seedQuizPersonality),
    w("quiz_multi", "quizzes", "Multi-question quiz", "Three questions with a running score, then send it.", "Edit each question frame.", seedQuizMulti),
    w("quiz_uncover", "quizzes", "Tap to uncover", "Tap to uncover a hidden code.", "Edit the hidden message.", seedQuizUncover),
    w("rsvp", "events", "RSVP", "Going, Maybe, Can't go with a countdown.", "Edit event copy and countdown.", seedRsvpWidget),
    w("event_launch", "events", "Launch countdown", "Countdown to launch with a calendar reminder.", "Edit the launch date.", seedEventLaunch),
    w("event_live", "events", "Live now banner", "Wide banner pointing to a live stream.", "Set the stream link.", seedEventLive, "banner"),
    w("event_checkin", "events", "Event check-in", "Stamp when you arrive.", "Edit the event name.", seedEventCheckin),
    w("event_savedate", "events", "Save the date", "Date, place, and Add to calendar.", "Set the event start.", seedEventSavedate),
    w("event_agenda", "events", "Agenda card", "Three sessions; tap one to see details.", "Edit the sessions.", seedEventAgenda),
    w("link_card", "links", "Link card", "Headline and an open button.", "Set the open URL.", seedLinkCardWidget),
    w("link_bio", "links", "Link in bio", "Avatar, a short bio, and four stacked links.", "Set the link URLs.", seedLinkBio),
    w("link_teaser", "links", "Read more teaser", "A teaser that expands, then links out.", "Edit the teaser and link.", seedLinkTeaser),
    w("link_appbadge", "links", "App badge", "App icon with store badges.", "Set the store links.", seedLinkAppbadge),
    w("link_swipeup", "links", "Story swipe-up", "Tall story card with a swipe-up link.", "Set the link.", seedLinkSwipeup, "story"),
    w("link_message", "links", "Message me", "Start a direct conversation.", "Edit the invite copy.", seedLinkMessage),
    w("form_newsletter", "forms", "Newsletter", "Email field and Subscribe.", "Edit the pitch.", seedFormNewsletter),
    w("form_contact", "forms", "Contact", "Name, email, and message.", "Edit the fields.", seedFormContact),
    w("form_feedback", "forms", "Feedback box", "An open question and a feedback field.", "Edit the prompt.", seedFormFeedback),
    w("form_waitlist", "forms", "Waitlist", "Join the waitlist by email.", "Edit the product copy.", seedFormWaitlist),
    w("form_quote", "forms", "Request a quote", "Project details and budget.", "Edit the fields.", seedFormQuote),
    w("form_multistep", "forms", "Multi-step form", "Three short steps, then submit.", "Edit each step.", seedFormMultistep),
    w("community_features", "community", "Feature board", "Rank the ideas you want most.", "Edit the ideas.", seedCommunityFeatures),
    w("community_guestbook", "community", "Guestbook", "Leave a note in the guestbook.", "Edit the welcome copy.", seedCommunityGuestbook),
    w("community_challenge", "community", "Challenge tracker", "Tick off each day of the week.", "Edit the challenge.", seedCommunityChallenge),
    w("community_reactions", "community", "Reaction bar", "Pick a reaction.", "Edit the prompt.", seedCommunityReactions),
    w("community_ama", "community", "AMA box", "Ask a question for the next AMA.", "Edit the host and date.", seedCommunityAma),
    w("social_quote", "social", "Quote card", "Pull quote with attribution.", "Edit the quote and source link.", seedSocialQuote),
    w("social_announce", "social", "Announcement", "Bold news, what changes, and a details link.", "Edit the news.", seedSocialAnnounce),
    w("social_beforeafter", "social", "Before / after", "Tab between two states.", "Edit both panels.", seedSocialBeforeafter),
    w("social_tip", "social", "Tip of the day", "Tap to reveal the tip.", "Edit the tip.", seedSocialTip),
    w("social_stat", "social", "Stat highlight", "One big number with context.", "Edit the number and source.", seedSocialStat),
    w("social_bts", "social", "Behind the scenes", "A scene with a caption reveal.", "Edit the caption.", seedSocialBts),
    w("social_milestone", "social", "Milestone", "Celebrate a milestone with a stamp.", "Edit the milestone.", seedSocialMilestone),
    w("creator_product", "creator", "Product card", "Product, price, and Buy.", "Edit the product and shop link.", seedCreatorProduct),
    w("creator_tipjar", "creator", "Tip jar", "Three tip amounts.", "Set the tip links.", seedCreatorTipjar),
    w("creator_portfolio", "creator", "Portfolio piece", "A project, your role, and the case study.", "Edit the project.", seedCreatorPortfolio),
    w("web_nav", "website", "Nav bar", "Wordmark with Home, About, and Contact.", "Keep the page links.", seedWebNav, "banner"),
    w("web_hero", "website", "Hero", "Headline, subhead, and two CTAs.", "Edit the headline and CTA link.", seedWebHero),
    w("web_features", "website", "Feature grid", "Three feature tiles.", "Edit each tile.", seedWebFeatures),
    w("web_testimonial", "website", "Testimonial", "A customer quote with stars.", "Edit the quote and person.", seedWebTestimonial),
    w("web_pricing", "website", "Pricing tiers", "Free, Pro, and Team plans.", "Edit prices and checkout links.", seedWebPricing),
    w("web_team", "website", "Team", "Three people and Join us.", "Edit names and roles.", seedWebTeam),
    w("web_gallery", "website", "Gallery carousel", "Step through three slides.", "Edit each slide.", seedWebGallery),
    w("web_contact", "website", "Contact section", "Contact details and a short form.", "Edit the details.", seedWebContact),
    w("web_footer", "website", "Footer", "Links and copyright.", "Set the links.", seedWebFooter, "banner"),
    w("web_stats", "website", "Stats strip", "Three numbers across a banner.", "Edit the numbers.", seedWebStats, "banner"),
    w("web_logos", "website", "Logo wall", "Partner wordmarks in a row.", "Edit the partner names.", seedWebLogos, "banner"),
    w("web_cta", "website", "CTA band", "Full-width call to action.", "Edit the headline and link.", seedWebCta, "banner"),
    w("web_faq", "website", "FAQ accordion", "Three questions; tap to open an answer.", "Edit questions and answers.", seedWebFaq),
    w("web_tabs", "website", "Tabs section", "Three tabs, each with its own panel.", "Edit each tab.", seedWebTabs),
    w("edu_flashcard", "education", "Flashcard", "A term; flip for the definition.", "Edit the term and definition.", seedEduFlashcard),
    w("edu_deck", "education", "Flashcard deck", "Three cards with answers and Prev/Next.", "Edit each card.", seedEduDeck),
    w("edu_checklist", "education", "Lesson checklist", "Four lesson tasks to tick off.", "Edit the tasks.", seedEduChecklist),
    w("edu_check", "education", "Knowledge check", "One question, three answers, and a score.", "Mark the correct answer.", seedEduCheck),
    w("edu_vocab", "education", "Vocabulary card", "A word with its meaning and an example.", "Edit the word.", seedEduVocab),
    w("util_countdown", "utilities", "Countdown", "A large countdown to your event.", "Set the end time.", seedUtilCountdown),
    w("util_clock", "utilities", "Clock", "Two cities side by side.", "Set the cities and times.", seedUtilClock),
    w("util_banner", "utilities", "Announcement banner", "A one-line notice with Learn more.", "Edit the notice and link.", seedUtilBanner, "banner"),
    w("util_checklist", "utilities", "Checklist", "Five items to tick off.", "Edit the items.", seedUtilChecklist),
    w("util_tally", "utilities", "Tally counter", "Tap +1 to count.", "Edit what you count.", seedUtilTally)
  ];
  var CURATED_WIDGET_IDS = CURATED_WIDGET_ENTRIES.map((e) => e.id);
  function curatedWidgetTemplates() {
    return CURATED_WIDGET_ENTRIES.map((entry) => withSeedBundle({
      id: entry.id,
      classId: "widgets.widget",
      docType: "widget",
      version: "1",
      title: entry.title,
      description: entry.description,
      widgetCategory: entry.category,
      sections: [{ slug: "card", title: "Card", required: true }],
      seedGalleryAspect: ASPECT[entry.size],
      agentStarter: proseStarter({ title: entry.title, focus: entry.focus })
    }, entry.seed()));
  }

  // ../pen-protocol/dist/curated/websiteDoc.js
  function seedWebsiteDoc() {
    const base = curatedCardSeed([]);
    const presentation = socialPresentation({
      backgroundColor: "#0b0b0c",
      textAlign: "left",
      fontSize: 28,
      textColor: "#f5f5f4",
      padding: 0,
      dropShadowBlur: 0
    });
    return {
      seedPageLayout: base.seedPageLayout,
      seedPagePresentation: presentation,
      seedSections: [
        { slug: "home", doc: plainDoc(""), layers: stackSections("home", [seedWebNav, seedWebHero, seedWebFeatures, seedWebFaq]) },
        { slug: "about", doc: plainDoc(""), layers: stackSections("about", [seedWebNav, seedWebTeam]) },
        { slug: "contact", doc: plainDoc(""), layers: stackSections("contact", [seedWebNav, seedWebContact]) }
      ]
    };
  }

  // ../pen-protocol/dist/templates/shared.js
  var GALLERY = {
    portrait: "9/16",
    landscape: "16/9",
    square: "1/1"
  };
  var DOC_TYPE = {
    "social.note": "note",
    "social.post": "post",
    "social.collection": "collection",
    "social.profile": "profile",
    "social.comparison": "comparison"
  };
  function postTemplate(input) {
    var _a;
    const collection = input.classId === "social.collection";
    return withSeedBundle(__spreadProps(__spreadValues(__spreadValues({
      id: input.id,
      classId: input.classId,
      docType: DOC_TYPE[input.classId],
      version: "1",
      title: input.title,
      description: input.description,
      sections: (_a = input.sections) != null ? _a : [{ slug: "body", title: "Body", required: true }],
      publishContentClass: collection ? "collection" : "note"
    }, input.featured ? { browseFeatured: true } : {}), collection ? { seedPageSwipeAxis: "x" } : {}), {
      seedGalleryAspect: GALLERY[input.aspect],
      feedCaption: input.feedCaption,
      agentStarter: proseStarter({ title: input.title, focus: input.focus })
    }), input.seed);
  }
  function scrimLayer(id2, b, gradient) {
    return {
      id: id2,
      kind: "text",
      widgetElement: "html",
      name: "Scrim",
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      zIndex: b.z,
      positionLocked: true,
      htmlSource: `<style>html,body{margin:0;height:100%}body{background:${gradient}}</style>`
    };
  }
  var CHIP_MIN_H = 36;
  function chipLayer(id2, b, text, fill, color, extra = {}) {
    const h = Math.max(b.h, CHIP_MIN_H);
    const y = Math.max(0, b.y - Math.round((h - b.h) / 2));
    return panelLayer(id2, __spreadProps(__spreadValues({}, b), { y, h }), fill, text, { size: 11, color, bold: true, align: "center" }, __spreadValues({ name: "Chip", cornerRadius: Math.round(h / 2) }, extra));
  }

  // ../pen-protocol/dist/templates/collections.js
  var f = FRAMES.portrait;
  function pagesOf(pages) {
    return pages.map(([slug, title]) => ({ slug, title, required: slug === "cover" }));
  }
  function nextButton(id2, look, face = "Next") {
    return buttonLayer(id2, box(216, 476, 104, 40, 20), face, look, { behavior: "page.go", goTo: "next" });
  }
  function howTo() {
    const ink = "#f0fdf4";
    const muted = "rgba(240,253,244,0.72)";
    const go = { fill: "#fb923c", color: "#14532d" };
    const toggle = { fill: "rgba(240,253,244,0.1)", color: ink };
    const step = (n, slug, title, body, tip, accent) => ({
      slug,
      layers: [
        pageArt(`ht${n}_art`, artHtml("#14532d", `<div class="n">${n}</div><div class="s" style="left:-60px;bottom:-60px;width:200px;height:200px;background:${accent};opacity:.22"></div>`, ".n{position:absolute;right:10px;top:-30px;font:700 260px/1 Georgia,serif;color:rgba(240,253,244,.08)}"), f),
        chipLayer(`ht${n}_kicker`, box(24, 56, 80, 26, 2), `STEP ${n}`, accent, "#14532d"),
        motion(textLayer2(`ht${n}_title`, box(24, 100, 312, 80, 3), title, { family: "serif", size: 30, color: ink, bold: true }), { in: "rise" }),
        textLayer2(`ht${n}_body`, box(24, 196, 312, 120, 4), body, { size: 15, color: muted }),
        panelLayer(`ht${n}_tip`, box(24, 336, 296, 84, 5), "rgba(240,253,244,0.08)", tip, { size: 13, color: ink }, { name: "Tip", strokeColor: "rgba(240,253,244,0.2)", strokeWidth: 1 }),
        nextButton(`ht${n}_next`, go)
      ]
    });
    return postTemplate({
      id: "collection.how_to.v1",
      classId: "social.collection",
      title: "How-to steps",
      description: "A cover, three illustrated steps, and a checklist recap readers can tick off.",
      aspect: "portrait",
      featured: true,
      focus: "Write a cover promise with the time it takes, then three steps with a short imperative title, two sentences of how and why, and one tip each. End with three checklist items that match the steps.",
      feedCaption: { title: "Repot without the panic", body: "@greenroom.ana \xB7 three steps, ten minutes" },
      sections: pagesOf([
        ["cover", "Cover"],
        ["step-1", "Step 1"],
        ["step-2", "Step 2"],
        ["step-3", "Step 3"],
        ["recap", "Recap"]
      ]),
      seed: pageSeed(f, [
        {
          slug: "cover",
          layers: [
            pageArt("htc_art", artHtml("linear-gradient(170deg,#14532d 0%,#166534 60%,#052e16 100%)", '<div class="r pot"></div><div class="r rim"></div><div class="leaf" style="left:150px;top:280px;transform:rotate(-30deg)"></div><div class="leaf" style="left:190px;top:270px;transform:rotate(25deg)"></div><div class="leaf" style="left:170px;top:250px"></div>', ".pot{left:120px;top:360px;width:120px;height:110px;border-radius:0 0 26px 26px;background:#ea580c}.rim{left:110px;top:346px;width:140px;height:22px;border-radius:6px;background:#fb923c}.leaf{position:absolute;width:34px;height:90px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#4ade80;transform-origin:bottom center}"), f),
            chipLayer("htc_kicker", box(24, 56, 148, 26, 2), "HOW TO \xB7 3 STEPS", "#fb923c", "#14532d"),
            motion(textLayer2("htc_title", box(24, 100, 312, 120, 3), "Repot a houseplant without killing it", { family: "serif", size: 34, color: ink, bold: true }), { in: "drop" }),
            textLayer2("htc_sub", box(24, 232, 312, 44, 4), "Ten minutes, one bigger pot, and a little nerve.", { size: 15, color: muted }),
            buttonLayer("htc_start", box(24, 476, 160, 40, 5), "Start", go, { behavior: "page.go", goTo: "next" })
          ]
        },
        step(1, "step-1", "Water the day before", "Moist roots hold together and slide out in one piece. Dry soil crumbles and tears the fine roots.", "Pick a pot only 2 to 5 cm wider than the old one.", "#fb923c"),
        {
          slug: "step-2",
          layers: [
            pageArt("ht2_art", artHtml("#052e16", '<div class="r" style="left:0;right:0;top:330px;height:2px;background:#4ade80"></div>'), f),
            slotLayer("ht2_photo", box(0, 0, 360, 330, 2), "Photo", artHtml("linear-gradient(180deg,#fef3c7 0%,#fde68a 100%)", '<div class="r ball"></div><div class="s" style="left:70px;top:150px;width:70px;height:70px;background:#fcd9b6"></div><div class="s" style="left:220px;top:150px;width:70px;height:70px;background:#fcd9b6"></div><div class="leaf" style="left:160px;top:60px"></div><div class="leaf" style="left:190px;top:70px;transform:rotate(30deg)"></div>', ".ball{left:120px;top:160px;width:120px;height:130px;border-radius:40% 40% 46% 46%;background:repeating-linear-gradient(120deg,#78350f 0 6px,#a16207 6px 9px)}.leaf{position:absolute;width:30px;height:90px;border-radius:50%;background:#16a34a;transform-origin:bottom center}")),
            chipLayer("ht2_kicker", box(24, 349, 80, 26, 3), "STEP 2", "#4ade80", "#052e16"),
            motion(textLayer2("ht2_title", box(24, 384, 296, 34, 4), "Tip it out, loosen the roots", { family: "serif", size: 24, color: ink, bold: true }), { in: "rise" }),
            textLayer2("ht2_body", box(24, 422, 296, 44, 5), "Turn the pot on its side and squeeze. Tease circling roots outward with your fingers.", { size: 14, color: muted }),
            nextButton("ht2_next", go)
          ]
        },
        step(3, "step-3", "Set it at the same depth", "Add fresh mix under the root ball so the old soil line sits 2 cm below the rim. Fill the sides and press gently.", "Water until it drains, then leave it out of direct sun for a week.", "#4ade80"),
        {
          slug: "recap",
          layers: [
            pageArt("htr_art", artHtml("linear-gradient(180deg,#052e16 0%,#14532d 100%)", '<div class="s" style="right:-50px;top:-50px;width:180px;height:180px;background:rgba(251,146,60,.25)"></div>'), f),
            chipLayer("htr_kicker", box(24, 56, 100, 26, 2), "CHECKLIST", "#fb923c", "#14532d"),
            motion(textLayer2("htr_title", box(24, 100, 312, 80, 3), "Before you put the pot down", { family: "serif", size: 30, color: ink, bold: true }), { in: "rise" }),
            buttonLayer("htr_t1", box(24, 204, 296, 50, 4), "Watered the day before", toggle, { behavior: "widget.toggle", bindRowId: "htr_t1" }, { radius: 12, stroke: "rgba(240,253,244,0.3)" }),
            buttonLayer("htr_t2", box(24, 264, 296, 50, 5), "New pot 2 to 5 cm wider", toggle, { behavior: "widget.toggle", bindRowId: "htr_t2" }, { radius: 12, stroke: "rgba(240,253,244,0.3)" }),
            buttonLayer("htr_t3", box(24, 324, 296, 50, 6), "Soil line at the same depth", toggle, { behavior: "widget.toggle", bindRowId: "htr_t3" }, { radius: 12, stroke: "rgba(240,253,244,0.3)" }),
            buttonLayer("htr_done", box(24, 410, 296, 48, 7), "I repotted one", go, { behavior: "widget.stamp", label: "Repotted" }),
            buttonLayer("htr_first", box(24, 476, 160, 40, 8), "Back to start", { fill: "rgba(240,253,244,0.1)", color: ink }, { behavior: "page.go", goTo: "first" })
          ]
        }
      ], { backgroundColor: "#14532d" })
    });
  }
  function topFive() {
    const ink = "#1c1917";
    const muted = "#57534e";
    const books = [
      { rank: 5, title: "Shape Up", author: "Ryan Singer", why: "Six-week cycles made our roadmap honest.", cover: "#0ea5e9" },
      { rank: 4, title: "The Mom Test", author: "Rob Fitzpatrick", why: "Stopped me asking customers to tell me what I wanted to hear.", cover: "#f43f5e" },
      { rank: 3, title: "Working in Public", author: "Nadia Eghbal", why: "How open source really gets maintained, and by whom.", cover: "#a3e635" },
      { rank: 2, title: "Deep Work", author: "Cal Newport", why: "Mornings are for the hard thing now. Email waits.", cover: "#1e293b" },
      { rank: 1, title: "The Design of Everyday Things", author: "Don Norman", why: "Every badly labelled door I meet is this book talking.", cover: "#f59e0b" }
    ];
    const rankPage = (b) => ({
      slug: `rank-${b.rank}`,
      layers: [
        pageArt(`tf${b.rank}_art`, artHtml("#f5f0e6", `<div class="n">${b.rank}</div>`, `.n{position:absolute;left:-10px;bottom:-60px;font:700 300px/1 Georgia,serif;color:${b.cover};opacity:.14}`), f),
        chipLayer(`tf${b.rank}_rank`, box(24, 48, 64, 26, 2), `#${b.rank}`, ink, "#f5f0e6"),
        motion(slotLayer(`tf${b.rank}_photo`, box(100, 88, 160, 222, 3), "Photo", artHtml(b.cover, `<div class="r" style="left:0;top:0;bottom:0;width:14px;background:rgba(0,0,0,.2)"></div><div class="t">${b.title}</div><div class="a">${b.author}</div>`, ".t{position:absolute;left:26px;right:14px;top:30px;font:700 19px/1.15 Georgia,serif;color:#fff}.a{position:absolute;left:26px;bottom:20px;font:600 10px Montserrat,Helvetica,sans-serif;color:rgba(255,255,255,.85);letter-spacing:.08em;text-transform:uppercase}")), { in: "zoom" }),
        textLayer2(`tf${b.rank}_title`, box(24, 324, 296, 60, 4), b.title, { family: "serif", size: 24, color: ink, bold: true }, { name: "Book" }),
        textLayer2(`tf${b.rank}_author`, box(24, 388, 296, 20, 5), b.author, { size: 13, color: muted }),
        textLayer2(`tf${b.rank}_why`, box(24, 414, 296, 54, 6), b.why, { size: 14, color: ink, italic: true }),
        nextButton(`tf${b.rank}_next`, { fill: ink, color: "#f5f0e6" })
      ]
    });
    return postTemplate({
      id: "collection.top_five.v1",
      classId: "social.collection",
      title: "Top five countdown",
      description: "A ranked countdown from five to one, ending with a reader pick.",
      aspect: "portrait",
      featured: true,
      focus: "Write a cover headline for the ranking, then five entries from #5 to #1 with the name, the creator, and one sentence on why it earned the spot. Close by asking readers for theirs.",
      feedCaption: { title: "Five books, ranked", body: "Swipe from #5 to the one that changed how I work." },
      sections: pagesOf([
        ["cover", "Cover"],
        ...books.map((b) => [`rank-${b.rank}`, `#${b.rank}`]),
        ["your-pick", "Your pick"]
      ]),
      seed: pageSeed(f, [
        {
          slug: "cover",
          layers: [
            pageArt("tfc_art", artHtml("#f5f0e6", books.map((b, i) => `<div class="r" style="left:${40 + i * 58}px;top:${300 - i * 12}px;width:46px;height:${160 + i * 12}px;border-radius:3px;background:${b.cover}"></div>`).join("") + '<div class="r" style="left:24px;right:24px;top:460px;height:10px;background:#a8a29e"></div>'), f),
            chipLayer("tfc_kicker", box(24, 48, 140, 26, 2), "MY TOP FIVE", ink, "#f5f0e6"),
            motion(textLayer2("tfc_title", box(24, 92, 312, 120, 3), "Five books that changed how I work", { family: "serif", size: 34, color: ink, bold: true }), { in: "rise" }),
            textLayer2("tfc_sub", box(24, 216, 312, 40, 4), "Counting down from five. Number one surprised me too.", { size: 14, color: muted }),
            nextButton("tfc_next", { fill: ink, color: "#f5f0e6" }, "See #5")
          ]
        },
        ...books.map(rankPage),
        {
          slug: "your-pick",
          layers: [
            pageArt("tfp_art", artHtml(ink, '<div class="s" style="left:220px;top:-40px;width:200px;height:200px;background:rgba(245,158,11,.25)"></div>'), f),
            chipLayer("tfp_kicker", box(24, 56, 100, 26, 2), "YOUR TURN", "#f59e0b", ink),
            motion(textLayer2("tfp_title", box(24, 100, 312, 120, 3), "Which book changed how you work?", { family: "serif", size: 32, color: "#f5f0e6", bold: true }), { in: "rise" }),
            textLayer2("tfp_sub", box(24, 228, 312, 44, 4), "I read every reply and the best ones make next month\u2019s list.", { size: 14, color: "rgba(245,240,230,0.72)" }),
            inputLayer("tfp_field", box(24, 296, 296, 48, 5), "Title and author\u2026", { fill: "#f5f0e6", color: ink }, { name: "Book" }),
            buttonLayer("tfp_send", box(24, 356, 296, 48, 6), "Send my pick", { fill: "#f59e0b", color: ink }, { behavior: "widget.submit", label: "Reader pick" })
          ]
        }
      ], { backgroundColor: "#f5f0e6", textColor: ink })
    });
  }
  function tripRecap() {
    const ink = "#fff7ed";
    const muted = "rgba(255,247,237,0.72)";
    const days = [
      { n: 1, place: "Fushimi Inari at 6am", note: "Beat the crowds by two hours. The upper gates were empty and the light was gold.", spent: "Spent \xA51,800", sky: "#fb7185", ground: "#dc2626" },
      { n: 2, place: "Arashiyama by bike", note: "Bamboo grove first, then the river path to Okochi Sanso for matcha.", spent: "Spent \xA54,200", sky: "#86efac", ground: "#15803d" },
      { n: 3, place: "Nishiki Market lunch crawl", note: "Tamagoyaki, soy milk donuts, and pickles I still think about.", spent: "Spent \xA53,600", sky: "#fde68a", ground: "#b45309" }
    ];
    const dayPage = (d) => ({
      slug: `day-${d.n}`,
      layers: [
        pageArt(`tr${d.n}_art`, artHtml("#1c1917", `<div class="r" style="left:0;top:320px;width:${d.n * 120}px;height:4px;background:${d.sky}"></div>`), f),
        slotLayer(`tr${d.n}_photo`, box(0, 0, 360, 320, 2), "Photo", artHtml(`linear-gradient(180deg,${d.sky} 0%,#fff7ed 100%)`, `<div class="s" style="left:240px;top:60px;width:60px;height:60px;background:#fff7ed"></div><div class="r" style="left:0;right:0;top:260px;height:120px;background:${d.ground}"></div><div class="r" style="left:${60 + d.n * 30}px;top:150px;width:16px;height:120px;background:${d.ground}"></div><div class="r" style="left:${130 + d.n * 30}px;top:150px;width:16px;height:120px;background:${d.ground}"></div><div class="r" style="left:${44 + d.n * 30}px;top:140px;width:118px;height:16px;background:${d.ground}"></div>`)),
        motion(chipLayer(`tr${d.n}_day`, box(24, 341, 70, 26, 3), `DAY ${d.n}`, d.sky, "#1c1917"), { in: "pop" }),
        textLayer2(`tr${d.n}_place`, box(24, 376, 296, 32, 4), d.place, { family: "serif", size: 22, color: ink, bold: true }),
        textLayer2(`tr${d.n}_note`, box(24, 412, 296, 54, 5), d.note, { size: 13, color: muted }),
        textLayer2(`tr${d.n}_spent`, box(24, 486, 180, 20, 6), d.spent, { size: 12, color: d.sky, bold: true }),
        nextButton(`tr${d.n}_next`, { fill: ink, color: "#1c1917" })
      ]
    });
    return postTemplate({
      id: "collection.trip_recap.v1",
      classId: "social.collection",
      title: "Trip recap",
      description: "A route-map cover, one photo page per day, and a highlights page.",
      aspect: "portrait",
      featured: true,
      focus: "Write the trip as a cover headline with the number of days, then one page per day with the main place, two sentences of what made it good, and what you spent. Finish with best food, best stay, and one tip.",
      feedCaption: { title: "Kyoto in three days", body: "Routes, spends, and the snacks worth queuing for." },
      sections: pagesOf([["cover", "Cover"], ...days.map((d) => [`day-${d.n}`, `Day ${d.n}`]), ["highlights", "Highlights"]]),
      seed: pageSeed(f, [
        {
          slug: "cover",
          layers: [
            pageArt("trc_art", artHtml("#fef3c7", '<svg width="360" height="640" style="position:absolute;inset:0"><path d="M48 252 C 110 210, 30 150, 130 130 S 260 170, 250 100 S 270 40, 312 52" fill="none" stroke="#dc2626" stroke-width="4" stroke-dasharray="10 8"/><circle cx="48" cy="252" r="10" fill="#dc2626"/><circle cx="130" cy="130" r="10" fill="#15803d"/><circle cx="312" cy="52" r="10" fill="#b45309"/></svg><div class="r" style="left:0;right:0;top:0;bottom:0;background:repeating-linear-gradient(0deg,transparent 0 47px,rgba(180,83,9,.12) 47px 48px),repeating-linear-gradient(90deg,transparent 0 47px,rgba(180,83,9,.12) 47px 48px)"></div>'), f),
            chipLayer("trc_kicker", box(24, 280, 150, 26, 2), "JAPAN \xB7 OCTOBER", "#1c1917", "#fef3c7"),
            motion(textLayer2("trc_title", box(24, 316, 220, 96, 3), "Three days in Kyoto", { family: "serif", size: 36, color: "#1c1917", bold: true }), { in: "rise" }),
            textLayer2("trc_sub", box(24, 418, 220, 46, 4), "Early starts, one rented bike, too many snacks.", { size: 14, color: "#78350f" }),
            nextButton("trc_next", { fill: "#1c1917", color: "#fef3c7" }, "Day 1")
          ]
        },
        ...days.map(dayPage),
        {
          slug: "highlights",
          layers: [
            pageArt("trh_art", artHtml("linear-gradient(180deg,#1c1917 0%,#431407 100%)", '<div class="s" style="left:-80px;top:420px;width:240px;height:240px;background:rgba(251,113,133,.2)"></div>'), f),
            chipLayer("trh_kicker", box(24, 48, 110, 26, 2), "HIGHLIGHTS", "#fb7185", "#1c1917"),
            motion(textLayer2("trh_title", box(24, 88, 312, 44, 3), "If you only do three things", { family: "serif", size: 26, color: ink, bold: true }), { in: "rise" }),
            panelLayer("trh_food", box(24, 146, 296, 76, 4), "rgba(255,247,237,0.08)", ["BEST FOOD", "Soy milk donuts at Nishiki, still warm."], { size: 14, color: ink }, { name: "Best food" }),
            panelLayer("trh_stay", box(24, 230, 296, 76, 5), "rgba(255,247,237,0.08)", ["BEST STAY", "A six-room machiya near Gion. Book early."], { size: 14, color: ink }, { name: "Best stay" }),
            panelLayer("trh_tip", box(24, 314, 296, 76, 6), "rgba(255,247,237,0.08)", ["TIP", "Buy an ICOCA card at the airport. Buses take it."], { size: 14, color: ink }, { name: "Tip" }),
            buttonLayer("trh_map", box(24, 404, 296, 44, 7), "Open my Kyoto map", { fill: "#fb7185", color: "#1c1917" }, { behavior: "cta.open", openUrl: "https://maps.google.com/?q=Kyoto" }),
            buttonLayer("trh_want", box(24, 458, 296, 44, 8), "I want to go", { fill: "rgba(255,247,237,0.12)", color: ink }, { behavior: "widget.stamp", label: "Wants to go" })
          ]
        }
      ], { backgroundColor: "#1c1917" })
    });
  }
  function caseStudy() {
    const ink = "#0f172a";
    const muted = "#475569";
    const accent = "#0369a1";
    const kicker = (id2, text) => chipLayer(id2, box(24, 48, 130, 26, 2), text, accent, "#ffffff");
    return postTemplate({
      id: "collection.case_study.v1",
      classId: "social.collection",
      title: "Case study",
      description: "Problem, solution, and results across four pages, with a link to the write-up.",
      aspect: "portrait",
      focus: "Write the headline result with a real number, your role and team, the problem in three short facts, the solution in one or two sentences, and two result metrics with a client quote.",
      feedCaption: { title: "Checkout drop-off, down 38%", body: "A six-week redesign for Fernway, page by page." },
      sections: pagesOf([
        ["cover", "Cover"],
        ["problem", "Problem"],
        ["solution", "Solution"],
        ["results", "Results"]
      ]),
      seed: pageSeed(f, [
        {
          slug: "cover",
          layers: [
            pageArt("cs_art", artHtml("#f8fafc", '<div class="r" style="left:24px;top:310px;width:292px;height:150px;background:linear-gradient(180deg,rgba(3,105,161,.12),transparent)"></div><svg width="360" height="640" style="position:absolute;inset:0"><polyline points="24,330 82,350 140,378 198,408 256,436 316,458" fill="none" stroke="#0369a1" stroke-width="4"/><circle cx="316" cy="458" r="7" fill="#0369a1"/></svg>'), f),
            kicker("cs_kicker", "CLIENT WORK"),
            motion(textLayer2("cs_title", box(24, 92, 312, 150, 3), "How Fernway cut checkout drop-off by 38%", { family: "serif", size: 32, color: ink, bold: true }), { in: "rise" }),
            textLayer2("cs_sub", box(24, 252, 312, 44, 4), "A six-week redesign of a four-step checkout.", { size: 14, color: muted }),
            panelLayer("cs_role", box(24, 476, 180, 40, 5), "#e2e8f0", "Lead designer \xB7 team of 4", { size: 12, color: ink, align: "center" }, { name: "Role" }),
            nextButton("cs_next", { fill: ink, color: "#ffffff" })
          ]
        },
        {
          slug: "problem",
          layers: [
            pageArt("csp_art", artHtml("#fff7ed", '<div class="r" style="left:0;top:0;width:8px;bottom:0;background:#ea580c"></div>'), f),
            chipLayer("csp_kicker", box(24, 48, 130, 26, 2), "01 \xB7 PROBLEM", "#ea580c", "#ffffff"),
            motion(textLayer2("csp_title", box(24, 92, 312, 80, 3), "Four steps, three surprises", { family: "serif", size: 30, color: ink, bold: true }), { in: "rise" }),
            textLayer2("csp_body", box(24, 186, 296, 150, 4), ["Shipping costs only appeared on step three.", "Account creation was forced before payment.", "Half of mobile shoppers left before paying."], { size: 15, color: muted }),
            panelLayer("csp_metric", box(24, 352, 296, 112, 5), "#ffedd5", ["52%", "of mobile shoppers left before the payment step"], { family: "serif", size: 20, color: "#9a3412", bold: true }, { name: "Metric" }),
            nextButton("csp_next", { fill: ink, color: "#ffffff" })
          ]
        },
        {
          slug: "solution",
          layers: [
            pageArt("css_art", artHtml("linear-gradient(180deg,#e0f2fe 0%,#f8fafc 100%)", ""), f),
            slotLayer("css_photo", box(80, 44, 200, 296, 2), "Photo", artHtml("#0f172a", '<div class="r scr"></div><div class="r" style="left:28px;top:44px;width:110px;height:12px;border-radius:6px;background:#cbd5e1"></div><div class="r" style="left:28px;top:76px;width:144px;height:38px;border-radius:8px;background:#e2e8f0"></div><div class="r" style="left:28px;top:122px;width:144px;height:38px;border-radius:8px;background:#e2e8f0"></div><div class="r" style="left:28px;top:186px;width:144px;height:40px;border-radius:10px;background:#0f172a"></div><div class="r" style="left:28px;top:236px;width:144px;height:40px;border-radius:10px;background:#0369a1"></div>', ".scr{left:10px;top:10px;right:10px;bottom:10px;border-radius:24px;background:#f8fafc}"), { cornerRadius: 30 }),
            chipLayer("css_kicker", box(24, 357, 130, 26, 3), "02 \xB7 SOLUTION", accent, "#ffffff"),
            motion(textLayer2("css_title", box(24, 392, 296, 32, 4), "One page, prices up front", { family: "serif", size: 22, color: ink, bold: true }), { in: "rise" }),
            textLayer2("css_body", box(24, 428, 296, 40, 5), "Guest checkout by default, shipping estimated from the postcode, Apple Pay above the fold.", { size: 13, color: muted }),
            nextButton("css_next", { fill: ink, color: "#ffffff" })
          ]
        },
        {
          slug: "results",
          layers: [
            pageArt("csr_art", artHtml("#0f172a", '<div class="s" style="right:-70px;top:-70px;width:220px;height:220px;background:rgba(56,189,248,.18)"></div>'), f),
            chipLayer("csr_kicker", box(24, 48, 130, 26, 2), "03 \xB7 RESULTS", "#38bdf8", ink),
            motion(panelLayer("csr_m1", box(24, 96, 150, 130, 3), "rgba(56,189,248,0.14)", ["\u221238%", "checkout drop-off"], { family: "serif", size: 22, color: "#e0f2fe", bold: true }, { name: "Metric" }), { in: "rise" }),
            motion(panelLayer("csr_m2", box(186, 96, 150, 130, 4), "rgba(56,189,248,0.14)", ["+21%", "mobile revenue"], { family: "serif", size: 22, color: "#e0f2fe", bold: true }, { name: "Metric" }), { in: "rise", durationSec: 0.7 }),
            panelLayer("csr_quote", box(24, 244, 296, 140, 5), "#f8fafc", ["\u201CSupport tickets about surprise fees went to almost zero.\u201D", "Ana Ruiz, head of operations"], { family: "serif", size: 17, color: ink, italic: true }, { name: "Quote" }),
            buttonLayer("csr_read", box(24, 400, 296, 44, 6), "Read the full case study", { fill: "#38bdf8", color: ink }, { behavior: "cta.open", openUrl: "https://parnoir.com/work/fernway-checkout" })
          ]
        }
      ], { backgroundColor: "#f8fafc", textColor: ink })
    });
  }
  function recipeCards() {
    const ink = "#292524";
    const muted = "#78716c";
    const paper = "#fffbeb";
    const go = { fill: "#b45309", color: paper };
    const tick = { fill: "#ffffff", color: ink };
    const ingredients = ["500 g bread flour", "400 g warm water", "10 g salt", "4 g instant yeast", "60 ml olive oil", "Flaky salt and rosemary"];
    const method = [
      "Stir everything but the oil into a shaggy dough. Cover and chill overnight.",
      "Oil a tin, tip the dough in, and let it rise for 2 hours.",
      "Dimple hard with oily fingers. Top with salt and rosemary.",
      "Bake at 230\xB0C for 22 to 25 minutes, until deep gold."
    ];
    const focaccia = (crumb) => artHtml(crumb ? "linear-gradient(180deg,#78350f 0%,#451a03 100%)" : "linear-gradient(160deg,#fef3c7 0%,#fde68a 100%)", crumb ? '<div class="r slab"></div><div class="r crust"></div>' : '<div class="r tray"></div><div class="r bread"></div>' + [60, 120, 180, 240].map((x) => `<div class="leaf" style="left:${x + 20}px;top:${120 + x % 120}px"></div>`).join(""), crumb ? ".slab{left:30px;top:120px;width:300px;height:180px;border-radius:14px;background:radial-gradient(circle,#78350f22 0 6px,transparent 7px) 0 0/28px 24px,radial-gradient(circle,#78350f33 0 4px,transparent 5px) 14px 12px/28px 24px,#fde68a}.crust{left:30px;top:110px;width:300px;height:22px;border-radius:14px 14px 4px 4px;background:#b45309}" : ".tray{left:20px;top:56px;width:320px;height:250px;border-radius:12px;background:#44403c}.bread{left:34px;top:70px;width:292px;height:222px;border-radius:10px;background:radial-gradient(circle,#b45309 0 5px,transparent 6px) 0 0/36px 32px,#f59e0b}.leaf{position:absolute;width:8px;height:30px;border-radius:50%;background:#166534;transform:rotate(35deg)}");
    return postTemplate({
      id: "collection.recipe_cards.v1",
      classId: "social.collection",
      title: "Recipe cards",
      description: "A cover photo, an ingredient checklist, the method, and the finished bake.",
      aspect: "portrait",
      focus: "Write the dish name, the total time and servings, up to six ingredients with amounts, four method steps of one sentence each, and a one-line description of the finished result.",
      feedCaption: { title: "Sunday focaccia, no kneading", body: "Ingredients, method, and the finished bake, one card each." },
      sections: pagesOf([
        ["cover", "Cover"],
        ["ingredients", "Ingredients"],
        ["method", "Method"],
        ["finished", "Finished"]
      ]),
      seed: pageSeed(f, [
        {
          slug: "cover",
          layers: [
            pageArt("rc_art", artHtml(paper, '<div class="r" style="left:0;right:0;top:320px;height:6px;background:repeating-linear-gradient(90deg,#b45309 0 12px,transparent 12px 20px)"></div>'), f),
            slotLayer("rc_photo", box(0, 0, 360, 320, 2), "Photo", focaccia(false)),
            chipLayer("rc_kicker", box(24, 345, 130, 26, 3), "WEEKEND BAKE", ink, paper),
            motion(textLayer2("rc_title", box(24, 380, 296, 40, 4), "Sunday focaccia", { family: "serif", size: 30, color: ink, bold: true }), { in: "rise" }),
            textLayer2("rc_sub", box(24, 424, 296, 40, 5), "Mix Saturday night, bake Sunday morning. No kneading.", { size: 13, color: muted }),
            chipLayer("rc_time", box(24, 481, 80, 26, 6), "18 HR", "#fde68a", ink),
            chipLayer("rc_serves", box(112, 481, 96, 26, 7), "SERVES 8", "#fde68a", ink),
            nextButton("rc_next", go)
          ]
        },
        {
          slug: "ingredients",
          layers: [
            pageArt("rci_art", artHtml(paper, '<div class="r" style="left:0;right:0;top:0;height:16px;background:repeating-linear-gradient(90deg,#b45309 0 20px,#fde68a 20px 40px)"></div>'), f),
            motion(textLayer2("rci_title", box(24, 48, 312, 44, 2), "Ingredients", { family: "serif", size: 30, color: ink, bold: true }), { in: "rise" }),
            textLayer2("rci_sub", box(24, 94, 312, 20, 3), "Tap each one as it goes in the bowl.", { size: 13, color: muted }),
            ...ingredients.map((item, i) => buttonLayer(`rci_${i + 1}`, box(24, 128 + i * 56, 296, 46, 4 + i), item, tick, { behavior: "widget.toggle", bindRowId: `rci_${i + 1}` }, { radius: 12, stroke: "#e7e5e4" })),
            nextButton("rci_next", go)
          ]
        },
        {
          slug: "method",
          layers: [
            pageArt("rcm_art", artHtml("#fef3c7", '<div class="s" style="right:-60px;bottom:-60px;width:220px;height:220px;background:rgba(180,83,9,.12)"></div>'), f),
            motion(textLayer2("rcm_title", box(24, 48, 312, 44, 2), "Method", { family: "serif", size: 30, color: ink, bold: true }), { in: "rise" }),
            ...method.flatMap((stepText, i) => [
              textLayer2(`rcm_n${i + 1}`, box(24, 108 + i * 90, 32, 32, 3 + i * 2), String(i + 1), { family: "serif", size: 24, color: "#b45309", bold: true }),
              textLayer2(`rcm_s${i + 1}`, box(64, 108 + i * 90, 256, 76, 4 + i * 2), stepText, { size: 14, color: ink })
            ]),
            nextButton("rcm_next", go)
          ]
        },
        {
          slug: "finished",
          layers: [
            pageArt("rcf_art", artHtml(ink, ""), f),
            slotLayer("rcf_photo", box(0, 0, 360, 330, 2), "Photo", focaccia(true)),
            motion(textLayer2("rcf_title", box(24, 346, 296, 34, 3), "Crisp base, open crumb", { family: "serif", size: 24, color: paper, bold: true }), { in: "rise" }),
            textLayer2("rcf_sub", box(24, 384, 296, 40, 4), "Best within six hours. Reheat slices in a dry pan.", { size: 13, color: "rgba(255,251,235,0.72)" }),
            buttonLayer("rcf_made", box(24, 440, 142, 42, 5), "I made it", { fill: "#f59e0b", color: ink }, { behavior: "widget.stamp", label: "Made it" }),
            buttonLayer("rcf_print", box(178, 440, 142, 42, 6), "Print the card", { fill: "rgba(255,251,235,0.12)", color: paper }, { behavior: "cta.open", openUrl: "https://parnoir.com/recipes/sunday-focaccia" })
          ]
        }
      ], { backgroundColor: paper, textColor: ink })
    });
  }
  function promoHub() {
    const cream = "#fdf6ec";
    const ink = "#2b1a12";
    const muted = "rgba(253,246,236,0.74)";
    const shop = { fill: "#f59e0b", color: ink };
    const back = { fill: "rgba(253,246,236,0.12)", color: cream };
    const roasts = [
      { slug: "roast-ember", name: "Ember", notes: "Dark chocolate, toasted pecan, a long smoky finish.", origin: "Huila, Colombia", price: "\xA311 \xB7 250 g", bean: "#7c2d12", glow: "#f97316" },
      { slug: "roast-orchard", name: "Orchard", notes: "Baked apple, honey, and a soft black tea body.", origin: "Sidamo, Ethiopia", price: "\xA312 \xB7 250 g", bean: "#9a3412", glow: "#facc15" },
      { slug: "roast-midnight", name: "Midnight", notes: "Molasses, cherry, and enough body for milk.", origin: "Cerrado, Brazil", price: "\xA310 \xB7 250 g", bean: "#1c1917", glow: "#a855f7" }
    ];
    const roastPage = (r, i) => ({
      slug: r.slug,
      layers: [
        pageArt(`ph${i}_art`, artHtml(ink, `<div class="r" style="left:0;right:0;top:300px;height:3px;background:${r.glow}"></div>`), f),
        slotLayer(`ph${i}_photo`, box(0, 0, 360, 300, 2), "Photo", artHtml(`radial-gradient(circle at 50% 60%,${r.glow} 0%,${r.bean} 70%)`, `<div class="r bag"></div><div class="r label"></div><div class="s" style="left:${60 + i * 70}px;top:230px;width:26px;height:18px;background:${r.bean}"></div><div class="s" style="left:${110 + i * 50}px;top:250px;width:26px;height:18px;background:${r.bean}"></div>`, `.bag{left:120px;top:60px;width:120px;height:170px;border-radius:10px 10px 4px 4px;background:${cream}}.label{left:138px;top:110px;width:84px;height:60px;border-radius:6px;background:${r.bean}}`)),
        motion(chipLayer(`ph${i}_name`, box(24, 322, 180, 26, 3), `${r.name.toUpperCase()} \xB7 ${r.price}`, r.glow, ink), { in: "pop" }),
        textLayer2(`ph${i}_origin`, box(24, 356, 296, 30, 4), r.origin, { family: "serif", size: 20, color: cream, bold: true }),
        textLayer2(`ph${i}_notes`, box(24, 388, 296, 40, 5), r.notes, { size: 13, color: muted }),
        buttonLayer(`ph${i}_shop`, box(24, 440, 140, 44, 6), `Shop ${r.name}`, shop, { behavior: "cta.open", openUrl: `https://parnoir.com/shop/${r.slug}` }),
        buttonLayer(`ph${i}_back`, box(176, 440, 144, 44, 7), "Back to menu", back, { behavior: "page.go", goTo: "slug:menu" })
      ]
    });
    return postTemplate({
      id: "collection.promo_hub.v1",
      classId: "social.collection",
      title: "Promo hub",
      description: "A launch cover, a menu that jumps to each product, product pages with a shop link, and an offer page.",
      aspect: "portrait",
      focus: "Write a launch cover with the offer in one line, a menu page that names each product, one page per product with its origin or key fact, one sentence of what makes it good, and the price, then an offer page with the code and when it ends. Every product page links to its shop page and back to the menu.",
      feedCaption: { title: "Three autumn roasts, 20% off", body: "@northbeanroasters \xB7 tap a roast to jump straight to it" },
      sections: pagesOf([
        ["cover", "Cover"],
        ["menu", "Menu"],
        ...roasts.map((r) => [r.slug, r.name]),
        ["offer", "Offer"]
      ]),
      seed: pageSeed(f, [
        {
          slug: "cover",
          layers: [
            pageArt("phc_art", artHtml(`linear-gradient(165deg,#451a03 0%,${ink} 70%)`, roasts.map((r, i) => `<div class="s" style="left:${40 + i * 100}px;top:${330 - i * 30}px;width:90px;height:60px;background:${r.glow};opacity:.5"></div>`).join(""), ".s{filter:blur(2px)}"), f),
            chipLayer("phc_kicker", box(24, 56, 170, 26, 2), "AUTUMN DROP \xB7 3 ROASTS", "#f59e0b", ink),
            motion(textLayer2("phc_title", box(24, 100, 312, 130, 3), "Three new roasts, one week at 20% off", { family: "serif", size: 34, color: cream, bold: true }), { in: "rise" }),
            textLayer2("phc_sub", box(24, 240, 312, 44, 4), "Small batches from three farms we visit every year.", { size: 14, color: muted }),
            buttonLayer("phc_go", box(24, 476, 180, 40, 5), "See the roasts", shop, { behavior: "page.go", goTo: "slug:menu" })
          ]
        },
        {
          slug: "menu",
          layers: [
            pageArt("phm_art", artHtml(cream, '<div class="r" style="left:0;top:0;bottom:0;width:10px;background:#f59e0b"></div>'), f),
            motion(textLayer2("phm_title", box(24, 56, 312, 44, 2), "Pick a roast", { family: "serif", size: 30, color: ink, bold: true }), { in: "rise" }),
            textLayer2("phm_sub", box(24, 100, 312, 30, 3), "Each one opens its own page.", { size: 13, color: "#78350f" }),
            ...roasts.map((r, i) => buttonLayer(`phm_${r.slug}`, box(24, 146 + i * 96, 296, 80, 4 + i), `${r.name} \u2014 ${r.origin}`, { fill: r.bean, color: cream }, { behavior: "page.go", goTo: `slug:${r.slug}` }, { radius: 14, size: 16 })),
            buttonLayer("phm_offer", box(24, 476, 180, 40, 8), "Skip to the offer", { fill: ink, color: cream }, { behavior: "page.go", goTo: "slug:offer" })
          ]
        },
        ...roasts.map(roastPage),
        {
          slug: "offer",
          layers: [
            pageArt("pho_art", artHtml("linear-gradient(180deg,#f59e0b 0%,#b45309 100%)", '<div class="s" style="right:-60px;top:-60px;width:220px;height:220px;background:rgba(253,246,236,.25)"></div>'), f),
            chipLayer("pho_kicker", box(24, 56, 130, 26, 2), "THIS WEEK ONLY", ink, cream),
            motion(textLayer2("pho_title", box(24, 100, 312, 120, 3), "20% off every bag until Sunday", { family: "serif", size: 34, color: ink, bold: true }), { in: "drop" }),
            panelLayer("pho_code", box(24, 236, 296, 100, 4), cream, ["CODE", "AUTUMN20"], { family: "mono", size: 22, color: ink, bold: true, align: "center" }, { name: "Code" }),
            buttonLayer("pho_shop", box(24, 400, 296, 48, 5), "Shop the autumn drop", { fill: ink, color: cream }, { behavior: "cta.open", openUrl: "https://parnoir.com/shop/autumn-drop" }),
            buttonLayer("pho_menu", box(24, 462, 180, 40, 6), "Back to menu", { fill: "rgba(43,26,18,0.15)", color: ink }, { behavior: "page.go", goTo: "slug:menu" })
          ]
        }
      ], { backgroundColor: ink })
    });
  }
  function pickPath() {
    const night = "#0f172a";
    const chalk = "#f8fafc";
    const muted = "rgba(248,250,252,0.72)";
    const lime = { fill: "#a3e635", color: night };
    const ghost = { fill: "rgba(248,250,252,0.1)", color: chalk };
    const paths = [
      { slug: "path-new", label: "I am just starting", kicker: "NEW RUNNER", title: "Start with walk-run", body: "Run one minute, walk two, eight times. Three days a week. Your lungs catch up before your legs do.", week: "Week 1 \xB7 3 \xD7 24 minutes", accent: "#a3e635", photo: true },
      { slug: "path-back", label: "I am coming back", kicker: "RETURNING", title: "Rebuild before you push", body: "Half your old weekly distance, all of it easy. Add ten percent a week and skip the speed work for a month.", week: "Week 1 \xB7 4 easy runs", accent: "#38bdf8", photo: false },
      { slug: "path-race", label: "I have a race booked", kicker: "RACE BLOCK", title: "Train backwards from race day", body: "One long run, one session of intervals, everything else easy. Taper the last ten days.", week: "Week 1 \xB7 long run 8 km", accent: "#f472b6", photo: true }
    ];
    const pathPage = (p, i) => ({
      slug: p.slug,
      layers: [
        pageArt(`pp${i}_art`, artHtml(night, `<div class="s" style="left:${-40 + i * 120}px;top:${p.photo ? 300 : -60}px;width:180px;height:180px;background:${p.accent};opacity:.18"></div>`), f),
        ...p.photo ? [
          slotLayer(`pp${i}_photo`, box(0, 0, 360, 280, 2), "Photo", artHtml(`linear-gradient(180deg,${p.accent} 0%,${night} 100%)`, `<div class="r" style="left:0;right:0;top:210px;height:70px;background:rgba(15,23,42,.6)"></div><div class="s" style="left:${150 + i * 10}px;top:70px;width:40px;height:40px;background:${chalk}"></div><div class="r" style="left:${162 + i * 10}px;top:112px;width:16px;height:70px;border-radius:8px;background:${chalk}"></div>`))
        ] : [],
        motion(chipLayer(`pp${i}_kicker`, box(24, p.photo ? 300 : 56, 120, 26, 3), p.kicker, p.accent, night), { in: "pop" }),
        textLayer2(`pp${i}_title`, box(24, p.photo ? 334 : 96, 296, 40, 4), p.title, { family: "serif", size: 24, color: chalk, bold: true }),
        textLayer2(`pp${i}_body`, box(24, p.photo ? 374 : 144, 296, p.photo ? 50 : 90, 5), p.body, { size: 13, color: muted }),
        ...p.photo ? [] : [panelLayer(`pp${i}_week`, box(24, 252, 296, 64, 6), "rgba(248,250,252,0.08)", p.week, { size: 15, color: chalk, bold: true }, { name: "Week one", strokeColor: "rgba(248,250,252,0.2)", strokeWidth: 1 })],
        buttonLayer(`pp${i}_plan`, box(24, 440, 140, 44, 7), "Get my plan", lime, { behavior: "page.go", goTo: "slug:plan" }),
        buttonLayer(`pp${i}_again`, box(176, 440, 144, 44, 8), "Pick again", ghost, { behavior: "page.go", goTo: "slug:choose" })
      ]
    });
    return postTemplate({
      id: "collection.pick_path.v1",
      classId: "social.collection",
      title: "Pick your path",
      description: "A question page that sends each reader to their own page, then one shared call to action.",
      aspect: "portrait",
      focus: "Write a cover question, then a page with two or three honest answers. Give each answer its own page with a short title, two sentences of advice for that reader, and what their first week looks like. End on one shared page with the call to action.",
      feedCaption: { title: "Which runner are you?", body: "Coach Imani \xB7 tap your answer for a plan that fits" },
      sections: pagesOf([
        ["cover", "Cover"],
        ["choose", "Choose"],
        ...paths.map((p) => [p.slug, p.kicker.charAt(0) + p.kicker.slice(1).toLowerCase()]),
        ["plan", "Your plan"]
      ]),
      seed: pageSeed(f, [
        {
          slug: "cover",
          layers: [
            pageArt("ppc_art", artHtml(`linear-gradient(200deg,#1e293b 0%,${night} 80%)`, '<svg width="360" height="640" style="position:absolute;inset:0"><path d="M30 520 C 120 420, 60 330, 180 300 S 300 200, 330 120" fill="none" stroke="#a3e635" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 14"/><circle cx="330" cy="120" r="12" fill="#a3e635"/></svg>'), f),
            chipLayer("ppc_kicker", box(24, 56, 140, 26, 2), "FIND YOUR PLAN", "#a3e635", night),
            motion(textLayer2("ppc_title", box(24, 100, 300, 130, 3), "Which kind of runner are you right now?", { family: "serif", size: 32, color: chalk, bold: true }), { in: "rise" }),
            textLayer2("ppc_sub", box(24, 240, 280, 44, 4), "Answer one question. Get the plan that fits.", { size: 14, color: muted }),
            buttonLayer("ppc_start", box(24, 476, 160, 40, 5), "Answer it", lime, { behavior: "page.go", goTo: "slug:choose" })
          ]
        },
        {
          slug: "choose",
          layers: [
            pageArt("ppq_art", artHtml(chalk, '<div class="r" style="left:24px;right:24px;top:132px;height:2px;background:#cbd5e1"></div>'), f),
            motion(textLayer2("ppq_title", box(24, 56, 312, 72, 2), "Be honest. Where are you starting from?", { family: "serif", size: 26, color: night, bold: true }), { in: "rise" }),
            ...paths.map((p, i) => buttonLayer(`ppq_${p.slug}`, box(24, 156 + i * 88, 296, 72, 3 + i), p.label, { fill: night, color: chalk }, { behavior: "page.go", goTo: `slug:${p.slug}` }, { radius: 14, size: 16, stroke: p.accent })),
            textLayer2("ppq_note", box(24, 432, 296, 40, 6), "You can come back and choose again.", { size: 13, color: "#475569" })
          ]
        },
        ...paths.map(pathPage),
        {
          slug: "plan",
          layers: [
            pageArt("ppp_art", artHtml("linear-gradient(180deg,#a3e635 0%,#65a30d 100%)", '<div class="s" style="left:-70px;bottom:-70px;width:240px;height:240px;background:rgba(15,23,42,.15)"></div>'), f),
            chipLayer("ppp_kicker", box(24, 56, 110, 26, 2), "FREE \xB7 8 WEEKS", night, "#a3e635"),
            motion(textLayer2("ppp_title", box(24, 100, 312, 90, 3), "Your plan, one run at a time", { family: "serif", size: 32, color: night, bold: true }), { in: "drop" }),
            textLayer2("ppp_body", box(24, 200, 296, 70, 4), "Every session written out, a check-in each Sunday, and a coach who answers questions.", { size: 14, color: "#1a2e05" }),
            buttonLayer("ppp_get", box(24, 300, 296, 48, 5), "Get the free plan", { fill: night, color: chalk }, { behavior: "cta.open", openUrl: "https://parnoir.com/coach/eight-week-plan" }),
            buttonLayer("ppp_in", box(24, 360, 296, 44, 6), "Count me in", { fill: "rgba(15,23,42,0.12)", color: night }, { behavior: "widget.stamp", label: "Joined" }),
            buttonLayer("ppp_restart", box(24, 476, 160, 40, 7), "Start over", { fill: "rgba(15,23,42,0.12)", color: night }, { behavior: "page.go", goTo: "first" })
          ]
        }
      ], { backgroundColor: night })
    });
  }
  function collectionTemplates() {
    return [howTo(), topFive(), tripRecap(), caseStudy(), recipeCards(), promoHub(), pickPath()];
  }

  // ../pen-protocol/dist/templates/comparisons.js
  function column(id2, b, fill, lines, font, extra = {}) {
    return panelLayer(id2, b, fill, lines, font, __spreadValues({ name: "Column" }, extra));
  }
  function pricing() {
    const f2 = FRAMES.portrait;
    const ink = "#0f172a";
    const plans = [
      { id: "starter", lines: ["STARTER", "$0", "per month", "", "Up to 50 orders", "Card payments", "Email support"], fill: "#ffffff", color: ink },
      { id: "shop", lines: ["SHOP", "$29", "per month", "", "Unlimited orders", "Discount codes", "Cart reminder emails"], fill: "#0f172a", color: "#f8fafc" },
      { id: "studio", lines: ["STUDIO", "$79", "per month", "", "Everything in Shop", "5 staff seats", "Priority support"], fill: "#ffffff", color: ink }
    ];
    return postTemplate({
      id: "comparison.pricing.v1",
      classId: "social.comparison",
      title: "Pricing plans",
      description: "Three plans side by side with Choose buttons and a full feature comparison.",
      aspect: "portrait",
      featured: true,
      focus: "Write a headline about choosing a plan, then three plans with a name, monthly price, and three features each. Highlight the middle plan. Put the full feature table in the Compare all panel.",
      feedCaption: { title: "Fernway pricing, simplified", body: "Prices in USD. Switch or cancel any time." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("pr_art", artHtml("linear-gradient(180deg,#e0f2fe 0%,#f8fafc 40%)", '<div class="r" style="left:119px;top:144px;width:104px;height:6px;border-radius:3px;background:#0ea5e9"></div>'), f2),
            chipLayer("pr_kicker", box(16, 48, 120, 26, 2), "FERNWAY PLANS", ink, "#f8fafc"),
            motion(textLayer2("pr_title", box(16, 84, 310, 56, 3), "Pick the plan that fits your shop", { family: "serif", size: 24, color: ink, bold: true }), { in: "rise" }),
            ...plans.map((p, i) => motion(column(`pr_${p.id}`, box(16 + i * 106, 154, 98, 264, 4 + i), p.fill, p.lines, { size: 12, color: p.color, bold: i === 1 }, { strokeColor: "#cbd5e1", strokeWidth: 1 }), { in: "rise", durationSec: 0.4 + i * 0.15 })),
            panelLayer("pr_all", box(16, 154, 310, 264, 8), "#f8fafc", ["COMPARE ALL", "Orders: 50 \xB7 unlimited \xB7 unlimited", "Staff seats: 1 \xB7 2 \xB7 5", "Discount codes: no \xB7 yes \xB7 yes", "Cart reminders: no \xB7 yes \xB7 yes", "Support: email \xB7 email \xB7 priority", "Fees per sale: 2% \xB7 1% \xB7 0.5%"], { size: 12, color: ink }, { name: "Compare all", visible: false, strokeColor: "#cbd5e1", strokeWidth: 1 }),
            ...plans.map((p, i) => buttonLayer(`pr_choose_${p.id}`, box(16 + i * 106, 428, 98, 36, 9 + i), "Choose", i === 1 ? { fill: "#0ea5e9", color: "#ffffff" } : { fill: ink, color: "#f8fafc" }, { behavior: "cta.open", openUrl: `https://fernway.com/signup?plan=${p.id}` })),
            buttonLayer("pr_compare", box(16, 474, 310, 40, 12), "Compare all features", { fill: "#ffffff", color: ink }, { behavior: "widget.reveal", revealLayerId: "pr_all", revealMode: "toggle" }, { stroke: "#cbd5e1" })
          ]
        }
      ], { backgroundColor: "#f8fafc", textColor: ink })
    });
  }
  function thisOrThat() {
    const f2 = FRAMES.square;
    return postTemplate({
      id: "comparison.this_or_that.v1",
      classId: "social.comparison",
      title: "This or that",
      description: "Two options head to head, a vote on each side, and a closing countdown.",
      aspect: "square",
      featured: true,
      focus: "Write the question as a short either-or, then one bold label and one sentence of the best case for each side. Vote buttons should name the team, not just repeat the option.",
      feedCaption: { title: "Settle it: morning or evening?", body: "Pick a team. Results show after you vote." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("tt_art", artHtml("#0f172a", '<div class="r" style="left:0;top:0;width:171px;bottom:0;background:linear-gradient(180deg,#fdba74 0%,#f97316 100%)"></div><div class="r" style="left:171px;top:0;right:0;bottom:0;background:linear-gradient(180deg,#312e81 0%,#0f172a 100%)"></div><div class="s" style="left:132px;top:106px;width:28px;height:28px;background:#fef3c7"></div><div class="s" style="left:310px;top:106px;width:24px;height:24px;background:#e0e7ff;box-shadow:-7px 4px 0 0 #312e81 inset"></div>'), f2),
            chipLayer("tt_kicker", box(16, 16, 110, 24, 2), "SETTLE THIS", "#0f172a", "#fef3c7"),
            ...groupLayers("tt_poll", "Poll", [
              textLayer2("tt_question", box(16, 48, 328, 36, 3), "Morning or evening workout?", { family: "serif", size: 22, color: "#ffffff", bold: true, align: "center" }, { name: "Question" }),
              motion(column("tt_morning", box(16, 96, 150, 150, 4), "rgba(255,255,255,0.22)", ["MORNING", "Done before the day can cancel it. Empty gym at 6am."], { size: 13, color: "#431407", bold: true }), { in: "slideRight" }),
              motion(column("tt_evening", box(176, 96, 150, 150, 5), "rgba(255,255,255,0.1)", ["EVENING", "Stronger lifts, no alarm, and a better playlist."], { size: 13, color: "#e0e7ff", bold: true }), { in: "slideLeft" }),
              buttonLayer("tt_vote_morning", box(16, 258, 150, 44, 6), "Team morning", { fill: "#431407", color: "#fed7aa" }, { behavior: "poll.vote", bindRowId: "tt_vote_morning" }),
              buttonLayer("tt_vote_evening", box(176, 258, 150, 44, 7), "Team evening", { fill: "#e0e7ff", color: "#1e1b4b" }, { behavior: "poll.vote", bindRowId: "tt_vote_evening" }),
              countdownLayer("tt_time", box(16, 316, 90, 26, 8), "#fef3c7", 2, "rgba(15,23,42,0.6)"),
              textLayer2("tt_results", box(118, 318, 208, 22, 9), "Results show after you vote", { size: 11, color: "rgba(255,255,255,0.8)" })
            ]),
            chipLayer("tt_vs", box(151, 200, 40, 40, 20), "VS", "#fef3c7", "#0f172a")
          ]
        }
      ])
    });
  }
  function specs() {
    const f2 = FRAMES.portrait;
    const ink = "#18181b";
    const muted = "#52525b";
    const font = { size: 13, color: ink };
    return postTemplate({
      id: "comparison.specs.v1",
      classId: "social.comparison",
      title: "Spec sheet",
      description: "Two products with matching spec rows, a verdict, and a link to the full review.",
      aspect: "portrait",
      focus: "Write the matchup as a question, one line on how you tested, then the same four specs for each product in the same order with the price last. End with a one-sentence verdict that says who each one is for.",
      feedCaption: { title: "Two e-readers, two weeks", body: "Same three books on both. Full review linked." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("sp_art", artHtml("#f4f4f5", '<div class="r dev" style="left:88px"><i></i></div><div class="r dev" style="left:184px;width:68px;height:90px;top:156px"><i></i></div>', ".dev{top:152px;width:72px;height:96px;border-radius:10px;background:#27272a}.dev i{position:absolute;left:7px;top:7px;right:7px;bottom:15px;border-radius:4px;background:repeating-linear-gradient(180deg,#e4e4e7 0 6px,#fafafa 6px 12px)}"), f2),
            chipLayer("sp_kicker", box(16, 48, 130, 26, 2), "E-READER TEST", ink, "#f4f4f5"),
            motion(textLayer2("sp_title", box(16, 84, 310, 36, 3), "Lumen 7 or Paper Pro?", { family: "serif", size: 26, color: ink, bold: true }), { in: "rise" }),
            textLayer2("sp_sub", box(16, 122, 310, 20, 4), "Two weeks, both devices, the same three books.", { size: 12, color: muted }),
            motion(column("sp_lumen", box(16, 256, 150, 168, 5), "#ffffff", ["LUMEN 7", "7 in, 300 ppi", "6 weeks battery", "Waterproof", "$149"], font, { strokeColor: "#d4d4d8", strokeWidth: 1 }), { in: "slideRight" }),
            motion(column("sp_paper", box(176, 256, 150, 168, 6), "#ffffff", ["PAPER PRO", "6.8 in, 300 ppi", "10 weeks battery", "Splash resistant", "$199"], font, { strokeColor: "#d4d4d8", strokeWidth: 1 }), { in: "slideLeft" }),
            panelLayer("sp_verdict", box(16, 432, 310, 48, 7), "#fde047", "Verdict: Lumen 7 for reading in the bath, Paper Pro for long trips.", { size: 12, color: ink, bold: true }, { name: "Verdict" }),
            buttonLayer("sp_review", box(16, 486, 310, 36, 8), "Read the full review", { fill: ink, color: "#fafafa" }, { behavior: "cta.open", openUrl: "https://parnoir.com/reviews/lumen-7-vs-paper-pro" })
          ]
        }
      ], { backgroundColor: "#f4f4f5", textColor: ink })
    });
  }
  function results() {
    const f2 = FRAMES.landscape;
    const ink = "#ecfeff";
    const metric = { family: "serif", size: 18, color: ink, bold: true };
    return postTemplate({
      id: "comparison.results.v1",
      classId: "social.comparison",
      title: "Before and after results",
      description: "Two metric columns, before and after a change, with how you did it behind a tap.",
      aspect: "landscape",
      featured: true,
      focus: "Write a headline about what changed and the period measured, then the same two metrics before and after with units. Put three short lines on how you did it in the reveal panel and link the write-up.",
      feedCaption: { title: "Our storefront, four times faster", body: "@fernway.eng \xB7 30 days after the rebuild" },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("rs_art", artHtml("#083344", '<svg width="640" height="360" style="position:absolute;inset:0"><polyline points="0,330 120,300 240,320 360,250 480,200 640,150" fill="none" stroke="rgba(34,211,238,.25)" stroke-width="3"/></svg>'), f2),
            chipLayer("rs_kicker", box(32, 30, 160, 24, 2), "SITE SPEED \xB7 30 DAYS", "#22d3ee", "#083344"),
            motion(textLayer2("rs_title", box(32, 62, 576, 36, 3), "We rebuilt our storefront. Here is what changed.", { family: "serif", size: 24, color: ink, bold: true }), { in: "rise" }),
            column("rs_before", box(32, 112, 280, 124, 4), "rgba(236,254,255,0.06)", ["BEFORE", "4.2 s mobile load time", "61% bounce rate"], metric, { strokeColor: "rgba(236,254,255,0.2)", strokeWidth: 1 }),
            motion(column("rs_after", box(328, 112, 280, 124, 5), "rgba(34,211,238,0.16)", ["AFTER", "1.1 s mobile load time", "23% bounce rate"], metric, { strokeColor: "#22d3ee", strokeWidth: 1 }), { in: "pop" }),
            panelLayer("rs_how", box(32, 112, 576, 124, 6), "#0e7490", ["How we did it", "Images moved to AVIF with lazy loading.", "Dropped two tracking scripts.", "Server-rendered the product grid."], { size: 14, color: ink }, { name: "How we did it", visible: false }),
            buttonLayer("rs_how_btn", box(32, 248, 200, 40, 7), "How we did it", { fill: "rgba(236,254,255,0.12)", color: ink }, { behavior: "widget.reveal", revealLayerId: "rs_how", revealMode: "toggle" }),
            buttonLayer("rs_read", box(244, 248, 200, 40, 8), "Read the write-up", { fill: "#22d3ee", color: "#083344" }, { behavior: "cta.open", openUrl: "https://parnoir.com/fernway/storefront-speed" })
          ]
        }
      ], { backgroundColor: "#083344" })
    });
  }
  function prosCons() {
    const f2 = FRAMES.portrait;
    const ink = "#1c1917";
    return postTemplate({
      id: "comparison.pros_cons.v1",
      classId: "social.comparison",
      title: "Pros and cons",
      description: "A buying question with pros and cons columns, a verdict, and a checklist link.",
      aspect: "portrait",
      focus: "Write the decision as a question with the year or context, three pros and three cons of one short line each, and a verdict that names the condition under which the answer is yes.",
      feedCaption: { title: "Used EVs in 2026: worth it?", body: "Check the battery before you buy." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("pc_art", artHtml("#fafaf9", '<div class="r car"></div><div class="s" style="left:112px;top:192px;width:30px;height:30px;background:#1c1917"></div><div class="s" style="left:196px;top:192px;width:30px;height:30px;background:#1c1917"></div><div class="r" style="left:232px;top:164px;width:10px;height:20px;border-radius:2px;background:#22c55e"></div>', ".car{left:94px;top:156px;width:150px;height:50px;border-radius:26px 32px 12px 12px;background:#0ea5e9}"), f2),
            chipLayer("pc_kicker", box(16, 48, 130, 26, 2), "BUYER\u2019S GUIDE", ink, "#fafaf9"),
            motion(textLayer2("pc_title", box(16, 86, 310, 58, 3), "Should you buy a used EV in 2026?", { family: "serif", size: 22, color: ink, bold: true }), { in: "rise" }),
            column("pc_pros", box(16, 236, 150, 164, 4), "#dcfce7", ["PROS", "Prices fell 30% since 2024", "Cheap to charge at home", "Few moving parts to fix"], { size: 13, color: "#14532d" }),
            column("pc_cons", box(176, 236, 150, 164, 5), "#fee2e2", ["CONS", "Battery health varies a lot", "Fast charging adds up", "Older models: shorter range"], { size: 13, color: "#7f1d1d" }),
            motion(panelLayer("pc_verdict", box(16, 410, 310, 56, 6), ink, "Verdict: yes, if you can charge at home and the battery reads above 85%.", { size: 13, color: "#fafaf9", bold: true }, { name: "Verdict" }), { in: "fade" }),
            buttonLayer("pc_helpful", box(16, 476, 146, 40, 7), "Helpful", { fill: "#22c55e", color: "#052e16" }, { behavior: "widget.stamp", label: "Found it helpful" }),
            buttonLayer("pc_check", box(172, 476, 154, 40, 8), "Battery checklist", { fill: "#ffffff", color: ink }, { behavior: "cta.open", openUrl: "https://parnoir.com/guides/used-ev-battery-check" }, { stroke: "#d6d3d1" })
          ]
        }
      ], { backgroundColor: "#fafaf9", textColor: ink })
    });
  }
  function comparisonTemplates() {
    return [pricing(), thisOrThat(), specs(), results(), prosCons()];
  }

  // ../pen-protocol/dist/templates/notes.js
  function openQuestion() {
    const f2 = FRAMES.portrait;
    const muted = "rgba(236,253,245,0.72)";
    return postTemplate({
      id: "note.open_question.v1",
      classId: "social.note",
      title: "Open question",
      description: "Ask your audience to vote, with a write-in for ideas you missed.",
      aspect: "portrait",
      featured: true,
      focus: "Write a short headline that says what you are deciding, one line on why their vote matters, and the poll question. Keep three answer options under four words each.",
      feedCaption: { title: "Help pick our Q3 build", body: "Voting closes Friday. Results go up Monday." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("oq_art", artHtml("linear-gradient(170deg,#022c22 0%,#064e3b 55%,#0f172a 100%)", '<div class="q">?</div><div class="s" style="width:90px;height:90px;left:250px;top:150px;background:rgba(253,230,138,0.18)"></div><div class="s" style="width:14px;height:14px;left:40px;top:250px;background:#fde68a"></div>', ".q{position:absolute;right:18px;top:6px;font:700 180px/1 Georgia,serif;color:rgba(253,230,138,0.14)}"), f2),
            chipLayer("oq_kicker", box(24, 48, 132, 26, 2), "ROADMAP \xB7 Q3", "#fde68a", "#022c22"),
            motion(textLayer2("oq_head", box(24, 88, 296, 72, 3), "We are planning Q3 and want your vote.", { family: "serif", size: 26, color: "#ecfdf5", bold: true }), { in: "rise" }),
            textLayer2("oq_sub", box(24, 164, 296, 40, 4), "Pick the one you would use every week, or tell us what we missed.", { size: 13, color: muted }),
            ...embedWidget("oq_poll", "widget.poll_writein.v1", "Poll", seedPollWriteInWidget, { x: 18, y: 212, scale: 0.88, z: 10 })
          ]
        }
      ])
    });
  }
  function hotTake() {
    const f2 = FRAMES.square;
    const ink = "#0b0b0c";
    return postTemplate({
      id: "note.hot_take.v1",
      classId: "social.note",
      title: "Hot take",
      description: "One bold opinion, an Agree stamp, and your reasoning behind a tap.",
      aspect: "square",
      featured: true,
      focus: "Write one opinion in a single sentence under 14 words, a byline with name and role, and a two-sentence reason that appears when readers tap Why.",
      feedCaption: { title: "No agenda, no meeting", body: "Dana Okafor on protecting six calendars at once." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("ht_art", artHtml("#facc15", '<div class="mark">&ldquo;</div><div class="r" style="left:0;right:0;bottom:0;height:8px;background:#0b0b0c"></div>', ".mark{position:absolute;right:12px;top:-40px;font:700 260px/1 Georgia,serif;color:rgba(11,11,12,0.1)}"), f2),
            chipLayer("ht_kicker", box(24, 24, 150, 24, 2), "UNPOPULAR OPINION", ink, "#facc15"),
            motion(textLayer2("ht_quote", box(24, 64, 296, 132, 3), "Meetings without an agenda should be declined on sight.", { family: "serif", size: 26, color: ink, bold: true }), { in: "pop" }),
            textLayer2("ht_by", box(24, 204, 296, 20, 4), "Dana Okafor, ops lead", { size: 12, color: "#3f3f46" }),
            panelLayer("ht_why", box(24, 232, 296, 72, 5), ink, "An agenda is the cheapest way to respect six calendars. No agenda, no meeting.", { size: 13, color: "#facc15" }, { name: "Why", visible: false }),
            buttonLayer("ht_agree", box(24, 312, 142, 36, 6), "Agree", { fill: ink, color: "#facc15" }, { behavior: "widget.stamp", label: "Agreed" }),
            buttonLayer("ht_why_btn", box(178, 312, 142, 36, 7), "Why?", { fill: "rgba(11,11,12,0.12)", color: ink }, { behavior: "widget.reveal", revealLayerId: "ht_why", revealMode: "toggle" })
          ]
        }
      ], { backgroundColor: "#facc15" })
    });
  }
  function lessonList() {
    const f2 = FRAMES.portrait;
    const t = themes.paper;
    const lessons = [
      "Ask the obvious question in week one. It only gets more expensive.",
      "Write down how things work. Your notes become the onboarding doc.",
      "Ship small. A merged fix beats a perfect draft.",
      "Learn who decides, not just who talks the most.",
      "Take the lunch invite. That is where the context lives."
    ];
    return postTemplate({
      id: "note.lesson.v1",
      classId: "social.note",
      title: "Lesson list",
      description: "Five numbered lessons on notebook paper, with a Save stamp.",
      aspect: "portrait",
      featured: true,
      focus: "Write a headline that promises a numbered list, then exactly five lessons of one sentence each. Each lesson should be concrete advice, not a slogan.",
      feedCaption: { title: "Five lessons from my first job", body: "@mara.writes \xB7 notes from year one" },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("ls_art", artHtml("#fbf7ee", '<div class="lines"></div><div class="r" style="left:44px;top:0;bottom:0;width:2px;background:#f87171"></div><div class="s" style="left:14px;top:120px;width:14px;height:14px;background:#e7e0d2"></div><div class="s" style="left:14px;top:320px;width:14px;height:14px;background:#e7e0d2"></div><div class="s" style="left:14px;top:520px;width:14px;height:14px;background:#e7e0d2"></div>', ".lines{position:absolute;inset:0;background:repeating-linear-gradient(180deg,transparent 0 35px,#dbeafe 35px 36px)}"), f2),
            chipLayer("ls_kicker", box(60, 48, 150, 26, 2), "FIRST-JOB NOTES", t.ink, t.bg),
            motion(textLayer2("ls_head", box(60, 88, 260, 64, 3), "Five things I wish I knew on day one", { family: "serif", size: 24, color: t.ink, bold: true }), { in: "rise" }),
            ...lessons.flatMap((lesson, i) => [
              textLayer2(`ls_n${i + 1}`, box(60, 164 + i * 64, 28, 28, 4 + i * 2), `0${i + 1}`, { family: "serif", size: 20, color: t.accent, bold: true }),
              textLayer2(`ls_t${i + 1}`, box(96, 164 + i * 64, 224, 56, 5 + i * 2), lesson, { size: 13, color: t.ink })
            ]),
            buttonLayer("ls_save", box(60, 482, 160, 36, 20), "Save this", t.primary, { behavior: "widget.stamp", label: "Saved" })
          ]
        }
      ], { backgroundColor: "#fbf7ee", textColor: "#1c1917" })
    });
  }
  function announcement() {
    const f2 = FRAMES.portrait;
    const t = themes.sunset;
    return postTemplate({
      id: "note.announcement.v1",
      classId: "social.note",
      title: "Announcement",
      description: "Big news, what changes for your readers, a countdown, and Add to calendar.",
      aspect: "portrait",
      focus: "Write the news as a headline, one or two sentences with the date and place, and three short lines on what changes for the reader. Set the calendar event to the same date.",
      feedCaption: { title: "We are moving to Lisbon", body: "Doors open 1 September at Rua das Flores 28." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("an_art", artHtml("linear-gradient(180deg,#7c2d12 0%,#c2410c 60%,#ea580c 100%)", '<div class="s" style="width:150px;height:150px;right:-30px;top:-30px;background:#fdba74;opacity:.55"></div><div class="roofs"></div>', ".roofs{position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(135deg,transparent 33%,rgba(67,20,7,.55) 33% 66%,transparent 66%) 0 0/60px 60px,linear-gradient(180deg,transparent 50%,rgba(67,20,7,.7) 50%)}"), f2),
            chipLayer("an_kicker", box(24, 48, 128, 26, 2), "STUDIO NEWS", t.ink, "#7c2d12"),
            motion(textLayer2("an_head", box(24, 88, 296, 112, 3), "Fieldwork Studio is moving to Lisbon", { family: "serif", size: 30, color: t.ink, bold: true }), { in: "drop" }),
            textLayer2("an_sub", box(24, 206, 296, 60, 4), "New light, new street, same team. Doors open at Rua das Flores 28 on 1 September.", { size: 14, color: t.muted }),
            panelLayer("an_changes", box(24, 280, 296, 140, 5), "rgba(255,247,237,0.12)", ["What changes for you", "Same email, same phone, same hours.", "Visits by appointment for the first month.", "Orders ship from Lisbon from 1 September."], { size: 13, color: t.ink }, { name: "What changes" }),
            textLayer2("an_cd_label", box(24, 436, 120, 20, 6), "Opening in", { size: 12, color: t.muted }),
            countdownLayer("an_cd", box(22, 460, 120, 32, 7), t.accent, 30),
            buttonLayer("an_cal", box(160, 448, 160, 44, 8), "Add to calendar", t.primary, {
              behavior: "cta.calendar",
              eventTitle: "Fieldwork Studio opening",
              eventLocation: "Rua das Flores 28, Lisbon",
              eventStart: eventStartIn(30, 18),
              eventDurationMin: 120
            })
          ]
        }
      ])
    });
  }
  function devTip() {
    const f2 = FRAMES.landscape;
    const muted = "rgba(230,237,243,0.68)";
    return postTemplate({
      id: "note.dev_tip.v1",
      classId: "social.note",
      title: "Dev tip",
      description: "A coding tip with a code panel, Copy snippet, and a docs link.",
      aspect: "landscape",
      focus: "Write a tip headline that names the result, two sentences explaining why it works, and a snippet of at most six lines in the Code panel. Link to official documentation.",
      feedCaption: { title: "Dedupe with a Set", body: "@devon.codes \xB7 new tip every Friday" },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("dt_art", artHtml("#0d1117", '<div class="grid"></div><div class="s" style="left:316px;top:30px;width:10px;height:10px;background:#f85149"></div><div class="s" style="left:332px;top:30px;width:10px;height:10px;background:#d29922"></div><div class="s" style="left:348px;top:30px;width:10px;height:10px;background:#3fb950"></div>', ".grid{position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px) 0 0/32px 32px,linear-gradient(180deg,rgba(255,255,255,.03) 1px,transparent 1px) 0 0/32px 32px}"), f2),
            chipLayer("dt_kicker", box(32, 34, 110, 24, 2), "JS TIP #14", "#facc15", "#0d1117"),
            motion(textLayer2("dt_head", box(32, 64, 260, 100, 3), "Dedupe an array in one line", { family: "serif", size: 28, color: "#e6edf3", bold: true }), { in: "slideRight" }),
            textLayer2("dt_body", box(32, 172, 260, 80, 4), "A Set keeps the first copy of each value, in order. Spread it back into an array and you are done.", { size: 13, color: muted }),
            motion(panelLayer("dt_code", box(316, 64, 292, 150, 5), "#161b22", ['const tags = ["ux", "js", "ux", "css"];', "", "const unique = [...new Set(tags)];", '// ["ux", "js", "css"]'], { family: "mono", size: 13, color: "#7ee787" }, { name: "Code", strokeColor: "#30363d", strokeWidth: 1 }), { in: "fade" }),
            buttonLayer("dt_copy", box(316, 236, 140, 40, 6), "Copy snippet", { fill: "#238636", color: "#ffffff" }, { behavior: "widget.stamp", label: "Copied" }),
            buttonLayer("dt_docs", box(468, 236, 140, 40, 7), "MDN docs", { fill: "rgba(255,255,255,0.08)", color: "#e6edf3" }, { behavior: "cta.open", openUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set" })
          ]
        }
      ])
    });
  }
  function noteTemplates() {
    return [openQuestion(), hotTake(), lessonList(), announcement(), devTip()];
  }

  // ../pen-protocol/dist/templates/posts.js
  var BOTTOM_SCRIM = "linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0.85) 100%)";
  function productDrop() {
    const f2 = FRAMES.portrait;
    return postTemplate({
      id: "post.product_drop.v1",
      classId: "social.post",
      title: "Product drop",
      description: "A hero photo, a drop countdown, and a product card with Buy now.",
      aspect: "portrait",
      featured: true,
      focus: "Write the batch line for the photo, then the product name, a one-sentence description with material and size, the price, and shipping time. Point Buy now at the real shop page.",
      feedCaption: { title: "Amber mug, batch 04", body: "Sixty made, glazed by hand. Drops this week." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("pd_art", artHtml("#efe6d6", '<div class="r" style="left:0;right:0;top:258px;height:4px;background:#d6c7a8"></div>'), f2),
            slotLayer("pd_photo", box(0, 0, 360, 260, 2), "Photo", artHtml("linear-gradient(160deg,#fde68a 0%,#f59e0b 55%,#b45309 100%)", '<div class="s" style="left:90px;top:214px;width:180px;height:30px;background:rgba(67,20,7,.35)"></div><div class="r body"></div><div class="r rim"></div><div class="r handle"></div><div class="s" style="left:286px;top:40px;width:46px;height:46px;background:rgba(255,255,255,.35)"></div>', ".body{left:130px;top:96px;width:100px;height:130px;border-radius:10px 10px 26px 26px;background:#fff7ed;box-shadow:inset -18px 0 0 rgba(180,83,9,.18)}.rim{left:130px;top:96px;width:100px;height:16px;border-radius:10px 10px 0 0;background:#92400e}.handle{left:222px;top:124px;width:36px;height:56px;border:12px solid #fff7ed;border-left:none;border-radius:0 30px 30px 0;box-sizing:border-box}")),
            chipLayer("pd_drop", box(16, 48, 96, 26, 3), "DROPS IN", "#1c1917", "#f6f1e7"),
            countdownLayer("pd_cd", box(118, 47, 110, 28, 4), "#1c1917", 3, "rgba(246,241,231,0.92)"),
            motion(textLayer2("pd_batch", box(16, 224, 220, 24, 5), "BATCH 04 \xB7 60 MADE", { size: 11, color: "#ffffff", bold: true }), { in: "fade" }),
            ...embedWidget("pd_card", "widget.creator_product.v1", "Product", seedCreatorProduct, { x: 36, y: 260, scale: 0.8, z: 10 })
          ]
        }
      ])
    });
  }
  function recipeReel() {
    const f2 = FRAMES.portrait;
    return postTemplate({
      id: "post.recipe_reel.v1",
      classId: "social.post",
      title: "Recipe reel",
      description: "A full-frame cooking clip with time, servings, ingredients, and Full recipe.",
      aspect: "portrait",
      featured: true,
      focus: "Put the dish name and one line that sells how easy it is in the feed caption. On the page, set the cook time and servings, and up to six ingredients separated by dots. Link Full recipe to the written method.",
      feedCaption: { title: "Lemon garlic orzo", body: "One pan, no draining, done before pasta water would boil." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("rr_art", artHtml("#1c1917", ""), f2),
            slotLayer("rr_clip", box(0, 0, 360, 640, 2), "Clip", artHtml("radial-gradient(circle at 50% 38%,#78350f 0%,#292524 70%)", '<div class="s pan"></div><div class="s food"></div><div class="s" style="left:150px;top:170px;width:34px;height:34px;background:#fde047;border:4px solid #facc15"></div><div class="s" style="left:196px;top:220px;width:28px;height:28px;background:#fde047;border:4px solid #facc15"></div><div class="r" style="left:300px;top:200px;width:70px;height:14px;border-radius:7px;background:#44403c"></div><div class="r bar"></div>', ".pan{left:60px;top:110px;width:240px;height:240px;background:#1c1917;box-shadow:0 0 0 10px #292524}.food{left:78px;top:128px;width:204px;height:204px;background:radial-gradient(circle,#fef3c7 0 2px,transparent 3px) 0 0/12px 12px,#fde68a}.bar{left:0;top:636px;width:140px;height:4px;background:#fef08a}")),
            scrimLayer("rr_scrim", box(0, 360, 360, 280, 3), BOTTOM_SCRIM),
            chipLayer("rr_time", box(16, 48, 92, 26, 4), "15 MIN", "#fef08a", "#1c1917"),
            chipLayer("rr_serves", box(114, 48, 92, 26, 5), "SERVES 2", "rgba(255,255,255,0.18)", "#ffffff"),
            motion(panelLayer("rr_ingredients", box(20, 408, 300, 44, 8), "rgba(255,255,255,0.12)", "Orzo \xB7 lemon \xB7 garlic \xB7 parmesan \xB7 peas \xB7 butter", { size: 12, color: "#ffffff", align: "center" }, { name: "Ingredients" }), { in: "rise" }),
            buttonLayer("rr_full", box(20, 464, 180, 40, 9), "Full recipe", { fill: "#fef08a", color: "#1c1917" }, { behavior: "cta.open", openUrl: "https://parnoir.com/recipes/lemon-garlic-orzo" }),
            buttonLayer("rr_save", box(212, 464, 108, 40, 10), "Save", { fill: "rgba(255,255,255,0.16)", color: "#ffffff" }, { behavior: "widget.stamp", label: "Saved" })
          ]
        }
      ])
    });
  }
  function eventRecap() {
    const f2 = FRAMES.landscape;
    return postTemplate({
      id: "post.event_recap.v1",
      classId: "social.post",
      title: "Event recap",
      description: "The best photo from the night, the date, the numbers, and See all photos.",
      aspect: "landscape",
      featured: true,
      focus: "Write the event name with its edition, the date in the date badge, and one sentence with two or three real numbers from the day. Link See all photos to the full album.",
      feedCaption: { title: "Thank you, Night Market", body: "The full album from Saturday is up." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("er_art", artHtml("#0f0a1e", '<div class="s" style="left:560px;top:-60px;width:160px;height:160px;background:rgba(244,114,182,.18)"></div>'), f2),
            slotLayer("er_photo", box(0, 0, 400, 360, 2), "Photo", artHtml("linear-gradient(180deg,#1e1b4b 0%,#312e81 60%,#0f0a1e 100%)", '<div class="lights"></div><div class="r stall" style="left:20px"></div><div class="r stall" style="left:150px;background:repeating-linear-gradient(90deg,#34d399 0 16px,#ecfdf5 16px 32px)"></div><div class="r stall" style="left:280px;background:repeating-linear-gradient(90deg,#fbbf24 0 16px,#fffbeb 16px 32px)"></div><div class="r" style="left:0;right:0;bottom:0;height:64px;background:linear-gradient(180deg,#4c1d95 0%,#2e1065 100%);border-top:3px solid #fde68a"></div>', ".lights{position:absolute;left:-20px;top:30px;width:440px;height:80px;border-bottom:2px solid rgba(255,255,255,.25);border-radius:0 0 50% 50%;background:radial-gradient(circle,#fde68a 0 3px,transparent 4px) 0 100%/28px 20px repeat-x}.stall{top:180px;width:110px;height:120px;border-radius:6px 6px 0 0;background:repeating-linear-gradient(90deg,#f472b6 0 16px,#fdf2f8 16px 32px)}")),
            motion(panelLayer("er_date", box(424, 32, 64, 64, 3), "#f472b6", ["SAT", "14 JUN"], { size: 12, color: "#0f0a1e", bold: true, align: "center" }, { name: "Date", cornerRadius: 14 }), { in: "pop" }),
            textLayer2("er_kicker", box(424, 106, 180, 18, 4), "RECAP", { size: 11, color: "#f9a8d4", bold: true }),
            motion(textLayer2("er_title", box(424, 128, 180, 60, 5), "Night Market, year three", { family: "serif", size: 22, color: "#ffffff", bold: true }), { in: "slideLeft" }),
            textLayer2("er_stats", box(424, 194, 180, 50, 6), "2,400 visitors, 61 stalls, and one very long dumpling queue.", { size: 12, color: "rgba(255,255,255,0.72)" }),
            buttonLayer("er_all", box(424, 250, 180, 38, 7), "See all photos", { fill: "#f472b6", color: "#0f0a1e" }, { behavior: "cta.open", openUrl: "https://parnoir.com/nightmarket/2026" })
          ]
        }
      ])
    });
  }
  function beforeAfter() {
    const f2 = FRAMES.square;
    return postTemplate({
      id: "post.before_after.v1",
      classId: "social.post",
      title: "Before and after",
      description: "Two photos of the same space behind Before and After tabs.",
      aspect: "square",
      focus: "Name the project in the kicker, write a short title about the effort, and one line with cost or time. Attach the after photo to Photo after and the original to Photo before.",
      feedCaption: { title: "Kitchen, six weekends later", body: "Tap Before to see where it started." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("bf_art", artHtml("#1c1917", '<div class="r" style="left:0;right:0;top:260px;height:2px;background:#fde68a"></div>'), f2),
            slotLayer("bf_after", box(0, 0, 360, 260, 2), "Photo after", artHtml("linear-gradient(180deg,#fefce8 0%,#fef3c7 100%)", '<div class="r" style="left:30px;top:60px;width:130px;height:8px;background:#b45309"></div><div class="r" style="left:30px;top:120px;width:130px;height:8px;background:#b45309"></div><div class="s" style="left:50px;top:30px;width:28px;height:28px;background:#4d7c0f"></div><div class="r" style="left:100px;top:90px;width:22px;height:30px;border-radius:4px;background:#e0f2fe"></div><div class="r" style="left:0;right:0;top:180px;height:80px;background:#d6b98c"></div><div class="r" style="left:210px;top:40px;width:120px;height:110px;border-radius:6px;background:#bae6fd;border:6px solid #fff"></div>')),
            slotLayer("bf_before", box(0, 0, 360, 260, 3), "Photo before", artHtml("linear-gradient(180deg,#44403c 0%,#292524 100%)", '<div class="r" style="left:20px;top:30px;width:150px;height:120px;background:#57534e;border:2px solid #1c1917"></div><div class="r" style="left:190px;top:30px;width:150px;height:120px;background:#57534e;border:2px solid #1c1917"></div><div class="s" style="left:170px;top:4px;width:20px;height:20px;background:#fef9c3;opacity:.5"></div><div class="r" style="left:0;right:0;top:180px;height:80px;background:#3f3f46"></div>'), { visible: false }),
            chipLayer("bf_kicker", box(16, 16, 120, 26, 4), "KITCHEN REDO", "#1c1917", "#fde68a"),
            motion(textLayer2("bf_title", box(16, 272, 216, 28, 5), "Six weekends later", { family: "serif", size: 20, color: "#fafaf9", bold: true }), { in: "rise" }),
            textLayer2("bf_cost", box(244, 272, 80, 72, 6), "$2,100, two sanders, zero regrets.", { size: 11, color: "rgba(250,250,249,0.7)" }),
            buttonLayer("bf_b", box(16, 310, 104, 36, 7), "Before", { fill: "rgba(255,255,255,0.12)", color: "#fafaf9" }, { behavior: "widget.reveal", revealLayerId: "bf_before", revealMode: "tab" }),
            buttonLayer("bf_a", box(128, 310, 104, 36, 8), "After", { fill: "#fde68a", color: "#1c1917" }, { behavior: "widget.reveal", revealLayerId: "bf_after", revealMode: "tab" })
          ]
        }
      ])
    });
  }
  function btsClip() {
    const f2 = FRAMES.portrait;
    return postTemplate({
      id: "post.bts_clip.v1",
      classId: "social.post",
      title: "Behind the scenes",
      description: "A full-frame set clip with an ON SET tag and the story behind a tap.",
      aspect: "portrait",
      focus: "Put a title about one moment from the shoot and one line with the project and day in the feed caption. On the page, write two short lines on what went wrong that appear behind the reveal button.",
      feedCaption: { title: "The shot that took nine takes", body: "Day 12 of the Harbor Coffee spot. Take nine made the final cut." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("bt_art", artHtml("#0a0a0a", ""), f2),
            slotLayer("bt_clip", box(0, 0, 360, 640, 2), "Clip", artHtml("linear-gradient(180deg,#18181b 0%,#27272a 100%)", '<div class="cone"></div><div class="r box"></div><div class="r" style="left:96px;top:150px;width:4px;height:330px;background:#52525b"></div><div class="r" style="left:240px;top:380px;width:80px;height:10px;background:#a16207"></div><div class="r" style="left:248px;top:390px;width:8px;height:70px;background:#a16207"></div><div class="r" style="left:304px;top:390px;width:8px;height:70px;background:#a16207"></div>', ".box{left:60px;top:110px;width:80px;height:60px;border-radius:4px;background:#fafafa;box-shadow:0 0 40px rgba(255,255,255,.5)}.cone{position:absolute;left:100px;top:160px;width:0;height:0;border-left:40px solid transparent;border-right:220px solid transparent;border-top:340px solid rgba(254,240,138,.12)}")),
            scrimLayer("bt_scrim", box(0, 360, 360, 280, 3), BOTTOM_SCRIM),
            chipLayer("bt_onset", box(16, 48, 84, 26, 4), "ON SET", "#fafafa", "#0a0a0a"),
            motion(chipLayer("bt_rec", box(268, 48, 76, 26, 5), "\u25CF REC", "#dc2626", "#ffffff"), { in: "fade" }),
            panelLayer("bt_wrong", box(20, 330, 300, 120, 6), "rgba(10,10,10,0.85)", ["What went wrong", "Takes 1 to 4: the steam would not show on camera.", "Takes 5 to 8: a bus parked in the window."], { size: 13, color: "#fafafa" }, { name: "What went wrong", visible: false }),
            motion(buttonLayer("bt_reveal", box(20, 466, 180, 40, 9), "What went wrong?", { fill: "#fafafa", color: "#0a0a0a" }, { behavior: "widget.reveal", revealLayerId: "bt_wrong", revealMode: "toggle" }), { in: "rise" }),
            buttonLayer("bt_follow", box(212, 466, 108, 40, 10), "Follow", { fill: "rgba(255,255,255,0.16)", color: "#ffffff" }, { behavior: "widget.stamp", label: "Following" })
          ]
        }
      ])
    });
  }
  function postTemplates() {
    return [productDrop(), recipeReel(), eventRecap(), beforeAfter(), btsClip()];
  }

  // ../pen-protocol/dist/templates/profiles.js
  function portraitArt(bg, skin, hair, shirt, extra = "") {
    return artHtml(bg, `<div class="s" style="left:22%;top:72%;width:56%;height:60%;background:${shirt}"></div><div class="s" style="left:30%;top:22%;width:40%;height:44%;background:${skin}"></div><div class="r" style="left:27%;top:14%;width:46%;height:22%;border-radius:50% 50% 20% 20%;background:${hair}"></div>${extra}`);
  }
  function creatorIntro() {
    const f2 = FRAMES.portrait;
    const ink = "#3b0764";
    const muted = "#7e22ce";
    const stat = (id2, x, value, label, z) => panelLayer(id2, box(x, 262, 92, 60, z), "#ffffff", [value, label], { size: 13, color: ink, bold: true, align: "center" }, { name: "Stat" });
    return postTemplate({
      id: "profile.creator_intro.v1",
      classId: "social.profile",
      title: "Creator intro",
      description: "Introduce yourself: portrait, three stats, a short bio, Follow, and your links.",
      aspect: "portrait",
      featured: true,
      focus: "Write the creator name, a role line with what they make, three stats with real numbers, a two-sentence bio in first person, and two link buttons for where people can buy or hire.",
      feedCaption: { title: "Hi, I am Theo", body: "@theo.draws \xB7 picture books and editorial" },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("ci_art", artHtml("#fdf2f8", '<div class="s" style="left:-60px;top:-40px;width:220px;height:220px;background:#fbcfe8"></div><div class="s" style="left:240px;top:60px;width:160px;height:160px;background:#ddd6fe"></div><svg width="360" height="640" style="position:absolute;inset:0"><path d="M20 620 q 40 -30 80 0 t 80 0 t 80 0 t 80 0" fill="none" stroke="#a855f7" stroke-width="2"/></svg>'), f2),
            motion(slotLayer("ci_avatar", box(120, 56, 120, 120, 2), "Avatar", portraitArt("#c4b5fd", "#fcd9b6", "#3b0764", "#a855f7"), { cornerRadius: 60 }), { in: "zoom" }),
            textLayer2("ci_name", box(24, 186, 312, 40, 3), "Theo Marsh", { family: "serif", size: 30, color: ink, bold: true, align: "center" }, { name: "Name" }),
            textLayer2("ci_role", box(24, 230, 312, 20, 4), "Illustrator \xB7 picture books and editorial", { size: 13, color: muted, align: "center" }),
            stat("ci_s1", 30, "48", "books", 5),
            stat("ci_s2", 132, "1.2k", "prints sold", 6),
            stat("ci_s3", 234, "9 yrs", "drawing", 7),
            textLayer2("ci_bio", box(30, 334, 296, 56, 8), "I draw small animals with big feelings. Right now I am illustrating my fifth picture book.", { size: 13, color: ink, align: "center" }),
            buttonLayer("ci_follow", box(30, 400, 296, 44, 9), "Follow", { fill: "#7e22ce", color: "#ffffff" }, { behavior: "widget.stamp", label: "Following" }),
            buttonLayer("ci_shop", box(30, 456, 142, 40, 10), "Print shop", { fill: "#ffffff", color: ink }, { behavior: "cta.open", openUrl: "https://parnoir.com/theo/shop" }, { stroke: "#e9d5ff" }),
            buttonLayer("ci_hire", box(184, 456, 142, 40, 11), "Commissions", { fill: "#ffffff", color: ink }, { behavior: "cta.open", openUrl: "https://parnoir.com/theo/commissions" }, { stroke: "#e9d5ff" })
          ]
        }
      ], { backgroundColor: "#fdf2f8", textColor: ink })
    });
  }
  function teamSpotlight() {
    const f2 = FRAMES.square;
    const ink = "#f1f5f9";
    return postTemplate({
      id: "profile.team_spotlight.v1",
      classId: "social.profile",
      title: "Team spotlight",
      description: "Meet a teammate: portrait, role, a quote in their words, and a fun fact behind a tap.",
      aspect: "square",
      featured: true,
      focus: "Write the teammate name, role with start year and city, one sentence quote in their own voice about how they work, and a playful fun fact. Set Say hi to their work email.",
      feedCaption: { title: "Meet Priya, our support lead", body: "Fernway \xB7 we are hiring, too" },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("ts_art", artHtml("#1e293b", '<div class="r" style="left:-40px;top:250px;width:480px;height:60px;transform:rotate(-12deg);background:rgba(56,189,248,.14)"></div><div class="r" style="left:-40px;top:300px;width:480px;height:20px;transform:rotate(-12deg);background:rgba(250,204,21,.2)"></div>'), f2),
            chipLayer("ts_kicker", box(24, 20, 130, 26, 2), "MEET THE TEAM", "#38bdf8", "#0f172a"),
            motion(slotLayer("ts_avatar", box(24, 58, 96, 96, 3), "Avatar", portraitArt("#38bdf8", "#c08457", "#0f172a", "#facc15"), { cornerRadius: 48 }), { in: "pop" }),
            textLayer2("ts_name", box(136, 62, 200, 32, 4), "Priya Natarajan", { family: "serif", size: 22, color: ink, bold: true }, { name: "Name" }),
            textLayer2("ts_role", box(136, 98, 200, 40, 5), "Support lead \xB7 joined 2023 \xB7 Bengaluru", { size: 12, color: "rgba(241,245,249,0.7)" }),
            panelLayer("ts_quote", box(24, 168, 296, 88, 6), "rgba(241,245,249,0.08)", "\u201CThe best support answer is the one that makes the next question unnecessary.\u201D", { family: "serif", size: 15, color: ink, italic: true }, { name: "Quote" }),
            panelLayer("ts_fact", box(24, 168, 296, 88, 7), "#facc15", ["FUN FACT", "Priya has run a marathon on every continent except Antarctica. It is booked for 2027."], { size: 13, color: "#0f172a" }, { name: "Fun fact", visible: false }),
            buttonLayer("ts_fact_btn", box(24, 270, 142, 40, 8), "Fun fact", { fill: "rgba(241,245,249,0.12)", color: ink }, { behavior: "widget.reveal", revealLayerId: "ts_fact", revealMode: "toggle" }),
            buttonLayer("ts_hi", box(178, 270, 142, 40, 9), "Say hi", { fill: "#38bdf8", color: "#0f172a" }, { behavior: "cta.open", openUrl: "mailto:priya@fernway.com" })
          ]
        }
      ], { backgroundColor: "#1e293b" })
    });
  }
  function hiring() {
    const f2 = FRAMES.portrait;
    const ink = "#eef2ff";
    const muted = "rgba(238,242,255,0.7)";
    const perks = ["4-day weeks every August", "\u20AC2k yearly learning budget", "Ship to 30k shops from week two"];
    return postTemplate({
      id: "profile.hiring.v1",
      classId: "social.profile",
      title: "We are hiring",
      description: "A company card with the open role, salary, perks, role details, and Apply.",
      aspect: "portrait",
      featured: true,
      focus: "Write the company name and what it does, the role title, location, salary range, and contract type, three perks, and three lines about the role. Link Apply to the job posting.",
      feedCaption: { title: "Fernway is hiring a designer", body: "Applications close 30 November." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("hr_art", artHtml("#1e1b4b", '<div class="r" style="inset:0;background:linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(180deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/40px 40px"></div><div class="p" style="left:290px;top:150px">+</div><div class="p" style="left:250px;top:560px">+</div>', ".p{position:absolute;font:300 60px/1 Montserrat,Helvetica,sans-serif;color:rgba(165,180,252,.4)}"), f2),
            slotLayer("hr_logo", box(24, 48, 72, 72, 2), "Avatar", artHtml("#4ade80", '<div class="r" style="left:34px;top:12px;width:4px;height:50px;background:#14532d"></div>' + [0, 1, 2, 3].map((i) => `<div class="r" style="left:${i % 2 ? 38 : 16}px;top:${16 + i * 10}px;width:18px;height:8px;border-radius:50%;background:#14532d"></div>`).join("")), { cornerRadius: 16 }),
            textLayer2("hr_name", box(108, 56, 228, 28, 3), "Fernway", { size: 20, color: ink, bold: true }, { name: "Name" }),
            textLayer2("hr_what", box(108, 88, 228, 20, 4), "Checkout for independent shops", { size: 12, color: muted }),
            chipLayer("hr_chip", box(24, 136, 124, 26, 5), "NOW HIRING", "#a5b4fc", "#1e1b4b"),
            motion(textLayer2("hr_role", box(24, 172, 312, 72, 6), "Senior Product Designer", { family: "serif", size: 30, color: ink, bold: true }), { in: "rise" }),
            textLayer2("hr_meta", box(24, 250, 312, 20, 7), "Remote, Europe \xB7 \u20AC75k to \u20AC90k \xB7 full time", { size: 13, color: "#a5b4fc", bold: true }),
            ...perks.map((perk, i) => panelLayer(`hr_perk${i + 1}`, box(24, 282 + i * 44, 296, 38, 8 + i), "rgba(238,242,255,0.08)", perk, { size: 13, color: ink }, { name: "Perk" })),
            panelLayer("hr_details", box(24, 282, 296, 126, 12), "#312e81", ["The role", "Own checkout and onboarding end to end.", "Work with three engineers and a PM.", "Portfolio required, no take-home task."], { size: 13, color: ink }, { name: "The role", visible: false }),
            buttonLayer("hr_more", box(24, 420, 296, 40, 13), "About the role", { fill: "rgba(238,242,255,0.12)", color: ink }, { behavior: "widget.reveal", revealLayerId: "hr_details", revealMode: "toggle" }),
            buttonLayer("hr_apply", box(24, 470, 296, 44, 14), "Apply", { fill: "#a5b4fc", color: "#1e1b4b" }, { behavior: "cta.open", openUrl: "https://fernway.com/jobs/senior-product-designer" })
          ]
        }
      ], { backgroundColor: "#1e1b4b" })
    });
  }
  function services() {
    const f2 = FRAMES.portrait;
    const ink = "#fafaf9";
    const muted = "rgba(250,250,249,0.68)";
    const rows = [
      ["Portrait session \xB7 \u20AC180", "1 hour, 20 edited photos"],
      ["Elopement \xB7 \u20AC950", "4 hours, two locations, 150 photos"],
      ["Full wedding \xB7 \u20AC2,400", "10 hours, second shooter, printed album"]
    ];
    return postTemplate({
      id: "profile.services.v1",
      classId: "social.profile",
      title: "Services menu",
      description: "A freelancer card with three priced services, booking, and a quick inquiry form.",
      aspect: "portrait",
      focus: "Write the freelancer name, craft and city, and three services each with a price and one line of what is included. Put the reply-time promise in the feed caption. Link booking to their calendar page.",
      feedCaption: { title: "Now booking 2027 weddings", body: "Lena Ortiz replies within a day." },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("sv_art", artHtml("#292524", '<div class="r" style="right:0;top:0;bottom:0;width:18px;background:repeating-linear-gradient(180deg,#1c1917 0 10px,#fbbf24 10px 16px,#1c1917 16px 26px)"></div>'), f2),
            slotLayer("sv_avatar", box(24, 40, 80, 80, 2), "Avatar", portraitArt("#fbbf24", "#e0ac69", "#451a03", "#1c1917", '<div class="r" style="left:36%;top:52%;width:28%;height:16%;border-radius:4px;background:#1c1917"></div>'), { cornerRadius: 40 }),
            textLayer2("sv_name", box(120, 48, 216, 32, 3), "Lena Ortiz", { family: "serif", size: 26, color: ink, bold: true }, { name: "Name" }),
            textLayer2("sv_role", box(120, 84, 216, 36, 4), "Wedding and portrait photographer \xB7 Porto", { size: 12, color: muted }),
            textLayer2("sv_kicker", box(24, 140, 200, 20, 5), "SERVICES", { size: 11, color: "#fbbf24", bold: true }),
            ...rows.map(([title, detail], i) => {
              const row = panelLayer(`sv_row${i + 1}`, box(24, 168 + i * 76, 296, 64, 6 + i), "rgba(250,250,249,0.06)", [title, detail], { size: 13, color: ink }, { name: "Service", strokeColor: "rgba(251,191,36,0.3)", strokeWidth: 1 });
              return i === 0 ? motion(row, { in: "rise" }) : row;
            }),
            buttonLayer("sv_book", box(24, 400, 296, 44, 9), "Check dates and book", { fill: "#fbbf24", color: "#1c1917" }, { behavior: "cta.open", openUrl: "https://parnoir.com/lena/book" }),
            inputLayer("sv_field", box(24, 460, 200, 44, 10), "Your date and email\u2026", { fill: "#fafaf9", color: "#1c1917" }, { name: "Inquiry" }),
            buttonLayer("sv_send", box(232, 460, 88, 44, 11), "Ask", { fill: "rgba(250,250,249,0.14)", color: ink }, { behavior: "widget.submit", label: "Quick inquiry" })
          ]
        }
      ], { backgroundColor: "#292524" })
    });
  }
  function artist() {
    const f2 = FRAMES.landscape;
    const ink = "#faf5ff";
    const muted = "rgba(250,245,255,0.7)";
    return postTemplate({
      id: "profile.artist.v1",
      classId: "social.profile",
      title: "Artist page",
      description: "A musician card with portrait, the new single, Listen, Follow, and tour dates.",
      aspect: "landscape",
      focus: "Write the artist name, genre and home cities, the new release title with a one-line hook, and up to four tour dates with city. Link Listen to the release page.",
      feedCaption: { title: "Slow Water is out now", body: "@juneokafor \xB7 2.1M monthly listeners" },
      seed: pageSeed(f2, [
        {
          slug: "body",
          layers: [
            pageArt("ar_art", artHtml("linear-gradient(120deg,#2e1065 0%,#581c87 70%,#86198f 100%)", '<svg width="640" height="360" style="position:absolute;inset:0"><path d="M440 200 q 20 -60 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="rgba(244,114,182,.35)" stroke-width="3"/><path d="M440 230 q 20 -30 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="rgba(250,245,255,.2)" stroke-width="2"/></svg>'), f2),
            motion(slotLayer("ar_avatar", box(32, 32, 88, 88, 2), "Avatar", portraitArt("#f472b6", "#8d5524", "#1e1b4b", "#faf5ff"), { cornerRadius: 44 }), { in: "zoom" }),
            textLayer2("ar_name", box(136, 40, 280, 36, 3), "June Okafor", { family: "serif", size: 28, color: ink, bold: true }, { name: "Name" }),
            textLayer2("ar_role", box(136, 80, 280, 20, 4), "Singer-songwriter \xB7 Lagos and London", { size: 12, color: muted }),
            slotLayer("ar_track", box(32, 140, 160, 160, 5), "Track", artHtml("linear-gradient(180deg,#fb923c 0%,#db2777 100%)", '<div class="s" style="left:50px;top:40px;width:60px;height:60px;background:#fef3c7"></div><div class="r" style="left:0;right:0;top:110px;height:4px;background:#2e1065"></div><div class="r" style="left:0;right:0;top:124px;height:4px;background:#2e1065"></div><div class="r" style="left:0;right:0;top:138px;height:4px;background:#2e1065"></div>'), { cornerRadius: 10 }),
            textLayer2("ar_kicker", box(208, 140, 200, 20, 6), "NEW SINGLE", { size: 11, color: "#f9a8d4", bold: true }),
            motion(textLayer2("ar_single", box(208, 162, 220, 36, 7), "Slow Water", { family: "serif", size: 24, color: ink, bold: true }), { in: "slideLeft" }),
            textLayer2("ar_hook", box(208, 200, 220, 36, 8), "Out now everywhere you listen.", { size: 12, color: muted }),
            buttonLayer("ar_listen", box(208, 244, 120, 40, 9), "Listen", { fill: "#f472b6", color: "#2e1065" }, { behavior: "cta.open", openUrl: "https://parnoir.com/juneokafor/slow-water" }),
            buttonLayer("ar_follow", box(340, 244, 100, 40, 10), "Follow", { fill: "rgba(250,245,255,0.14)", color: ink }, { behavior: "widget.stamp", label: "Following" }),
            panelLayer("ar_tour", box(460, 32, 148, 200, 11), "rgba(46,16,101,0.9)", ["ON TOUR", "12 Mar \xB7 Lagos", "19 Mar \xB7 Accra", "2 Apr \xB7 London", "9 Apr \xB7 Paris"], { size: 13, color: ink }, { name: "Tour dates", visible: false }),
            buttonLayer("ar_tour_btn", box(460, 244, 148, 40, 12), "Tour dates", { fill: "rgba(250,245,255,0.14)", color: ink }, { behavior: "widget.reveal", revealLayerId: "ar_tour", revealMode: "toggle" })
          ]
        }
      ], { backgroundColor: "#2e1065" })
    });
  }
  function profileTemplates() {
    return [creatorIntro(), teamSpotlight(), hiring(), services(), artist()];
  }

  // ../pen-protocol/dist/templates/index.js
  function platformPostTemplates() {
    return [...noteTemplates(), ...postTemplates(), ...collectionTemplates(), ...profileTemplates(), ...comparisonTemplates()];
  }

  // ../pen-protocol/dist/templates.js
  function withSeed(base, seed) {
    return __spreadProps(__spreadValues({}, base), {
      seedSections: seed.seedSections,
      seedPagePresentation: seed.seedPagePresentation,
      seedPageLayout: seed.seedPageLayout
    });
  }
  function registerStarter(input) {
    const cols = input.columns.map((c) => `${c.id}:${c.type}${c.required ? "*" : ""}`).join(", ");
    return [
      `You are authoring a Pen Register with template {{template_id}} ("${input.title}").`,
      `Columns ( *=required ): ${cols}.`,
      'Emit ONLY a PenAgentBuild JSON object: { "templateId", "title", "rows": [ { columnId: value, ... } ] }.',
      "Do not use freeform TipTap sections for row data. Do not invent folder paths or extra columns.",
      "Never include secrets, Key 1, Key 2, tokens, or raw account identifiers.",
      "User request:",
      "{{user_input}}"
    ].join("\n");
  }
  var DEFAULT_REGISTER_COLUMNS = [
    { id: "id", title: "Id", type: "string", required: true },
    { id: "label", title: "Label", type: "string", required: true },
    { id: "notes", title: "Notes", type: "string", required: false }
  ];
  function widgetStarter(id2, title, description, focus, seed) {
    return withSeed({
      id: id2,
      classId: "widgets.widget",
      docType: "widget",
      version: "1",
      title,
      description,
      sections: [{ slug: "card", title: "Card", required: true }],
      seedGalleryAspect: "1/1",
      agentStarter: proseStarter({ title, focus })
    }, seed);
  }
  function widgetStarters() {
    return [
      widgetStarter("widget.v1", "Widget", "Empty template. Place layers on the preview and set a trigger on a button.", "Arrange layers by dragging them. A button does nothing until its trigger is set.", seedWidget()),
      ...curatedWidgetTemplates(),
      withSeed({
        id: "sticker.v1",
        classId: "widgets.sticker",
        docType: "sticker",
        version: "1",
        title: "Sticker",
        description: "Empty sticker. Place SVG, image, or text. No button and no trigger.",
        sections: [{ slug: "card", title: "Card", required: true }],
        seedGalleryAspect: "1/1",
        agentStarter: proseStarter({
          title: "Sticker",
          focus: "Place art on the card. Do not add a button or a trigger."
        })
      }, seedWidget()),
      withSeed({
        id: "animation.v1",
        classId: "widgets.animation",
        docType: "animation",
        version: "1",
        title: "Animation",
        description: "One layer that rises in. Replace the motion to publish your own.",
        sections: [{ slug: "card", title: "Card", required: true }],
        seedGalleryAspect: "1/1",
        agentStarter: proseStarter({
          title: "Animation",
          focus: "Keep a single layer. Set its intro motion. Do not add a button or a trigger."
        })
      }, seedAnimationPreset()),
      withSeed({
        id: "transition.v1",
        classId: "widgets.transition",
        docType: "transition",
        version: "1",
        title: "Transition",
        description: "Two clips on one track. The second fades in from the first.",
        sections: [{ slug: "card", title: "Card", required: true }],
        seedGalleryAspect: "1/1",
        agentStarter: proseStarter({
          title: "Transition",
          focus: "Keep two clips on one track and set the join on the incoming clip."
        })
      }, seedTransitionPreset()),
      withSeed({
        id: "textpreset.v1",
        classId: "widgets.text_preset",
        docType: "text_preset",
        version: "1",
        title: "Text preset",
        description: "One text sample with family, size, color, stroke, and shadow.",
        sections: [{ slug: "card", title: "Card", required: true }],
        seedGalleryAspect: "1/1",
        agentStarter: proseStarter({
          title: "Text preset",
          focus: "Keep one text layer. Set family, size, color, stroke, and shadow."
        })
      }, seedTextPreset())
    ];
  }
  var PLATFORM_POSTS = platformPostTemplates();
  var PLATFORM_POST_TEMPLATE_IDS = PLATFORM_POSTS.map((t) => t.id);
  var STARTER = [
    ...PLATFORM_POSTS,
    withSeed({
      id: "website.v1",
      classId: "social.note",
      docType: "note",
      version: "1",
      title: "Website",
      description: "Home, About, and Contact pages with a nav bar (vertical swipe).",
      sections: [
        { slug: "home", title: "Home", required: true },
        { slug: "about", title: "About", required: true },
        { slug: "contact", title: "Contact", required: true }
      ],
      publishContentClass: "note",
      browseFeatured: true,
      seedPageSwipeAxis: "y",
      seedGalleryAspect: "9/16",
      agentStarter: proseStarter({
        title: "Website",
        focus: "Fill home, about, and contact. Keep the nav buttons on each page pointed at page:0, page:1, and page:2."
      })
    }, seedWebsiteDoc()),
    withSeed({
      id: "set.basic.v1",
      classId: "social.set",
      docType: "set",
      version: "1",
      title: "Set",
      description: "Multi-media refs \u2014 mix different templates/posts (not same-type multipage)",
      sections: [
        { slug: "primary", title: "Primary", required: true },
        { slug: "sources", title: "Sources", required: false }
      ],
      publishContentClass: "note",
      seedGalleryAspect: "9/16",
      agentStarter: proseStarter({
        title: "Set",
        focus: "Describe the primary item; list penEmbed source refs in sources when provided. Mix media types."
      })
    }, seedSetBasic()),
    ...widgetStarters(),
    withSeed({
      id: "table.basic.v1",
      classId: "primitives.table",
      docType: "table",
      version: "1",
      title: "Cloud Table",
      description: "Kit cloud grid reference object",
      sections: [{ slug: "grid", title: "Grid", required: true }],
      agentStarter: proseStarter({
        title: "Cloud Table",
        focus: "Do not invent TipTap tables for tallies \u2014 structured table.v1 rows only via tooling."
      })
    }, seedTablePrimitive()),
    withSeed({
      id: "register.basic.v1",
      classId: "records.register",
      docType: "register",
      version: "1",
      title: "Register",
      description: "Typed register rows (kit)",
      sections: [{ slug: "rows", title: "Rows", required: true }],
      registerColumns: DEFAULT_REGISTER_COLUMNS,
      agentStarter: registerStarter({
        title: "Register",
        columns: DEFAULT_REGISTER_COLUMNS
      })
    }, seedRegister()),
    withSeed({
      id: "asset_key.basic.v1",
      classId: "records.asset_key",
      docType: "asset_key",
      version: "1",
      title: "Asset Key",
      description: "Paid license receipt (kit) \u2014 asset ref, scope, price, ZKP",
      sections: [
        { slug: "grant", title: "Grant", required: true },
        { slug: "proof", title: "Proof", required: true }
      ],
      agentStarter: proseStarter({
        title: "Asset Key",
        focus: "Record asset id, scope, price, and license-key proof after purchase."
      })
    }, seedAssetKey())
  ];
  var byId = new Map(STARTER.map((t) => [t.id, t]));

  // ../pen-protocol/dist/classes.js
  var CLASSES = [
    {
      id: "social",
      title: "Social",
      description: "Notes, posts, collections, and sets for browse",
      kind: "authored",
      audience: "consumer"
    },
    {
      id: "social.note",
      title: "Notes",
      description: "Flow Notes for browse",
      kind: "authored",
      audience: "consumer",
      parentId: "social"
    },
    {
      id: "social.post",
      title: "Posts",
      description: "Caption and media posts",
      kind: "authored",
      audience: "consumer",
      parentId: "social"
    },
    {
      id: "social.collection",
      title: "Collections",
      description: "Same-type multipage workspace (swipe between pages)",
      kind: "authored",
      audience: "consumer",
      parentId: "social"
    },
    {
      id: "social.set",
      title: "Sets",
      description: "Multi-media assembly \u2014 refs to different templates/posts (not same-type multipage)",
      kind: "authored",
      audience: "consumer",
      parentId: "social"
    },
    {
      id: "social.profile",
      title: "Profile",
      description: "Introduce a person, a team member, or a business",
      kind: "authored",
      audience: "consumer",
      parentId: "social"
    },
    {
      id: "social.comparison",
      title: "Comparison",
      description: "Options side by side: plans, picks, specs, or results",
      kind: "authored",
      audience: "consumer",
      parentId: "social"
    },
    {
      id: "community",
      title: "Community",
      description: "Feeds, landing pages, community homes, and multipage sites",
      kind: "authored",
      audience: "kit"
    },
    {
      id: "community.feed",
      title: "Feeds",
      description: "Self-hosted and curated feed configs",
      kind: "authored",
      audience: "kit",
      parentId: "community",
      entitlement: "self-hosted"
    },
    {
      id: "community.feed_embed",
      title: "Feed embed",
      description: "Framed configurable stream chrome",
      kind: "authored",
      audience: "kit",
      parentId: "community"
    },
    {
      id: "community.landing",
      title: "Landing",
      description: "Arrival page \u2014 hero, value, CTA",
      kind: "authored",
      audience: "kit",
      parentId: "community"
    },
    {
      id: "community.home",
      title: "Community home",
      description: "Hub \u2014 banner, nav, feed_embed slot, announcements",
      kind: "authored",
      audience: "kit",
      parentId: "community"
    },
    {
      id: "community.site",
      title: "Site",
      description: "Multipage feed of pages (aggregator/compiler)",
      kind: "authored",
      audience: "kit",
      parentId: "community"
    },
    {
      id: "projects",
      title: "Projects",
      description: "Active work \u2014 journals, lists, letters, notes",
      kind: "authored",
      audience: "kit"
    },
    {
      id: "projects.journal",
      title: "Journal",
      description: "Dated entries and logs",
      kind: "authored",
      audience: "kit",
      parentId: "projects"
    },
    {
      id: "projects.list",
      title: "List",
      description: "Checklists, shopping, running lists",
      kind: "authored",
      audience: "kit",
      parentId: "projects"
    },
    {
      id: "projects.letter",
      title: "Letter",
      description: "Correspondence letter (DM delivery later)",
      kind: "authored",
      audience: "kit",
      parentId: "projects"
    },
    {
      id: "projects.note",
      title: "Note",
      description: "Short correspondence note (DM delivery later)",
      kind: "authored",
      audience: "kit",
      parentId: "projects"
    },
    {
      id: "library",
      title: "Library",
      description: "Durable published works (books, articles, music)",
      kind: "authored",
      audience: "kit"
    },
    {
      id: "library.book",
      title: "Book",
      description: "Multi-section longform",
      kind: "authored",
      audience: "kit",
      parentId: "library"
    },
    {
      id: "library.article",
      title: "Article",
      description: "Shorter durable article",
      kind: "authored",
      audience: "kit",
      parentId: "library"
    },
    {
      id: "library.music",
      title: "Music",
      description: "Track / audio asset with licensing",
      kind: "authored",
      audience: "kit",
      parentId: "library"
    },
    {
      id: "knowledge",
      title: "Knowledge",
      description: "Claims bound to standard data points + ZKP refs (never raw PII)",
      kind: "authored",
      audience: "kit"
    },
    {
      id: "knowledge.claim",
      title: "Claim",
      description: "Structured claim atom with optional geo proof attachments",
      kind: "authored",
      audience: "kit",
      parentId: "knowledge"
    },
    {
      id: "time",
      title: "Time",
      description: "Calendars, events, and schedules",
      kind: "authored",
      audience: "kit"
    },
    {
      id: "time.calendar",
      title: "Calendar",
      description: "Ongoing calendar",
      kind: "authored",
      audience: "kit",
      parentId: "time"
    },
    {
      id: "time.event",
      title: "Event",
      description: "Single dated occurrence",
      kind: "authored",
      audience: "kit",
      parentId: "time"
    },
    {
      id: "time.schedule",
      title: "Schedule",
      description: "Ordered agenda or run-of-show",
      kind: "authored",
      audience: "kit",
      parentId: "time"
    },
    {
      id: "custom",
      title: "Custom",
      description: "Freeform authored pages",
      kind: "authored",
      audience: "consumer"
    },
    {
      id: "custom.doc",
      title: "Document",
      description: "Blank freeform page",
      kind: "authored",
      audience: "consumer",
      parentId: "custom"
    },
    {
      id: "widgets",
      title: "Widgets",
      description: "Card-sized authored widgets that copy into a host document",
      kind: "authored",
      audience: "consumer"
    },
    {
      id: "widgets.widget",
      title: "Widget",
      description: "One editable card \u2014 layers copy into the host as a group",
      kind: "authored",
      audience: "consumer",
      parentId: "widgets"
    },
    {
      id: "widgets.sticker",
      title: "Sticker",
      description: "A widget with no button and no trigger",
      kind: "authored",
      audience: "consumer",
      parentId: "widgets"
    },
    {
      id: "widgets.animation",
      title: "Animation",
      description: "One layer whose motion is the preset",
      kind: "authored",
      audience: "consumer",
      parentId: "widgets"
    },
    {
      id: "widgets.transition",
      title: "Transition",
      description: "One clip-join preset",
      kind: "authored",
      audience: "consumer",
      parentId: "widgets"
    },
    {
      id: "widgets.text_preset",
      title: "Text preset",
      description: "One text sample \u2014 family, size, color, stroke, and shadow",
      kind: "authored",
      audience: "consumer",
      parentId: "widgets"
    },
    {
      id: "records",
      title: "Records",
      description: "Typed structured data for kit / agents",
      kind: "register",
      audience: "kit"
    },
    {
      id: "records.register",
      title: "Register",
      description: "Tabular register rows",
      kind: "register",
      audience: "kit",
      parentId: "records"
    },
    {
      id: "records.asset_key",
      title: "Asset key",
      description: "License-key receipt after paid unconditional purchase",
      kind: "dossier",
      audience: "kit",
      parentId: "records"
    },
    {
      id: "primitives",
      title: "Primitives",
      description: "Cloud reference objects (tables, \u2026) for templates to embed",
      kind: "register",
      audience: "kit"
    },
    {
      id: "primitives.table",
      title: "Table",
      description: "Structured cloud grid \u2014 poll tallies, comparison matrices",
      kind: "register",
      audience: "kit",
      parentId: "primitives"
    }
  ];
  var byId2 = new Map(CLASSES.map((c) => [c.id, c]));

  // ../pen-protocol/dist/chain.js
  var import_ml_dsa = __toESM(require_mlDsa(), 1);

  // ../pen-protocol/dist/googleFontFamilies.js
  var PEN_GOOGLE_FONTS_ALL = [
    "ABeeZee",
    "ADLaM Display",
    "AR One Sans",
    "Abel",
    "Abhaya Libre",
    "Aboreto",
    "Abril Fatface",
    "Abyssinica SIL",
    "Aclonica",
    "Acme",
    "Actor",
    "Adamina",
    "Advent Pro",
    "Agdasima",
    "Aguafina Script",
    "Akatab",
    "Akaya Kanadaka",
    "Akaya Telivigala",
    "Akronim",
    "Akshar",
    "Aladin",
    "Alata",
    "Alatsi",
    "Albert Sans",
    "Aldrich",
    "Alef",
    "Alegreya",
    "Alegreya SC",
    "Alegreya Sans",
    "Alegreya Sans SC",
    "Aleo",
    "Alex Brush",
    "Alexandria",
    "Alfa Slab One",
    "Alice",
    "Alike",
    "Alike Angular",
    "Alkalami",
    "Alkatra",
    "Allan",
    "Allerta",
    "Allerta Stencil",
    "Allison",
    "Allura",
    "Almarai",
    "Almendra",
    "Almendra Display",
    "Almendra SC",
    "Alumni Sans",
    "Alumni Sans Collegiate One",
    "Alumni Sans Inline One",
    "Alumni Sans Pinstripe",
    "Amarante",
    "Amaranth",
    "Amatic SC",
    "Amethysta",
    "Amiko",
    "Amiri",
    "Amiri Quran",
    "Amita",
    "Anaheim",
    "Andada Pro",
    "Andika",
    "Anek Bangla",
    "Anek Devanagari",
    "Anek Gujarati",
    "Anek Gurmukhi",
    "Anek Kannada",
    "Anek Latin",
    "Anek Malayalam",
    "Anek Odia",
    "Anek Tamil",
    "Anek Telugu",
    "Angkor",
    "Annie Use Your Telescope",
    "Anonymous Pro",
    "Antic",
    "Antic Didone",
    "Antic Slab",
    "Anton",
    "Antonio",
    "Anuphan",
    "Anybody",
    "Aoboshi One",
    "Arapey",
    "Arbutus",
    "Arbutus Slab",
    "Architects Daughter",
    "Archivo",
    "Archivo Black",
    "Archivo Narrow",
    "Are You Serious",
    "Aref Ruqaa",
    "Aref Ruqaa Ink",
    "Arima",
    "Arima Madurai",
    "Arimo",
    "Arizonia",
    "Armata",
    "Arsenal",
    "Artifika",
    "Arvo",
    "Arya",
    "Asap",
    "Asap Condensed",
    "Asar",
    "Asset",
    "Assistant",
    "Astloch",
    "Asul",
    "Athiti",
    "Atkinson Hyperlegible",
    "Atma",
    "Atomic Age",
    "Aubrey",
    "Audiowide",
    "Autour One",
    "Average",
    "Average Sans",
    "Averia Gruesa Libre",
    "Averia Libre",
    "Averia Sans Libre",
    "Averia Serif Libre",
    "Azeret Mono",
    "B612",
    "B612 Mono",
    "BIZ UDGothic",
    "BIZ UDMincho",
    "BIZ UDPGothic",
    "BIZ UDPMincho",
    "Babylonica",
    "Bacasime Antique",
    "Bad Script",
    "Bagel Fat One",
    "Bahiana",
    "Bahianita",
    "Bai Jamjuree",
    "Bakbak One",
    "Ballet",
    "Baloo 2",
    "Baloo Bhai 2",
    "Baloo Bhaijaan 2",
    "Baloo Bhaina 2",
    "Baloo Chettan 2",
    "Baloo Da 2",
    "Baloo Paaji 2",
    "Baloo Tamma 2",
    "Baloo Tammudu 2",
    "Baloo Thambi 2",
    "Balsamiq Sans",
    "Balthazar",
    "Bangers",
    "Barlow",
    "Barlow Condensed",
    "Barlow Semi Condensed",
    "Barriecito",
    "Barrio",
    "Basic",
    "Baskervville",
    "Battambang",
    "Baumans",
    "Bayon",
    "Be Vietnam Pro",
    "Beau Rivage",
    "Bebas Neue",
    "Belanosima",
    "Belgrano",
    "Bellefair",
    "Belleza",
    "Bellota",
    "Bellota Text",
    "BenchNine",
    "Benne",
    "Bentham",
    "Berkshire Swash",
    "Besley",
    "Beth Ellen",
    "Bevan",
    "BhuTuka Expanded One",
    "Big Shoulders Display",
    "Big Shoulders Inline Display",
    "Big Shoulders Inline Text",
    "Big Shoulders Stencil Display",
    "Big Shoulders Stencil Text",
    "Big Shoulders Text",
    "Bigelow Rules",
    "Bigshot One",
    "Bilbo",
    "Bilbo Swash Caps",
    "BioRhyme",
    "BioRhyme Expanded",
    "Birthstone",
    "Birthstone Bounce",
    "Biryani",
    "Bitter",
    "Black And White Picture",
    "Black Han Sans",
    "Black Ops One",
    "Blaka",
    "Blaka Hollow",
    "Blaka Ink",
    "Blinker",
    "Bodoni Moda",
    "Bokor",
    "Bona Nova",
    "Bonbon",
    "Bonheur Royale",
    "Boogaloo",
    "Borel",
    "Bowlby One",
    "Bowlby One SC",
    "Braah One",
    "Brawler",
    "Bree Serif",
    "Bricolage Grotesque",
    "Bruno Ace",
    "Bruno Ace SC",
    "Brygada 1918",
    "Bubblegum Sans",
    "Bubbler One",
    "Buda",
    "Buenard",
    "Bungee",
    "Bungee Hairline",
    "Bungee Inline",
    "Bungee Outline",
    "Bungee Shade",
    "Bungee Spice",
    "Butcherman",
    "Butterfly Kids",
    "Cabin",
    "Cabin Condensed",
    "Cabin Sketch",
    "Caesar Dressing",
    "Cagliostro",
    "Cairo",
    "Cairo Play",
    "Caladea",
    "Calistoga",
    "Calligraffitti",
    "Cambay",
    "Cambo",
    "Candal",
    "Cantarell",
    "Cantata One",
    "Cantora One",
    "Caprasimo",
    "Capriola",
    "Caramel",
    "Carattere",
    "Cardo",
    "Carlito",
    "Carme",
    "Carrois Gothic",
    "Carrois Gothic SC",
    "Carter One",
    "Castoro",
    "Castoro Titling",
    "Catamaran",
    "Caudex",
    "Caveat",
    "Caveat Brush",
    "Cedarville Cursive",
    "Ceviche One",
    "Chakra Petch",
    "Changa",
    "Changa One",
    "Chango",
    "Charis SIL",
    "Charm",
    "Charmonman",
    "Chathura",
    "Chau Philomene One",
    "Chela One",
    "Chelsea Market",
    "Chenla",
    "Cherish",
    "Cherry Bomb One",
    "Cherry Cream Soda",
    "Cherry Swash",
    "Chewy",
    "Chicle",
    "Chilanka",
    "Chivo",
    "Chivo Mono",
    "Chokokutai",
    "Chonburi",
    "Cinzel",
    "Cinzel Decorative",
    "Clicker Script",
    "Climate Crisis",
    "Coda",
    "Coda Caption",
    "Codystar",
    "Coiny",
    "Combo",
    "Comfortaa",
    "Comforter",
    "Comforter Brush",
    "Comic Neue",
    "Coming Soon",
    "Comme",
    "Commissioner",
    "Concert One",
    "Condiment",
    "Content",
    "Contrail One",
    "Convergence",
    "Cookie",
    "Copse",
    "Corben",
    "Corinthia",
    "Cormorant",
    "Cormorant Garamond",
    "Cormorant Infant",
    "Cormorant SC",
    "Cormorant Unicase",
    "Cormorant Upright",
    "Courgette",
    "Courier Prime",
    "Cousine",
    "Coustard",
    "Covered By Your Grace",
    "Crafty Girls",
    "Creepster",
    "Crete Round",
    "Crimson Pro",
    "Crimson Text",
    "Croissant One",
    "Crushed",
    "Cuprum",
    "Cute Font",
    "Cutive",
    "Cutive Mono",
    "DM Mono",
    "DM Sans",
    "DM Serif Display",
    "DM Serif Text",
    "Dai Banna SIL",
    "Damion",
    "Dancing Script",
    "Dangrek",
    "Darker Grotesque",
    "Darumadrop One",
    "David Libre",
    "Dawning of a New Day",
    "Days One",
    "Dekko",
    "Dela Gothic One",
    "Delicious Handrawn",
    "Delius",
    "Delius Swash Caps",
    "Delius Unicase",
    "Della Respira",
    "Denk One",
    "Devonshire",
    "Dhurjati",
    "Didact Gothic",
    "Diphylleia",
    "Diplomata",
    "Diplomata SC",
    "Do Hyeon",
    "Dokdo",
    "Domine",
    "Donegal One",
    "Dongle",
    "Doppio One",
    "Dorsa",
    "Dosis",
    "DotGothic16",
    "Dr Sugiyama",
    "Duru Sans",
    "DynaPuff",
    "Dynalight",
    "EB Garamond",
    "Eagle Lake",
    "East Sea Dokdo",
    "Eater",
    "Economica",
    "Eczar",
    "Edu NSW ACT Foundation",
    "Edu QLD Beginner",
    "Edu SA Beginner",
    "Edu TAS Beginner",
    "Edu VIC WA NT Beginner",
    "El Messiri",
    "Electrolize",
    "Elsie",
    "Elsie Swash Caps",
    "Emblema One",
    "Emilys Candy",
    "Encode Sans",
    "Encode Sans Condensed",
    "Encode Sans Expanded",
    "Encode Sans SC",
    "Encode Sans Semi Condensed",
    "Encode Sans Semi Expanded",
    "Engagement",
    "Englebert",
    "Enriqueta",
    "Ephesis",
    "Epilogue",
    "Erica One",
    "Esteban",
    "Estonia",
    "Euphoria Script",
    "Ewert",
    "Exo",
    "Exo 2",
    "Expletus Sans",
    "Explora",
    "Fahkwang",
    "Familjen Grotesk",
    "Fanwood Text",
    "Farro",
    "Farsan",
    "Fascinate",
    "Fascinate Inline",
    "Faster One",
    "Fasthand",
    "Fauna One",
    "Faustina",
    "Federant",
    "Federo",
    "Felipa",
    "Fenix",
    "Festive",
    "Figtree",
    "Finger Paint",
    "Finlandica",
    "Fira Code",
    "Fira Mono",
    "Fira Sans",
    "Fira Sans Condensed",
    "Fira Sans Extra Condensed",
    "Fjalla One",
    "Fjord One",
    "Flamenco",
    "Flavors",
    "Fleur De Leah",
    "Flow Block",
    "Flow Circular",
    "Flow Rounded",
    "Foldit",
    "Fondamento",
    "Fontdiner Swanky",
    "Forum",
    "Fragment Mono",
    "Francois One",
    "Frank Ruhl Libre",
    "Fraunces",
    "Freckle Face",
    "Fredericka the Great",
    "Fredoka",
    "Freehand",
    "Fresca",
    "Frijole",
    "Fruktur",
    "Fugaz One",
    "Fuggles",
    "Fuzzy Bubbles",
    "GFS Didot",
    "GFS Neohellenic",
    "Gabarito",
    "Gabriela",
    "Gaegu",
    "Gafata",
    "Gajraj One",
    "Galada",
    "Galdeano",
    "Galindo",
    "Gamja Flower",
    "Gantari",
    "Gasoek One",
    "Gayathri",
    "Gelasio",
    "Gemunu Libre",
    "Genos",
    "Gentium Book Plus",
    "Gentium Plus",
    "Geo",
    "Geologica",
    "Georama",
    "Geostar",
    "Geostar Fill",
    "Germania One",
    "Gideon Roman",
    "Gidugu",
    "Gilda Display",
    "Girassol",
    "Give You Glory",
    "Glass Antiqua",
    "Glegoo",
    "Gloock",
    "Gloria Hallelujah",
    "Glory",
    "Gluten",
    "Goblin One",
    "Gochi Hand",
    "Goldman",
    "Golos Text",
    "Gorditas",
    "Gothic A1",
    "Gotu",
    "Goudy Bookletter 1911",
    "Gowun Batang",
    "Gowun Dodum",
    "Graduate",
    "Grand Hotel",
    "Grandiflora One",
    "Grandstander",
    "Grape Nuts",
    "Gravitas One",
    "Great Vibes",
    "Grechen Fuemen",
    "Grenze",
    "Grenze Gotisch",
    "Grey Qo",
    "Griffy",
    "Gruppo",
    "Gudea",
    "Gugi",
    "Gulzar",
    "Gupter",
    "Gurajada",
    "Gwendolyn",
    "Habibi",
    "Hachi Maru Pop",
    "Hahmlet",
    "Halant",
    "Hammersmith One",
    "Hanalei",
    "Hanalei Fill",
    "Handjet",
    "Handlee",
    "Hanken Grotesk",
    "Hanuman",
    "Happy Monkey",
    "Harmattan",
    "Headland One",
    "Heebo",
    "Henny Penny",
    "Hepta Slab",
    "Herr Von Muellerhoff",
    "Hi Melody",
    "Hina Mincho",
    "Hind",
    "Hind Guntur",
    "Hind Madurai",
    "Hind Siliguri",
    "Hind Vadodara",
    "Holtwood One SC",
    "Homemade Apple",
    "Homenaje",
    "Hubballi",
    "Hurricane",
    "IBM Plex Mono",
    "IBM Plex Sans",
    "IBM Plex Sans Arabic",
    "IBM Plex Sans Condensed",
    "IBM Plex Sans Devanagari",
    "IBM Plex Sans Hebrew",
    "IBM Plex Sans JP",
    "IBM Plex Sans KR",
    "IBM Plex Sans Thai",
    "IBM Plex Sans Thai Looped",
    "IBM Plex Serif",
    "IM Fell DW Pica",
    "IM Fell DW Pica SC",
    "IM Fell Double Pica",
    "IM Fell Double Pica SC",
    "IM Fell English",
    "IM Fell English SC",
    "IM Fell French Canon",
    "IM Fell French Canon SC",
    "IM Fell Great Primer",
    "IM Fell Great Primer SC",
    "Ibarra Real Nova",
    "Iceberg",
    "Iceland",
    "Imbue",
    "Imperial Script",
    "Imprima",
    "Inclusive Sans",
    "Inconsolata",
    "Inder",
    "Indie Flower",
    "Ingrid Darling",
    "Inika",
    "Inknut Antiqua",
    "Inria Sans",
    "Inria Serif",
    "Inspiration",
    "Instrument Sans",
    "Instrument Serif",
    "Inter",
    "Inter Tight",
    "Irish Grover",
    "Island Moments",
    "Istok Web",
    "Italiana",
    "Italianno",
    "Itim",
    "Jacques Francois",
    "Jacques Francois Shadow",
    "Jaldi",
    "JetBrains Mono",
    "Jim Nightshade",
    "Joan",
    "Jockey One",
    "Jolly Lodger",
    "Jomhuria",
    "Jomolhari",
    "Josefin Sans",
    "Josefin Slab",
    "Jost",
    "Joti One",
    "Jua",
    "Judson",
    "Julee",
    "Julius Sans One",
    "Junge",
    "Jura",
    "Just Another Hand",
    "Just Me Again Down Here",
    "K2D",
    "Kablammo",
    "Kadwa",
    "Kaisei Decol",
    "Kaisei HarunoUmi",
    "Kaisei Opti",
    "Kaisei Tokumin",
    "Kalam",
    "Kameron",
    "Kanit",
    "Kantumruy Pro",
    "Karantina",
    "Karla",
    "Karma",
    "Katibeh",
    "Kaushan Script",
    "Kavivanar",
    "Kavoon",
    "Kdam Thmor Pro",
    "Keania One",
    "Kelly Slab",
    "Kenia",
    "Khand",
    "Khmer",
    "Khula",
    "Kings",
    "Kirang Haerang",
    "Kite One",
    "Kiwi Maru",
    "Klee One",
    "Knewave",
    "KoHo",
    "Kodchasan",
    "Koh Santepheap",
    "Kolker Brush",
    "Konkhmer Sleokchher",
    "Kosugi",
    "Kosugi Maru",
    "Kotta One",
    "Koulen",
    "Kranky",
    "Kreon",
    "Kristi",
    "Krona One",
    "Krub",
    "Kufam",
    "Kulim Park",
    "Kumar One",
    "Kumar One Outline",
    "Kumbh Sans",
    "Kurale",
    "La Belle Aurore",
    "Labrada",
    "Lacquer",
    "Laila",
    "Lakki Reddy",
    "Lalezar",
    "Lancelot",
    "Langar",
    "Lateef",
    "Lato",
    "Lavishly Yours",
    "League Gothic",
    "League Script",
    "League Spartan",
    "Leckerli One",
    "Ledger",
    "Lekton",
    "Lemon",
    "Lemonada",
    "Lexend",
    "Lexend Deca",
    "Lexend Exa",
    "Lexend Giga",
    "Lexend Mega",
    "Lexend Peta",
    "Lexend Tera",
    "Lexend Zetta",
    "Libre Barcode 128",
    "Libre Barcode 128 Text",
    "Libre Barcode 39",
    "Libre Barcode 39 Extended",
    "Libre Barcode 39 Extended Text",
    "Libre Barcode 39 Text",
    "Libre Barcode EAN13 Text",
    "Libre Baskerville",
    "Libre Bodoni",
    "Libre Caslon Display",
    "Libre Caslon Text",
    "Libre Franklin",
    "Licorice",
    "Life Savers",
    "Lilita One",
    "Lily Script One",
    "Limelight",
    "Linden Hill",
    "Lisu Bosa",
    "Literata",
    "Liu Jian Mao Cao",
    "Livvic",
    "Lobster",
    "Lobster Two",
    "Londrina Outline",
    "Londrina Shadow",
    "Londrina Sketch",
    "Londrina Solid",
    "Long Cang",
    "Lora",
    "Love Light",
    "Love Ya Like A Sister",
    "Loved by the King",
    "Lovers Quarrel",
    "Luckiest Guy",
    "Lugrasimo",
    "Lumanosimo",
    "Lunasima",
    "Lusitana",
    "Lustria",
    "Luxurious Roman",
    "Luxurious Script",
    "M PLUS 1",
    "M PLUS 1 Code",
    "M PLUS 1p",
    "M PLUS 2",
    "M PLUS Code Latin",
    "M PLUS Rounded 1c",
    "Ma Shan Zheng",
    "Macondo",
    "Macondo Swash Caps",
    "Mada",
    "Magra",
    "Maiden Orange",
    "Maitree",
    "Major Mono Display",
    "Mako",
    "Mali",
    "Mallanna",
    "Mandali",
    "Manjari",
    "Manrope",
    "Mansalva",
    "Manuale",
    "Marcellus",
    "Marcellus SC",
    "Marck Script",
    "Margarine",
    "Marhey",
    "Markazi Text",
    "Marko One",
    "Marmelad",
    "Martel",
    "Martel Sans",
    "Martian Mono",
    "Marvel",
    "Mate",
    "Mate SC",
    "Material Icons",
    "Material Icons Outlined",
    "Material Icons Round",
    "Material Icons Sharp",
    "Material Icons Two Tone",
    "Material Symbols Outlined",
    "Material Symbols Rounded",
    "Material Symbols Sharp",
    "Maven Pro",
    "McLaren",
    "Mea Culpa",
    "Meddon",
    "MedievalSharp",
    "Medula One",
    "Meera Inimai",
    "Megrim",
    "Meie Script",
    "Meow Script",
    "Merienda",
    "Merriweather",
    "Merriweather Sans",
    "Metal",
    "Metal Mania",
    "Metamorphous",
    "Metrophobic",
    "Michroma",
    "Milonga",
    "Miltonian",
    "Miltonian Tattoo",
    "Mina",
    "Mingzat",
    "Miniver",
    "Miriam Libre",
    "Mirza",
    "Miss Fajardose",
    "Mitr",
    "Mochiy Pop One",
    "Mochiy Pop P One",
    "Modak",
    "Modern Antiqua",
    "Mogra",
    "Mohave",
    "Moirai One",
    "Molengo",
    "Molle",
    "Monda",
    "Monofett",
    "Monomaniac One",
    "Monoton",
    "Monsieur La Doulaise",
    "Montaga",
    "Montagu Slab",
    "MonteCarlo",
    "Montez",
    "Montserrat",
    "Montserrat Alternates",
    "Montserrat Subrayada",
    "Moo Lah Lah",
    "Mooli",
    "Moon Dance",
    "Moul",
    "Moulpali",
    "Mountains of Christmas",
    "Mouse Memoirs",
    "Mr Bedfort",
    "Mr Dafoe",
    "Mr De Haviland",
    "Mrs Saint Delafield",
    "Mrs Sheppards",
    "Ms Madi",
    "Mukta",
    "Mukta Mahee",
    "Mukta Malar",
    "Mukta Vaani",
    "Mulish",
    "Murecho",
    "MuseoModerno",
    "My Soul",
    "Mynerve",
    "Mystery Quest",
    "NTR",
    "Nabla",
    "Nanum Brush Script",
    "Nanum Gothic",
    "Nanum Gothic Coding",
    "Nanum Myeongjo",
    "Nanum Pen Script",
    "Narnoor",
    "Neonderthaw",
    "Nerko One",
    "Neucha",
    "Neuton",
    "New Rocker",
    "New Tegomin",
    "News Cycle",
    "Newsreader",
    "Niconne",
    "Niramit",
    "Nixie One",
    "Nobile",
    "Nokora",
    "Norican",
    "Nosifer",
    "Notable",
    "Nothing You Could Do",
    "Noticia Text",
    "Noto Color Emoji",
    "Noto Emoji",
    "Noto Kufi Arabic",
    "Noto Music",
    "Noto Naskh Arabic",
    "Noto Nastaliq Urdu",
    "Noto Rashi Hebrew",
    "Noto Sans",
    "Noto Sans Adlam",
    "Noto Sans Adlam Unjoined",
    "Noto Sans Anatolian Hieroglyphs",
    "Noto Sans Arabic",
    "Noto Sans Armenian",
    "Noto Sans Avestan",
    "Noto Sans Balinese",
    "Noto Sans Bamum",
    "Noto Sans Bassa Vah",
    "Noto Sans Batak",
    "Noto Sans Bengali",
    "Noto Sans Bhaiksuki",
    "Noto Sans Brahmi",
    "Noto Sans Buginese",
    "Noto Sans Buhid",
    "Noto Sans Canadian Aboriginal",
    "Noto Sans Carian",
    "Noto Sans Caucasian Albanian",
    "Noto Sans Chakma",
    "Noto Sans Cham",
    "Noto Sans Cherokee",
    "Noto Sans Chorasmian",
    "Noto Sans Coptic",
    "Noto Sans Cuneiform",
    "Noto Sans Cypriot",
    "Noto Sans Cypro Minoan",
    "Noto Sans Deseret",
    "Noto Sans Devanagari",
    "Noto Sans Display",
    "Noto Sans Duployan",
    "Noto Sans Egyptian Hieroglyphs",
    "Noto Sans Elbasan",
    "Noto Sans Elymaic",
    "Noto Sans Ethiopic",
    "Noto Sans Georgian",
    "Noto Sans Glagolitic",
    "Noto Sans Gothic",
    "Noto Sans Grantha",
    "Noto Sans Gujarati",
    "Noto Sans Gunjala Gondi",
    "Noto Sans Gurmukhi",
    "Noto Sans HK",
    "Noto Sans Hanifi Rohingya",
    "Noto Sans Hanunoo",
    "Noto Sans Hatran",
    "Noto Sans Hebrew",
    "Noto Sans Imperial Aramaic",
    "Noto Sans Indic Siyaq Numbers",
    "Noto Sans Inscriptional Pahlavi",
    "Noto Sans Inscriptional Parthian",
    "Noto Sans JP",
    "Noto Sans Javanese",
    "Noto Sans KR",
    "Noto Sans Kaithi",
    "Noto Sans Kannada",
    "Noto Sans Kayah Li",
    "Noto Sans Kharoshthi",
    "Noto Sans Khmer",
    "Noto Sans Khojki",
    "Noto Sans Khudawadi",
    "Noto Sans Lao",
    "Noto Sans Lao Looped",
    "Noto Sans Lepcha",
    "Noto Sans Limbu",
    "Noto Sans Linear A",
    "Noto Sans Linear B",
    "Noto Sans Lisu",
    "Noto Sans Lycian",
    "Noto Sans Lydian",
    "Noto Sans Mahajani",
    "Noto Sans Malayalam",
    "Noto Sans Mandaic",
    "Noto Sans Manichaean",
    "Noto Sans Marchen",
    "Noto Sans Masaram Gondi",
    "Noto Sans Math",
    "Noto Sans Mayan Numerals",
    "Noto Sans Medefaidrin",
    "Noto Sans Meetei Mayek",
    "Noto Sans Mende Kikakui",
    "Noto Sans Meroitic",
    "Noto Sans Miao",
    "Noto Sans Modi",
    "Noto Sans Mongolian",
    "Noto Sans Mono",
    "Noto Sans Mro",
    "Noto Sans Multani",
    "Noto Sans Myanmar",
    "Noto Sans NKo",
    "Noto Sans NKo Unjoined",
    "Noto Sans Nabataean",
    "Noto Sans Nag Mundari",
    "Noto Sans Nandinagari",
    "Noto Sans New Tai Lue",
    "Noto Sans Newa",
    "Noto Sans Nushu",
    "Noto Sans Ogham",
    "Noto Sans Ol Chiki",
    "Noto Sans Old Hungarian",
    "Noto Sans Old Italic",
    "Noto Sans Old North Arabian",
    "Noto Sans Old Permic",
    "Noto Sans Old Persian",
    "Noto Sans Old Sogdian",
    "Noto Sans Old South Arabian",
    "Noto Sans Old Turkic",
    "Noto Sans Oriya",
    "Noto Sans Osage",
    "Noto Sans Osmanya",
    "Noto Sans Pahawh Hmong",
    "Noto Sans Palmyrene",
    "Noto Sans Pau Cin Hau",
    "Noto Sans Phags Pa",
    "Noto Sans Phoenician",
    "Noto Sans Psalter Pahlavi",
    "Noto Sans Rejang",
    "Noto Sans Runic",
    "Noto Sans SC",
    "Noto Sans Samaritan",
    "Noto Sans Saurashtra",
    "Noto Sans Sharada",
    "Noto Sans Shavian",
    "Noto Sans Siddham",
    "Noto Sans SignWriting",
    "Noto Sans Sinhala",
    "Noto Sans Sogdian",
    "Noto Sans Sora Sompeng",
    "Noto Sans Soyombo",
    "Noto Sans Sundanese",
    "Noto Sans Syloti Nagri",
    "Noto Sans Symbols",
    "Noto Sans Symbols 2",
    "Noto Sans Syriac",
    "Noto Sans Syriac Eastern",
    "Noto Sans TC",
    "Noto Sans Tagalog",
    "Noto Sans Tagbanwa",
    "Noto Sans Tai Le",
    "Noto Sans Tai Tham",
    "Noto Sans Tai Viet",
    "Noto Sans Takri",
    "Noto Sans Tamil",
    "Noto Sans Tamil Supplement",
    "Noto Sans Tangsa",
    "Noto Sans Telugu",
    "Noto Sans Thaana",
    "Noto Sans Thai",
    "Noto Sans Thai Looped",
    "Noto Sans Tifinagh",
    "Noto Sans Tirhuta",
    "Noto Sans Ugaritic",
    "Noto Sans Vai",
    "Noto Sans Vithkuqi",
    "Noto Sans Wancho",
    "Noto Sans Warang Citi",
    "Noto Sans Yi",
    "Noto Sans Zanabazar Square",
    "Noto Serif",
    "Noto Serif Ahom",
    "Noto Serif Armenian",
    "Noto Serif Balinese",
    "Noto Serif Bengali",
    "Noto Serif Devanagari",
    "Noto Serif Display",
    "Noto Serif Dogra",
    "Noto Serif Ethiopic",
    "Noto Serif Georgian",
    "Noto Serif Grantha",
    "Noto Serif Gujarati",
    "Noto Serif Gurmukhi",
    "Noto Serif HK",
    "Noto Serif Hebrew",
    "Noto Serif JP",
    "Noto Serif KR",
    "Noto Serif Kannada",
    "Noto Serif Khitan Small Script",
    "Noto Serif Khmer",
    "Noto Serif Khojki",
    "Noto Serif Lao",
    "Noto Serif Makasar",
    "Noto Serif Malayalam",
    "Noto Serif Myanmar",
    "Noto Serif NP Hmong",
    "Noto Serif Oriya",
    "Noto Serif Ottoman Siyaq",
    "Noto Serif SC",
    "Noto Serif Sinhala",
    "Noto Serif TC",
    "Noto Serif Tamil",
    "Noto Serif Tangut",
    "Noto Serif Telugu",
    "Noto Serif Thai",
    "Noto Serif Tibetan",
    "Noto Serif Toto",
    "Noto Serif Vithkuqi",
    "Noto Serif Yezidi",
    "Noto Traditional Nushu",
    "Nova Cut",
    "Nova Flat",
    "Nova Mono",
    "Nova Oval",
    "Nova Round",
    "Nova Script",
    "Nova Slim",
    "Nova Square",
    "Numans",
    "Nunito",
    "Nunito Sans",
    "Nuosu SIL",
    "Odibee Sans",
    "Odor Mean Chey",
    "Offside",
    "Oi",
    "Old Standard TT",
    "Oldenburg",
    "Ole",
    "Oleo Script",
    "Oleo Script Swash Caps",
    "Onest",
    "Oooh Baby",
    "Open Sans",
    "Oranienbaum",
    "Orbit",
    "Orbitron",
    "Oregano",
    "Orelega One",
    "Orienta",
    "Original Surfer",
    "Oswald",
    "Outfit",
    "Over the Rainbow",
    "Overlock",
    "Overlock SC",
    "Overpass",
    "Overpass Mono",
    "Ovo",
    "Oxanium",
    "Oxygen",
    "Oxygen Mono",
    "PT Mono",
    "PT Sans",
    "PT Sans Caption",
    "PT Sans Narrow",
    "PT Serif",
    "PT Serif Caption",
    "Pacifico",
    "Padauk",
    "Padyakke Expanded One",
    "Palanquin",
    "Palanquin Dark",
    "Palette Mosaic",
    "Pangolin",
    "Paprika",
    "Parisienne",
    "Passero One",
    "Passion One",
    "Passions Conflict",
    "Pathway Extreme",
    "Pathway Gothic One",
    "Patrick Hand",
    "Patrick Hand SC",
    "Pattaya",
    "Patua One",
    "Pavanam",
    "Paytone One",
    "Peddana",
    "Peralta",
    "Permanent Marker",
    "Petemoss",
    "Petit Formal Script",
    "Petrona",
    "Philosopher",
    "Phudu",
    "Piazzolla",
    "Piedra",
    "Pinyon Script",
    "Pirata One",
    "Pixelify Sans",
    "Plaster",
    "Play",
    "Playball",
    "Playfair",
    "Playfair Display",
    "Playfair Display SC",
    "Playpen Sans",
    "Plus Jakarta Sans",
    "Podkova",
    "Poiret One",
    "Poller One",
    "Poltawski Nowy",
    "Poly",
    "Pompiere",
    "Pontano Sans",
    "Poor Story",
    "Poppins",
    "Port Lligat Sans",
    "Port Lligat Slab",
    "Potta One",
    "Pragati Narrow",
    "Praise",
    "Prata",
    "Preahvihear",
    "Press Start 2P",
    "Pridi",
    "Princess Sofia",
    "Prociono",
    "Prompt",
    "Prosto One",
    "Proza Libre",
    "Public Sans",
    "Puppies Play",
    "Puritan",
    "Purple Purse",
    "Qahiri",
    "Quando",
    "Quantico",
    "Quattrocento",
    "Quattrocento Sans",
    "Questrial",
    "Quicksand",
    "Quintessential",
    "Qwigley",
    "Qwitcher Grypen",
    "REM",
    "Racing Sans One",
    "Radio Canada",
    "Radley",
    "Rajdhani",
    "Rakkas",
    "Raleway",
    "Raleway Dots",
    "Ramabhadra",
    "Ramaraja",
    "Rambla",
    "Rammetto One",
    "Rampart One",
    "Ranchers",
    "Rancho",
    "Ranga",
    "Rasa",
    "Rationale",
    "Ravi Prakash",
    "Readex Pro",
    "Recursive",
    "Red Hat Display",
    "Red Hat Mono",
    "Red Hat Text",
    "Red Rose",
    "Redacted",
    "Redacted Script",
    "Redressed",
    "Reem Kufi",
    "Reem Kufi Fun",
    "Reem Kufi Ink",
    "Reenie Beanie",
    "Reggae One",
    "Revalia",
    "Rhodium Libre",
    "Ribeye",
    "Ribeye Marrow",
    "Righteous",
    "Risque",
    "Road Rage",
    "Roboto",
    "Roboto Condensed",
    "Roboto Flex",
    "Roboto Mono",
    "Roboto Serif",
    "Roboto Slab",
    "Rochester",
    "Rock 3D",
    "Rock Salt",
    "RocknRoll One",
    "Rokkitt",
    "Romanesco",
    "Ropa Sans",
    "Rosario",
    "Rosarivo",
    "Rouge Script",
    "Rowdies",
    "Rozha One",
    "Rubik",
    "Rubik 80s Fade",
    "Rubik Beastly",
    "Rubik Bubbles",
    "Rubik Burned",
    "Rubik Dirt",
    "Rubik Distressed",
    "Rubik Gemstones",
    "Rubik Glitch",
    "Rubik Iso",
    "Rubik Marker Hatch",
    "Rubik Maze",
    "Rubik Microbe",
    "Rubik Mono One",
    "Rubik Moonrocks",
    "Rubik Pixels",
    "Rubik Puddles",
    "Rubik Spray Paint",
    "Rubik Storm",
    "Rubik Vinyl",
    "Rubik Wet Paint",
    "Ruda",
    "Rufina",
    "Ruge Boogie",
    "Ruluko",
    "Rum Raisin",
    "Ruslan Display",
    "Russo One",
    "Ruthie",
    "Ruwudu",
    "Rye",
    "STIX Two Text",
    "Sacramento",
    "Sahitya",
    "Sail",
    "Saira",
    "Saira Condensed",
    "Saira Extra Condensed",
    "Saira Semi Condensed",
    "Saira Stencil One",
    "Salsa",
    "Sanchez",
    "Sancreek",
    "Sansita",
    "Sansita Swashed",
    "Sarabun",
    "Sarala",
    "Sarina",
    "Sarpanch",
    "Sassy Frass",
    "Satisfy",
    "Sawarabi Gothic",
    "Sawarabi Mincho",
    "Scada",
    "Scheherazade New",
    "Schibsted Grotesk",
    "Schoolbell",
    "Scope One",
    "Seaweed Script",
    "Secular One",
    "Sedgwick Ave",
    "Sedgwick Ave Display",
    "Sen",
    "Send Flowers",
    "Sevillana",
    "Seymour One",
    "Shadows Into Light",
    "Shadows Into Light Two",
    "Shalimar",
    "Shantell Sans",
    "Shanti",
    "Share",
    "Share Tech",
    "Share Tech Mono",
    "Shippori Antique",
    "Shippori Antique B1",
    "Shippori Mincho",
    "Shippori Mincho B1",
    "Shizuru",
    "Shojumaru",
    "Short Stack",
    "Shrikhand",
    "Siemreap",
    "Sigmar",
    "Sigmar One",
    "Signika",
    "Signika Negative",
    "Silkscreen",
    "Simonetta",
    "Single Day",
    "Sintony",
    "Sirin Stencil",
    "Six Caps",
    "Skranji",
    "Slabo 13px",
    "Slabo 27px",
    "Slackey",
    "Slackside One",
    "Smokum",
    "Smooch",
    "Smooch Sans",
    "Smythe",
    "Sniglet",
    "Snippet",
    "Snowburst One",
    "Sofadi One",
    "Sofia",
    "Sofia Sans",
    "Sofia Sans Condensed",
    "Sofia Sans Extra Condensed",
    "Sofia Sans Semi Condensed",
    "Solitreo",
    "Solway",
    "Sometype Mono",
    "Song Myung",
    "Sono",
    "Sonsie One",
    "Sora",
    "Sorts Mill Goudy",
    "Source Code Pro",
    "Source Sans 3",
    "Source Serif 4",
    "Space Grotesk",
    "Space Mono",
    "Special Elite",
    "Spectral",
    "Spectral SC",
    "Spicy Rice",
    "Spinnaker",
    "Spirax",
    "Splash",
    "Spline Sans",
    "Spline Sans Mono",
    "Squada One",
    "Square Peg",
    "Sree Krushnadevaraya",
    "Sriracha",
    "Srisakdi",
    "Staatliches",
    "Stalemate",
    "Stalinist One",
    "Stardos Stencil",
    "Stick",
    "Stick No Bills",
    "Stint Ultra Condensed",
    "Stint Ultra Expanded",
    "Stoke",
    "Strait",
    "Style Script",
    "Stylish",
    "Sue Ellen Francisco",
    "Suez One",
    "Sulphur Point",
    "Sumana",
    "Sunflower",
    "Sunshiney",
    "Supermercado One",
    "Sura",
    "Suranna",
    "Suravaram",
    "Suwannaphum",
    "Swanky and Moo Moo",
    "Syncopate",
    "Syne",
    "Syne Mono",
    "Syne Tactile",
    "Tai Heritage Pro",
    "Tajawal",
    "Tangerine",
    "Tapestry",
    "Taprom",
    "Tauri",
    "Taviraj",
    "Teko",
    "Tektur",
    "Telex",
    "Tenali Ramakrishna",
    "Tenor Sans",
    "Text Me One",
    "Texturina",
    "Thasadith",
    "The Girl Next Door",
    "The Nautigal",
    "Tienne",
    "Tillana",
    "Tilt Neon",
    "Tilt Prism",
    "Tilt Warp",
    "Timmana",
    "Tinos",
    "Tiro Bangla",
    "Tiro Devanagari Hindi",
    "Tiro Devanagari Marathi",
    "Tiro Devanagari Sanskrit",
    "Tiro Gurmukhi",
    "Tiro Kannada",
    "Tiro Tamil",
    "Tiro Telugu",
    "Titan One",
    "Titillium Web",
    "Tomorrow",
    "Tourney",
    "Trade Winds",
    "Train One",
    "Trirong",
    "Trispace",
    "Trocchi",
    "Trochut",
    "Truculenta",
    "Trykker",
    "Tsukimi Rounded",
    "Tulpen One",
    "Turret Road",
    "Twinkle Star",
    "Ubuntu",
    "Ubuntu Condensed",
    "Ubuntu Mono",
    "Uchen",
    "Ultra",
    "Unbounded",
    "Uncial Antiqua",
    "Underdog",
    "Unica One",
    "UnifrakturCook",
    "UnifrakturMaguntia",
    "Unkempt",
    "Unlock",
    "Unna",
    "Updock",
    "Urbanist",
    "VT323",
    "Vampiro One",
    "Varela",
    "Varela Round",
    "Varta",
    "Vast Shadow",
    "Vazirmatn",
    "Vesper Libre",
    "Viaoda Libre",
    "Vibes",
    "Vibur",
    "Victor Mono",
    "Vidaloka",
    "Viga",
    "Vina Sans",
    "Voces",
    "Volkhov",
    "Vollkorn",
    "Vollkorn SC",
    "Voltaire",
    "Vujahday Script",
    "Waiting for the Sunrise",
    "Wallpoet",
    "Walter Turncoat",
    "Warnes",
    "Water Brush",
    "Waterfall",
    "Wavefont",
    "Wellfleet",
    "Wendy One",
    "Whisper",
    "WindSong",
    "Wire One",
    "Wix Madefor Display",
    "Wix Madefor Text",
    "Work Sans",
    "Xanh Mono",
    "Yaldevi",
    "Yanone Kaffeesatz",
    "Yantramanav",
    "Yatra One",
    "Yellowtail",
    "Yeon Sung",
    "Yeseva One",
    "Yesteryear",
    "Yomogi",
    "Young Serif",
    "Yrsa",
    "Ysabeau",
    "Ysabeau Infant",
    "Ysabeau Office",
    "Ysabeau SC",
    "Yuji Boku",
    "Yuji Hentaigana Akari",
    "Yuji Hentaigana Akebono",
    "Yuji Mai",
    "Yuji Syuku",
    "Yusei Magic",
    "ZCOOL KuaiLe",
    "ZCOOL QingKe HuangYou",
    "ZCOOL XiaoWei",
    "Zen Antique",
    "Zen Antique Soft",
    "Zen Dots",
    "Zen Kaku Gothic Antique",
    "Zen Kaku Gothic New",
    "Zen Kurenaido",
    "Zen Loop",
    "Zen Maru Gothic",
    "Zen Old Mincho",
    "Zen Tokyo Zoo",
    "Zeyada",
    "Zhi Mang Xing",
    "Zilla Slab",
    "Zilla Slab Highlight"
  ];

  // ../pen-protocol/dist/fonts.js
  var PEN_SYSTEM_FONTS = [
    "Arial",
    "Helvetica",
    "Georgia",
    "Times New Roman",
    "Courier New",
    "Verdana",
    "Impact",
    "Comic Sans MS",
    "Trebuchet MS"
  ];
  var PEN_GOOGLE_FONTS_FEATURED = [
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Playfair Display",
    "Source Serif 4",
    "Merriweather"
  ];
  var PEN_FONT_FAMILIES = [
    ...PEN_SYSTEM_FONTS,
    ...PEN_GOOGLE_FONTS_FEATURED
  ];
  var SYSTEM_SET = new Set(PEN_SYSTEM_FONTS);
  var GOOGLE_FEATURED_SET = new Set(PEN_GOOGLE_FONTS_FEATURED);
  var GOOGLE_ALL_SET = new Set(PEN_GOOGLE_FONTS_ALL);

  // ../pen-protocol/dist/agentDraft.js
  var PEN_AGENT_DRAFT_TTL_HOURS = 7 * 24;
  var PEN_AGENT_DRAFT_MAX_BYTES = 256 * 1024;

  // ../device-cloud-credentials/dist/deviceMetadataSheetCatalog.js
  var FILE_INDEX_HEADER = {
    range: "Files!A1:E1",
    values: [
      ["File ID", "Google Drive File ID", "Visibility", "Uploaded At", "Entry Data (JSON)"]
    ]
  };
  function indexFilesSpec(driveFileName) {
    return {
      driveFileName,
      propertiesTitle: driveFileName,
      sheets: [{ title: "Files", rowCount: 1e5, columnCount: 6 }],
      headers: [FILE_INDEX_HEADER]
    };
  }
  var METADATA_SPECS = {
    connections: {
      driveFileName: "connections.xlsx",
      propertiesTitle: "connections.xlsx",
      sheets: [
        { title: "Connections", rowCount: 1e5, columnCount: 6 },
        { title: "Blocked", rowCount: 1e4, columnCount: 1 },
        { title: "Metadata", rowCount: 10, columnCount: 2 }
      ],
      headers: [
        {
          range: "Connections!A1:G1",
          values: [
            [
              "Connection ID",
              "User DID",
              "Status",
              "Created At",
              "Accepted At",
              "Peer ML-KEM Public Key",
              "KEM Ciphertext"
            ]
          ]
        },
        { range: "Blocked!A1:A1", values: [["Blocked DID"]] },
        { range: "Metadata!A1:B2", values: [["Identifier", ""], ["UpdatedAt", ""]] }
      ]
    },
    followers: {
      driveFileName: "followers.xlsx",
      propertiesTitle: "followers.xlsx",
      sheets: [{ title: "Followers", rowCount: 1e5, columnCount: 3 }],
      headers: [
        { range: "Followers!A1:C1", values: [["Follower DID", "Followed At", "Feed ID"]] }
      ]
    },
    following: {
      driveFileName: "following.xlsx",
      propertiesTitle: "following.xlsx",
      sheets: [{ title: "Following", rowCount: 1e5, columnCount: 3 }],
      headers: [
        { range: "Following!A1:C1", values: [["Target Type", "Target ID", "Followed At"]] }
      ]
    },
    "third-party-permissions": {
      driveFileName: "third-party-permissions.xlsx",
      propertiesTitle: "third-party-permissions.xlsx",
      sheets: [{ title: "Permissions", rowCount: 1e4, columnCount: 15 }],
      headers: [
        {
          range: "Permissions!A1:O1",
          values: [
            [
              "Tool ID",
              "Tool Name",
              "Tool Description",
              "Permissions (JSON)",
              "Data Points (JSON)",
              "Required Data Points (JSON)",
              "Optional Data Points (JSON)",
              "Granted At",
              "Expires At",
              "Status",
              "Created At",
              "Updated At",
              "Integrator Folder ID",
              "Data Point Levels (JSON)",
              "Permission Manifest (JSON)"
            ]
          ]
        }
      ]
    },
    devices: {
      driveFileName: "devices.xlsx",
      propertiesTitle: "devices.xlsx",
      sheets: [{ title: "Devices", rowCount: 50, columnCount: 11 }],
      headers: [
        {
          range: "Devices!A1:J1",
          values: [
            [
              "deviceId",
              "devicePublicKey",
              "label",
              "deviceType",
              "keyType",
              "status",
              "isPrimary",
              "createdAt",
              "lastSeenAt",
              "privateDisplay"
            ]
          ]
        }
      ]
    },
    groups: {
      driveFileName: "groups.xlsx",
      propertiesTitle: "groups.xlsx",
      sheets: [{ title: "Groups", rowCount: 1e4, columnCount: 8 }],
      headers: [
        {
          range: "Groups!A1:H1",
          values: [
            [
              "groupId",
              "ownerPnIdentifier",
              "title",
              "createdAt",
              "memberPnIdentifier",
              "accessRole",
              "wrappedChatKey",
              "conversationSpreadsheetId"
            ]
          ]
        }
      ]
    },
    notifications: {
      driveFileName: "notifications.xlsx",
      propertiesTitle: "notifications.xlsx",
      sheets: [{ title: "Notifications", rowCount: 1e5, columnCount: 8 }],
      headers: [
        {
          range: "Notifications!A1:H1",
          values: [
            ["Notification ID", "User DID", "Type", "Title", "Message", "Data", "Read Status", "Created At"]
          ]
        }
      ]
    },
    activity_ledger: {
      driveFileName: "activity_ledger.xlsx",
      propertiesTitle: "activity_ledger.xlsx",
      sheets: [{ title: "Activities", rowCount: 1e5, columnCount: 8 }],
      headers: [
        {
          range: "Activities!A1:H1",
          values: [
            [
              "Activity ID",
              "User DID",
              "Activity Type",
              "Target Type",
              "Target ID",
              "Actor DID",
              "Metadata",
              "Created At"
            ]
          ]
        }
      ]
    },
    messaging_ledger: {
      driveFileName: "messaging_ledger.xlsx",
      propertiesTitle: "messaging_ledger.xlsx",
      sheets: [{ title: "Activities", rowCount: 1e5, columnCount: 9 }],
      headers: [
        {
          range: "Activities!A1:I1",
          values: [
            [
              "Activity ID",
              "User DID",
              "Activity Type",
              "From DID",
              "To DID",
              "Message ID",
              "Thread ID",
              "Metadata (JSON)",
              "Created At"
            ]
          ]
        }
      ]
    },
    message_requests: {
      driveFileName: "message_requests.xlsx",
      propertiesTitle: "message_requests.xlsx",
      sheets: [{ title: "Requests", rowCount: 1e4, columnCount: 8 }],
      headers: [
        {
          range: "Requests!A1:H1",
          values: [
            [
              "Request ID",
              "From pN",
              "To pN",
              "Content",
              "Status",
              "Created At",
              "KEM Ciphertext",
              "Crypto Version"
            ]
          ]
        }
      ]
    },
    "data-point-requests": {
      driveFileName: "data-point-requests.xlsx",
      propertiesTitle: "data-point-requests.xlsx",
      sheets: [{ title: "Requests", rowCount: 1e4, columnCount: 8 }],
      headers: [
        {
          range: "Requests!A1:H1",
          values: [
            [
              "Request ID",
              "Client ID",
              "Tool Name",
              "Data Points",
              "Reason",
              "Status",
              "Created At",
              "Responded At"
            ]
          ]
        }
      ]
    },
    "zkp-data-points": {
      driveFileName: "zkp-data-points.xlsx",
      propertiesTitle: "zkp-data-points.xlsx",
      sheets: [{ title: "Data Points", rowCount: 1e4, columnCount: 12 }],
      headers: [
        {
          range: "Data Points!A1:L1",
          values: [
            [
              "Data Point ID",
              "Proof Type",
              "ZKP Proof",
              "Signature",
              "Verified At",
              "Expires At",
              "Verification Level",
              "Provider",
              "Fraud Prevention Score",
              "Encrypted User Data",
              "Created At",
              "Updated At"
            ]
          ]
        }
      ]
    },
    preferences: {
      driveFileName: "preferences",
      propertiesTitle: "preferences",
      sheets: [
        { title: "Interactions", rowCount: 1e5, columnCount: 11 },
        { title: "Current", rowCount: 1e3, columnCount: 2 }
      ],
      headers: [
        {
          range: "Interactions!A1:K1",
          values: [
            [
              "Interaction ID",
              "User DID",
              "Preference Type",
              "Action Type",
              "Previous Value (JSON)",
              "New Value (JSON)",
              "Tag ID",
              "Source File ID",
              "Question ID",
              "Metadata (JSON)",
              "Created At"
            ]
          ]
        },
        { range: "Current!A1:B1", values: [["Key", "Value (JSON)"]] },
        {
          range: "Current!A2:B2",
          values: [
            [
              "preferences",
              JSON.stringify({
                identifier: "",
                updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
                tagPreferences: []
              })
            ]
          ]
        }
      ]
    },
    engagement: {
      driveFileName: "engagement.xlsx",
      propertiesTitle: "engagement.xlsx",
      sheets: [
        { title: "Likes", rowCount: 1e5, columnCount: 2 },
        { title: "Dislikes", rowCount: 1e5, columnCount: 2 },
        { title: "Comments", rowCount: 1e5, columnCount: 8 },
        { title: "Shares", rowCount: 1e5, columnCount: 2 },
        { title: "Saves", rowCount: 1e5, columnCount: 2 }
      ],
      headers: [
        { range: "Likes!A1:B1", values: [["File ID", "Timestamp"]] },
        { range: "Dislikes!A1:B1", values: [["File ID", "Timestamp"]] },
        {
          range: "Comments!A1:H1",
          values: [
            [
              "Comment ID",
              "File ID",
              "Content",
              "Author Name",
              "Timestamp",
              "Parent Comment ID",
              "Likes (JSON)",
              "Post Reply (JSON)"
            ]
          ]
        },
        { range: "Shares!A1:B1", values: [["File ID", "Timestamp"]] },
        { range: "Saves!A1:B1", values: [["File ID", "Timestamp"]] }
      ]
    },
    prism_ledger: {
      driveFileName: "prism_ledger.xlsx",
      propertiesTitle: "prism_ledger.xlsx",
      sheets: [{ title: "Activities", rowCount: 1e5, columnCount: 8 }],
      headers: [
        {
          range: "Activities!A1:H1",
          values: [
            [
              "Activity ID",
              "User DID",
              "Activity Type",
              "Target File ID",
              "Target Owner DID",
              "Vote",
              "Metadata (JSON)",
              "Created At"
            ]
          ]
        }
      ]
    },
    "public-file-index": indexFilesSpec("public-file-index.xlsx"),
    "owner-file-index": indexFilesSpec("owner-file-index.xlsx")
  };

  // ../dm-crypto/dist/penMedia.js
  var PEN_MEDIA_CHUNK_BYTES = 4 * 1024 * 1024;

  // ../device-cloud-credentials/dist/webCloudCredentialLifecycle.js
  var defaultStore = new WebSealedStore();

  // ../device-cloud-credentials/dist/deviceDriveUploadStream.js
  var DRIVE_UPLOAD_PIECE_BYTES = 8 * 1024 * 1024;

  // src/cloudVaultBrowser.ts
  async function accessTokenFromSealedVault(envelope, options) {
    if (!envelope || !isSealedEnvelopeShape(envelope)) return null;
    let credentials;
    try {
      credentials = await unsealCloudVaultWithAnyFactor(envelope, {
        mlKemSecretKey: options.mlKemSecretKey,
        key1: options.key1,
        key2: options.key2
      });
    } catch (e) {
      console.warn("[OAuth] Cloud vault unseal unavailable");
      return null;
    }
    const resolved = await resolveFreshDriveToken({
      envelope: credentials,
      clientId: options.clientId,
      apiEndpoint: options.apiEndpoint,
      path: "unlock"
    });
    if (!resolved.token) {
      console.warn("[OAuth] Drive token unavailable", { reason: resolved.reason });
      return null;
    }
    return resolved.token;
  }
  var api = {
    accessTokenFromSealedVault,
    unsealWithAnyFactor: unsealCloudVaultWithAnyFactor,
    freshTokenFromEnvelope: freshAccessTokenFromEnvelope,
    isAccessTokenFresh,
    isSealedEnvelopeShape
  };
  globalThis.ParNoirCloudVault = api;
})();
/*! Bundled license information:

@noble/hashes/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/utils.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/post-quantum/utils.js:
@noble/post-quantum/_crystals.js:
@noble/post-quantum/ml-dsa.js:
  (*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) *)
*/

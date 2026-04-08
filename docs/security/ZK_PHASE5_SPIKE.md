# Phase 5 spike — STARK inner proof (zk-protocol-v2)

**Date:** 2026-04-07  
**Decision:** Inner proof uses **@guildofweavers/genstark** (AirScript STARK) with **SHA-256** for Merkle/FRI inside the STARK IOP. Envelope binding and digest policy remain **SHA3-384** per `IDENTITY_PQC_DECISIONS.md` §4.

## Measurements (dev laptop, `wasm: false`, Node)

| Metric | Value |
|--------|--------|
| Trace steps | 64 (init + 63 transitions) |
| Registers | 2 |
| Proof size (serialized) | ~10–11 KB typical |
| Prove time | ~15–25 ms |
| Verify time | ~9–12 ms |

## Library caveat

genSTARK’s README states **research-grade; not for production** without further audit. This stack is the **concrete Phase 5 implementation** until a audited Winterfell/WASM or similar verifier can replace the inner IOP. Soundness intuition: **transparent** proof (no trusted setup); IOP soundness depends on **hash collision resistance** (SHA-256 in this library) and low-degree tests, **not** on mod‑p discrete logarithm (replacing v1 `sigma`).

## Mobile / browser

Run with **`wasm: false`** so prover/verifier work in pure JS where WASM optimizations are unavailable (avoids warnings and aligns with Capacitor/WebView). Performance will be slower than Node; measure on device in QA.

The **id-dashboard** Vite bundle uses **`vite-plugin-node-polyfills`** so AirScript/genSTARK’s Node builtins (`fs`, `crypto`, …) resolve in the browser; expect a **larger vendor chunk** than pre–ZK-v2 builds.

## AIR summary

`BindMix` over field `2^32 - 3 * 2^25 + 1`: six **public** limbs derived from **SHA3-384(binding_string)** (8 bytes per limb, reduced mod field prime), one **secret** witness `w`; second register holds `b0` constant; first register mixes `w` and all limbs at init, then 63 steps of `r0' = 3*r0 + b0` (as `r0+r0+r0+r1`). Assertions: `r0` and `r1` at step 63.

/**
 * AirScript source for BindMix STARK (see docs/standards/ZK_PROOF_V2.md).
 * Six public limbs + secret witness; soundness via STARK IOP (SHA-256 Merkle inside genstark).
 */
export const BIND_MIX_AIR_SCRIPT = `
define BindMix over prime field (2^32 - 3 * 2^25 + 1) {
    public input b0: element[1];
    public input b1: element[1];
    public input b2: element[1];
    public input b3: element[1];
    public input b4: element[1];
    public input b5: element[1];
    secret input w: element[1];
    transition 2 registers {
        for each (b0, b1, b2, b3, b4, b5, w) {
            init { yield [w + b0 + b1 + b2 + b3 + b4 + b5, b0]; }
            for steps [1..63] {
                yield [$r0 + $r0 + $r0 + $r1, $r1];
            }
        }
    }
    enforce 2 constraints {
        for all steps { enforce transition($r) = $n; }
    }
}
`.trim();

# Pen dual-pN checklist (manual)

Hermetic unit tests cover crypto and IR. Live **invite → edit → see update** across two identities remains a local/manual check.

Use **`.local/test-pn/`** (user A) and **`.local/cursor-test-pn/`** (user B) only when explicitly doing dual-pN QA. Do not commit keys or log pn name / passcode.

## Checklist

1. **Unlock A** in Pen (messaging handoff includes ML-KEM + ML-DSA).
2. **Create** a doc as A; confirm cloud replica under `par-noir-pen/{docId}/` (bodies encrypted).
3. **Invite B** by pn (Share): profile lookup (`GET /api/profile`) + sealed `docKey`.
4. **Unlock B** in Pen; open the invited doc (hydrate from cloud, not “not found”).
5. **B edits** a section → Save draft / Commit (role permitting).
6. **A reopens / refreshes** the same doc and **sees B’s update** (cloud SoT + outbox fanout).
7. Optional reverse: B invites A on another doc; A edits; B sees update.
8. **Lock** A or B: local doc buffer + docKeys wiped; unlock again hydrates from cloud.

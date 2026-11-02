# pN name display

How a pN is named on screen, in every app. The id itself (how it's derived, its wire format) is in
[PN_IDENTIFIER_CONSISTENCY.md](../../apps/id-dashboard/docs/PN_IDENTIFIER_CONSISTENCY.md).

## Two forms

| Form | Example | Who it's for |
|---|---|---|
| Full id | `pn-4782d6e06af54e5e025d02b329b53b9f80ee26c8772624718f384baf3d937e2a`, `did:pn:<same 64 hex>` | Machines |
| Short label | `pn-4782d6e0` | People |

**Full id** is the only thing used to address a pN: URLs and QR codes, API paths and bodies, storage
keys, Drive `appProperties` (`pnId`), and the S3, Azure and FTP prefixes (`par-noir-pn-<64 hex>`). It is
never the visible name.

**Short label** is `pn-` plus the first 8 hex of the id. It is the same fingerprint used by:

- the `.pn` download filename: `pn-4782d6e0.pn`, `pn-4782d6e0.device-bound.pn`
- the Google Drive root folder: `par Noir 4782d6e0` (`pnDriveRootFolderName` in `@par-noir/user-owned-storage`)
- QR downloads: `pn-4782d6e0-qr.png`

## Name precedence

On any surface that names a pN, show the first of these that exists:

1. The name the person chose: nickname, or profile `displayName`
2. `@publicName`
3. The short label

Never fall back to the full id, a `did:pn:` string, a raw public-key slice, or an ad hoc truncation
such as `substring(0, 16) + '...'`.

## Places someone may need to check the id

On the consent screen, a sub-pN's subject, a delegatee, or an identity successor, show the short label
and put the full id in a `title` tooltip, so it can be checked on hover without crowding the layout.

## The short label is not an address

8 hex is about 2^32 possibilities; anyone can generate a key whose id starts with the same 8 characters.
Never resolve, look up, or link to a pN by its short label. Short links use public names
(`/connect/@name`), never the fingerprint.

## Code

```ts
import { deriveCanonicalPnIdentifier, pnShortLabel } from '@par-noir/pqc-crypto/oauth-unlock-proof';

pnShortLabel('pn-4782d6e0…');                           // "pn-4782d6e0"
pnShortLabel('did:pn:4782d6e0…');                       // "pn-4782d6e0"
pnShortLabel(deriveCanonicalPnIdentifier(publicKey));   // from a public key
```

`pnShortLabel` returns any other string unchanged, so non-pN values (client ids, legacy ids) aren't
mangled. It is the only implementation: no local `slice(0, 8)`, `substring(0, 16)`, or `shortPn` helpers.

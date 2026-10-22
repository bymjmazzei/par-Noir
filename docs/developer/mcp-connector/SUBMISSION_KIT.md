# Directory submission kit

Everything a connector directory (Anthropic, OpenAI) usually asks for. Prepared for the owner to submit; nothing here has been submitted.

## Before submitting

- [ ] API deployed with migrations, and `https://api.parnoir.com/mcp` answers `401` with a `WWW-Authenticate: Bearer resource_metadata=...` header.
- [ ] `https://api.parnoir.com/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` return JSON.
- [ ] Dashboard and Unlock deployed (`./deploy.sh`, then rebuild and install Unlock).
- [ ] Privacy section from [PRIVACY_AI_SECTION.md](PRIVACY_AI_SECTION.md) merged and live at `https://parnoir.com/privacy.html`.
- [ ] Connector docs from [README.md](README.md) published at a public URL.
- [ ] Square icon exported (see below).
- [ ] A reviewer pN prepared (see "Reviewer access").

## Listing

| Field | Value |
| --- | --- |
| Name | par Noir |
| Server URL | `https://api.parnoir.com/mcp` |
| Transport | Streamable HTTP (stateless) |
| Auth | OAuth 2.1, PKCE S256, dynamic client registration |
| Short description | Read what you have published on par Noir, check yes or no proofs you choose to share, and propose Pen drafts you approve. |
| Long description | par Noir is a self-sovereign identity you own. This connector signs in as an AI agent you create and scope in the par Noir Dashboard, never as you. It can search and read files and Pen documents you have published, answer yes or no about proofs you picked (never the data behind them), and propose Pen drafts that are encrypted to you and saved only if you accept them. Every sign-in is approved in par Noir Unlock on your Mac, and revoking the agent signs every app out at once. |
| Category | Productivity |
| Privacy policy | `https://parnoir.com/privacy.html` |
| Terms | `https://parnoir.com/terms.html` |
| Support | the support address listed on parnoir.com |
| Tools | see [TOOLS.md](TOOLS.md); the only write is `propose_pen_draft`, which needs the owner's acceptance |

## Icon

Directories want a square PNG, usually 512×512 or larger, on a transparent or solid background.

- Source: `icons/icon-512x512.svg` (vector), or `branding/Par-Noir-Icon-Black.png` / `Par-Noir-Icon-White.png`.
- **To do:** every PNG in `icons/` and `branding/` is 171×177, including `icon-512x512.png`, so none is ready to upload. Export the SVG at 512×512 (and 1024×1024), centered with padding, black mark on white for light listings.

## Reviewer access

Reviewers need a par Noir pN with par Noir Unlock on a Mac to approve the sign-in. Create a dedicated reviewer pN with a few published sample files, one published Pen document and one attested proof (for example `over_18`). Share its credentials only through the directory's private reviewer field, never in the listing or this repo.

## Reviewer test steps

1. **Create the agent.** Sign in to the par Noir Dashboard with the reviewer pN. Open **Sub-pN and owned assets**, choose kind **AI agent**, name it "Reviewer", tick all four remote permissions (published files, published Pen, proofs, Pen drafts), pick the `over_18` proof, confirm the disclosure and approve in par Noir Unlock.
2. **Connect.** In the AI app, add a custom connector with `https://api.parnoir.com/mcp`. Approve in par Noir Unlock and pick "Reviewer".
3. **Search and read.** Ask: "Search my par Noir files for sample." Expect `search` or `search_my_files` results. Ask it to open one; expect `fetch` or `read_file` to return the text.
4. **Pen.** Ask it to read the published Pen document by id. Expect `read_pen_document` to return it.
5. **Proof.** Ask: "Is the owner over 18?" Expect `prove_data_point` to return `satisfied`, `level` and `expiresAt` only, with no birthdate or age.
6. **Unshared proof.** Ask: "Is the owner over 21?" Expect "The owner has not shared that proof with this AI agent."
7. **Draft.** Ask it to propose a short Pen note. Expect `propose_pen_draft` to return `status: awaiting_owner`. In Pen, open **AI drafts** and accept it; it becomes a document. Propose another and discard it; it disappears.
8. **No private access.** Ask it to read a private file. Expect no private tool to exist remotely.
9. **Connected apps.** In the Dashboard, select the "Reviewer" agent. Expect the app listed under **Connected apps** with a recent "Last used".
10. **Revoke.** Choose **Revoke AI agent**. Ask the app to search again. Expect "Access revoked or expired. Reconnect par Noir in this app."

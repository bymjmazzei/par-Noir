# par Noir MCP tools

Source of truth: [`packages/mcp-server/src/tools.ts`](../../../packages/mcp-server/src/tools.ts) and [`privateTools.ts`](../../../packages/mcp-server/src/privateTools.ts). The server lists only the tools the agent's token allows, and checks the scope again on every call.

Annotations: every tool is `openWorldHint: false` and `destructiveHint: false`. Read tools are `readOnlyHint: true`, `idempotentHint: true`. `propose_pen_draft` is `readOnlyHint: false`, `idempotentHint: true` (retries reuse the client's `draftId`).

## Remote and local

| Tool | Title | Scope | Description |
| --- | --- | --- | --- |
| `search` | Search published files | `ai:files.published` | Search files the owner has published publicly on par Noir. Returns ids, titles and public URLs; use fetch for the text. |
| `fetch` | Fetch a published file | `ai:files.published` | Fetch one published file by id from search: its text (text posts only, capped at 20,000 characters) and details. |
| `search_my_files` | Search my published files | `ai:files.published` | Search files the owner has published publicly on par Noir. Returns titles, descriptions, tags and ids; use read_file for a file's text. |
| `read_file` | Read a published file | `ai:files.published` | Read one published file by id: its details and text (text posts only, capped at 20,000 characters). |
| `read_pen_document` | Read a published Pen document | `ai:pen.published` | Read one Pen document the owner has published, by its Pen document id. |
| `prove_data_point` | Check a proof the owner holds | `ai:proofs` | Ask yes or no about one proof the owner chose to share with this agent, such as over_18 or email_verification. Returns only whether it is satisfied, its level (attested or verified) and when it expires; never the underlying data. |
| `propose_pen_draft` | Propose a Pen draft | `ai:pen.drafts` | Propose a new Pen document for the owner. It is sealed to the owner before it leaves this tool and waits in Pen under AI drafts; nothing is saved until they accept it, and unaccepted drafts expire after 7 days. Retrying with the same draftId does not create a second draft. |

`search` and `fetch` follow the shape ChatGPT expects; the other read tools return richer fields.

## Local only (`pn-mcp` on the owner's Mac)

Never registered on `https://api.parnoir.com/mcp`. Listed only when the agent holds the scope and par Noir Unlock is running. The first call each hour asks the owner for Touch ID.

| Tool | Title | Scope | Description |
| --- | --- | --- | --- |
| `search_private_files` | Search my private files | `ai:files.private` or `ai:pen.private` | Search the owner's private files and private Pen documents by name or title. Returns names and ids only. |
| `read_private_file` | Read a private file | `ai:files.private` | Read one private text file by id (text types only, capped at 20,000 characters). |
| `read_private_pen_document` | Read a private Pen document | `ai:pen.private` | Read one of the owner's private Pen documents as plain text (capped at 20,000 characters). |

## What never appears in tool output

pN names or identifiers, passcodes, keys, Drive tokens, email addresses, ages or birthdates. Proofs return exactly `dataPointId`, `satisfied`, `level` and `expiresAt`.

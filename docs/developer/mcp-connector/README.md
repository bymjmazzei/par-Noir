# par Noir connector for AI apps

par Noir lets an AI app read what you have chosen to share, through an **AI agent**: a sub-identity of your pN that you create, scope and revoke yourself. The AI app never signs in as you.

- **Server URL (remote MCP, Streamable HTTP):** `https://api.parnoir.com/mcp`
- **Auth:** OAuth 2.1 with PKCE (S256). Discovery at `https://api.parnoir.com/.well-known/oauth-protected-resource` and `https://api.parnoir.com/.well-known/oauth-authorization-server`. Clients register themselves (RFC 7591) at `https://api.parnoir.com/oauth/register`.
- **Approval:** every sign-in is approved in par Noir Unlock on your Mac, where you pick which AI agent the app signs in as.

Related: [tool reference](TOOLS.md), [privacy policy section](PRIVACY_AI_SECTION.md), [directory submission kit](SUBMISSION_KIT.md).

## What an AI app can do

What it can do depends on the scopes you gave the agent when you created it.

| Scope | What the app gets |
| --- | --- |
| `ai:files.published` | Search and read files you have already published publicly |
| `ai:pen.published` | Read Pen documents you have already published |
| `ai:proofs` | Yes or no about proofs you picked (for example over 18), with the level and expiry. Never the data behind them |
| `ai:pen.drafts` | Propose a Pen draft. It is sealed to you and saved only if you accept it in Pen. Drafts you don't act on expire after 7 days |
| `ai:files.private`, `ai:pen.private` | **Local only.** Read private files and Pen documents through Unlock on your Mac, with Touch ID once an hour. Never available to hosted apps |

Hosted apps (claude.ai, ChatGPT) never get private data. par Noir's servers never see your private plaintext.

## Before you connect

1. Open the par Noir Dashboard, **Sub-pN and owned assets**, and create an **AI agent**.
2. Name it after the app (for example "Claude"), tick what it can read, confirm the disclosure, and approve in par Noir Unlock.
3. Select the agent. Its panel shows the server URL, the apps signed in as it, and these steps.

## Connect

### claude.ai

1. Open **Settings**, then **Connectors**, then **Add custom connector**.
2. Paste `https://api.parnoir.com/mcp` and choose **Connect**.
3. Approve in par Noir Unlock on your Mac and pick the agent.

### ChatGPT

1. Open **Settings**, then **Apps and Connectors**, then **Create**.
2. Paste `https://api.parnoir.com/mcp` and choose **OAuth**.
3. Approve in par Noir Unlock on your Mac and pick the agent.

### Install `pn-mcp`

From the repo, run `cd packages/mcp-server && npm install && npm run build && npm link`. Check with `pn-mcp status`.

### Cursor (local `pn-mcp`)

1. In a terminal on the Mac that added the agent, run `pn-mcp login` and pick the agent in par Noir Unlock.
2. In Cursor Settings, **MCP**, add a server with command `pn-mcp` and argument `serve`.
3. Private reads work here only, with Touch ID.

### Claude Desktop (local `pn-mcp`)

1. Run `pn-mcp login` as above.
2. In **Settings**, **Developer**, **Edit config**, add:

   ```json
   { "mcpServers": { "par-noir": { "command": "pn-mcp", "args": ["serve"] } } }
   ```

3. Restart Claude Desktop.

## See and revoke access

- **Dashboard, Sub-pN, the agent's panel:** lists each app signed in as the agent, with when it was last used.
- **Dashboard, Privacy, AI agents:** the same list for every agent, plus **Revoke all AI agents**.
- Revoking one agent, or all of them, signs every app out at once: the local `pn-mcp` and every hosted connector. The next request fails and the app has to be connected again.
- To change what an agent can read, revoke it and add a new one.

## Errors the app may show

| Message | Meaning |
| --- | --- |
| Not connected to par Noir. Reconnect par Noir in this app. | No valid sign-in |
| Access revoked or expired. Reconnect par Noir in this app. | You revoked the agent, or the sign-in expired |
| This AI agent does not have access to that. | The agent lacks the scope. Add a new agent with it |
| The owner has not shared that proof with this AI agent. | That proof was not picked when the agent was created |
| This AI agent has proposed the most drafts allowed today. | 20 drafts per agent per day |

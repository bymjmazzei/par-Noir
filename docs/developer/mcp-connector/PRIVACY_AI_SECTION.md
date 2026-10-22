# Draft privacy policy section: AI apps and agents

Draft for review. Merge into `PRIVACY_POLICY.md` and `privacy.html` (after "Third-Party Integrations") once approved. The disclosure text matches `AI_DATA_DISCLOSURE` in [`packages/standard-data-points/src/agentClient.ts`](../../../packages/standard-data-points/src/agentClient.ts), which the dashboard shows before an agent is created; keep the two in step.

---

## AI apps and AI agents

You can let an AI app (for example Claude, ChatGPT or Cursor) use par Noir on your behalf. It does so through an **AI agent**: a sub-identity of your pN that you create, give specific permissions to, and can revoke at any time. The AI app never signs in as you, and never receives your pN name, passcode or keys.

### What an AI app can receive

Only what you allowed when you created the agent:

- **Published files and Pen documents:** things you have already made public.
- **Proofs:** a yes or no answer about a proof you picked (for example "over 18"), with its level and expiry. The data behind the proof, such as your birthdate, is never sent.
- **Draft proposals:** the AI can propose a Pen document. It is encrypted to you before it leaves the AI tool, par Noir stores only the encrypted form, and nothing is saved to your storage unless you accept it in Pen. Drafts you don't act on are deleted after 7 days.
- **Private files and Pen documents (on your Mac only):** if you allowed it, a local AI tool can read them through par Noir Unlock on the Mac that created the agent, after you approve with Touch ID (once per agent per hour). Hosted AI apps never get private data, and par Noir's servers never see it unencrypted.

### Where that data goes

Anything par Noir returns to an AI app leaves par Noir custody and is sent to the AI provider (for example Anthropic or OpenAI) under their terms. par Noir cannot recall it. Review the AI provider's privacy policy before connecting.

### What par Noir keeps

- The agent's public key, label, permissions and your signed approval of them.
- Sign-in records for each connected app: the app's name and when it last refreshed its sign-in. You can see these in the Dashboard.
- Encrypted draft proposals until you accept, discard or they expire.

par Noir does not keep the content an AI app reads, and logs only hashed identifiers.

### Your control

- See every agent and the apps signed in as it under Dashboard, Sub-pN, and Dashboard, Privacy, AI agents.
- Revoking an agent, or all agents, signs every connected app out immediately.
- To change what an agent can access, revoke it and create a new one.

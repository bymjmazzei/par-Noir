# CDN / reverse proxy vs API limits

If the API sits behind a reverse proxy, load balancer, or CDN:

- **Request body size:** The API allows a larger body on some routes (e.g. Drive uploads — see [docs/api/RATE_LIMITS.md](../api/RATE_LIMITS.md)). Configure the proxy **`client_max_body_size`** (nginx) or equivalent **≥** the API route cap, or uploads will fail with 413 before they reach Node.
- **Timeouts:** Long uploads need proxy read/write timeouts that match your worst-case upload duration.
- **WebSockets:** If you terminate TLS or proxy Socket.IO, ensure the path is upgraded correctly and sticky sessions if you use multiple API nodes without a shared Socket.IO adapter (current usage is minimal).

Canonical numbers live in code ([api/src/server.ts](../../api/src/server.ts)) and [RATE_LIMITS.md](../api/RATE_LIMITS.md).

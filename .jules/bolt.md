## 2026-09-12 - Reuse HTTP/HTTPS Keep-Alive Agents for Upstream Requests
**Learning:** Default Node.js `http`/`https` modules destroy sockets after each request when `agent` is omitted or `keepAlive: false`. Creating shared `http.Agent({ keepAlive: true })` and `https.Agent({ keepAlive: true })` enables TCP and TLS session reuse across requests to the same origin, reducing latency by 50–200ms+ per request.
**Action:** Always ensure node `http`/`https` clients or custom agents explicitly set `keepAlive: true` when making multiple outbound HTTP/HTTPS requests.

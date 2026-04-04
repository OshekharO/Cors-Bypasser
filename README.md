# Cors Bypasser

A lightweight, secure CORS proxy server that enables cross-origin requests to any external API. Built on Node.js 18+ native `fetch` — no heavy HTTP client dependencies.

## 🚀 Features

- **Full HTTP Method Support** — GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD
- **Two Usage Patterns** — query-parameter style and RESTful path style
- **SSRF Protection** — blocks requests to private / loopback / link-local addresses
- **In-memory Rate Limiting** — 60 requests per IP per minute (sliding window)
- **Hop-by-hop Header Stripping** — removes headers that must not be forwarded (RFC 7230)
- **Request Body Size Cap** — 1 MB limit to prevent abuse
- **Request Timeout** — 30-second timeout on all upstream requests
- **Structured Error Responses** — consistent `{ error, statusCode }` shape
- **CORS Preflight Caching** — `Access-Control-Max-Age: 86400`
- **No axios** — uses Node 18+ native `fetch`; zero CVE surface from HTTP clients
- **Health Endpoint** — `/health` for uptime monitoring

## 📋 Requirements

- Node.js ≥ 18.0.0

## 📦 Installation

```bash
git clone <your-repo>
cd cors-bypasser
npm install
npm start          # production
npm run dev        # development (auto-restarts on file change)
```

## 🛠️ Usage

### Method 1 — Query Parameters

```javascript
// Simple GET
fetch('/proxy?url=https://api.example.com/data')
  .then(r => r.json())
  .then(console.log);

// GET with custom headers
fetch('/proxy?url=https://api.example.com/data'
  + '&headers=' + encodeURIComponent(JSON.stringify({ Authorization: 'Bearer TOKEN' })))
  .then(r => r.json());
```

### Method 2 — Request Body (recommended for POST/PUT)

```javascript
// POST
fetch('/proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://api.example.com/users',
    method: 'POST',
    headers: { Authorization: 'Bearer TOKEN', 'Content-Type': 'application/json' },
    body: { name: 'Alice', email: 'alice@example.com' }
  })
}).then(r => r.json());

// DELETE
fetch('/proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://api.example.com/users/42',
    method: 'DELETE'
  })
});
```

### Method 3 — RESTful Path

```javascript
// Full URL in path
fetch('/proxy/https://jsonplaceholder.typicode.com/posts/1')
  .then(r => r.json());

// Domain-only (defaults to https)
fetch('/proxy/jsonplaceholder.typicode.com/posts/1')
  .then(r => r.json());
```

## 📋 API Reference

### `GET|POST|PUT|DELETE|PATCH /proxy`

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `url`     | query / body | string | ✅ | Target URL to proxy |
| `method`  | query / body | string | ❌ | HTTP method (defaults to request method) |
| `headers` | query / body | JSON object | ❌ | Headers to forward to upstream |
| `body`    | query / body | JSON value | ❌ | Request body |

### `ANY /proxy/*`

Pass the target URL as the URL path. The actual HTTP method, request headers, and request body are forwarded as-is.

### `GET /health`

Returns server uptime and current timestamp.

```json
{ "status": "ok", "uptime": 42, "timestamp": "2024-01-01T00:00:00.000Z" }
```

## 🔧 Configuration

```bash
PORT=3000   # Server port (default: 3000)
```

## 🚨 Error Responses

All errors follow a consistent shape:

```json
{ "error": "Human-readable message.", "statusCode": 400 }
```

| Status | Meaning |
|--------|---------|
| `400` | Missing / malformed URL or JSON |
| `403` | Target is a private/internal address (SSRF block) |
| `404` | Unknown endpoint |
| `405` | HTTP method not allowed |
| `429` | Rate limit exceeded (60 req/min per IP) |
| `502` | Upstream fetch failed |
| `504` | Upstream request timed out (30 s) |

## 🔒 Security Notes

1. **Private address blocking** — localhost, 10.x, 172.16–31.x, 192.168.x, 169.254.x, and IPv6 equivalents are all blocked.
2. **No axios** — removes the SSRF and DoS vulnerabilities present in older axios versions.
3. **Rate limiting** — per-IP sliding-window limiter with automatic cleanup.
4. **Body size cap** — rejects payloads over 1 MB.
5. For public production deployments, consider adding authentication and domain allow-listing.

## 💡 Axios Client Example

```javascript
import axios from 'axios';

const proxy = async (targetUrl, method = 'GET', data = null, headers = {}) => {
  const { data: result } = await axios.post('/proxy', {
    url: targetUrl, method, body: data, headers
  });
  return result;
};

const posts = await proxy('https://jsonplaceholder.typicode.com/posts');
```

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS errors in browser | Make sure you're calling the proxy URL, not the target URL directly |
| `504 Upstream request timed out` | Target server is slow or unreachable |
| `403 private address` | The target URL resolves to an internal IP |
| `400 Invalid URL` | Include the protocol: `https://example.com` |
| `429 Rate limit` | Slow down — max 60 requests per minute per IP |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

**Note**: This proxy is intended for development and moderate-traffic use. For high-traffic production deployments, add persistent rate limiting (e.g. Redis-backed), a WAF, and domain allow-listing.

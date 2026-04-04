'use strict';

const express = require('express');
const cors = require('cors');

const app = express();

// ── Constants ──────────────────────────────────────────────────────────────────
const TIMEOUT_MS = 30_000;
const MAX_BODY    = '1mb';
const ALLOWED_METHODS  = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);
const SAFE_PROTOCOLS   = new Set(['http:', 'https:']);

// SSRF protection: block private / link-local / loopback address ranges
const PRIVATE_RANGES = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
];

// ── In-memory rate limiter (sliding window per IP) ─────────────────────────────
const RL_WINDOW_MS = 60_000;
const RL_MAX       = 60;
const rlStore      = new Map();

setInterval(() => {
  const cutoff = Date.now() - RL_WINDOW_MS;
  for (const [ip, entry] of rlStore) {
    if (entry.ts < cutoff) rlStore.delete(ip);
  }
}, RL_WINDOW_MS).unref();

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = rlStore.get(ip) ?? { count: 0, ts: now };
  if (now - entry.ts > RL_WINDOW_MS) { entry.count = 0; entry.ts = now; }
  if (entry.count >= RL_MAX) return true;
  entry.count++;
  rlStore.set(ip, entry);
  return false;
}

// ── Middleware ─────────────────────────────────────────────────────────────────
app.disable('x-powered-by');

const corsOptions = {
  origin: '*',
  methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS,HEAD',
  allowedHeaders: 'Content-Type,Authorization,X-Requested-With,Accept,Origin',
  exposedHeaders: 'X-Proxy-Status',
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: false, limit: MAX_BODY }));

// ── Helpers ────────────────────────────────────────────────────────────────────

// Headers that must not be forwarded to / from upstream (RFC 7230 §6.1)
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
  'host', 'content-length', 'accept-encoding',
]);

function sanitizeHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

const FORWARD_RES_HEADERS = [
  'content-type', 'cache-control', 'etag', 'last-modified',
  'location', 'set-cookie', 'expires', 'vary',
];

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '')
    .split(',')[0].trim();
}

function httpErr(msg, statusCode) {
  return Object.assign(new Error(msg), { statusCode });
}

function validateUrl(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw httpErr('Missing required parameter: url', 400);
  }

  let u;
  try { u = new URL(raw.trim()); } catch {
    throw httpErr(`Invalid URL: "${raw.trim()}"`, 400);
  }

  if (!SAFE_PROTOCOLS.has(u.protocol)) {
    throw httpErr(`Unsupported protocol "${u.protocol}". Only http and https are supported.`, 400);
  }

  if (PRIVATE_RANGES.some(re => re.test(u.hostname))) {
    throw httpErr('Requests to private or internal network addresses are not allowed.', 403);
  }

  return u.href;
}

function parseRequest(req) {
  let url     = req.query.url;
  let method  = req.query.method;
  let headers, body;

  if (req.query.headers) {
    try { headers = JSON.parse(req.query.headers); }
    catch { throw httpErr('Invalid JSON in "headers" query parameter', 400); }
  }
  if (req.query.body) {
    try { body = JSON.parse(req.query.body); }
    catch { throw httpErr('Invalid JSON in "body" query parameter', 400); }
  }

  const b = req.body;
  if (b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b).length) {
    url     = b.url    ?? url;
    method  = b.method ?? method;
    headers = b.headers ? { ...headers, ...b.headers } : headers;
    body    = b.body   !== undefined ? b.body : body;
  }

  return { url, method: (method || req.method).toUpperCase(), headers, body };
}

// ── Core proxy logic ───────────────────────────────────────────────────────────
async function doProxy(req, res, params) {
  if (isRateLimited(clientIp(req))) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Try again in a minute.',
      statusCode: 429,
    });
  }

  const { url: rawUrl, method, headers, body } = params ?? parseRequest(req);

  let targetUrl;
  try {
    targetUrl = validateUrl(rawUrl);

    if (!ALLOWED_METHODS.has(method)) {
      throw httpErr(`Method "${method}" is not allowed.`, 405);
    }

    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; CORS-Proxy/3.0)',
      ...sanitizeHeaders(headers),
    };

    const fetchInit = {
      method,
      headers: reqHeaders,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    };

    if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
      const ct = (reqHeaders['content-type'] ?? reqHeaders['Content-Type'] ?? '').toLowerCase();
      if (ct.includes('application/x-www-form-urlencoded')) {
        fetchInit.body = typeof body === 'string' ? body : new URLSearchParams(body).toString();
      } else if (typeof body === 'object') {
        fetchInit.body = JSON.stringify(body);
        if (!reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
          reqHeaders['content-type'] = 'application/json';
        }
      } else {
        fetchInit.body = body;
      }
    }

    const upstream = await fetch(targetUrl, fetchInit);

    for (const h of FORWARD_RES_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('X-Proxy-Status', 'success');

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(buf);

  } catch (err) {
    if (res.headersSent) return;

    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    const status    = err.statusCode ?? (isTimeout ? 504 : 502);
    const message   = isTimeout ? 'Upstream request timed out.' : (err.message ?? 'Proxy request failed.');

    res.status(status).json({
      error: message,
      statusCode: status,
      ...(targetUrl ? { url: targetUrl } : {}),
    });
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// Standard proxy: /proxy?url=<target>
app.all('/proxy', (req, res) => doProxy(req, res, null));

// RESTful proxy: /proxy/<https://example.com/path> or /proxy/<example.com/path>
app.all('/proxy/*', (req, res) => {
  const pathPart = req.params[0];
  const qs       = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const rawUrl   = /^https?:\/\//i.test(pathPart) ? pathPart + qs : `https://${pathPart}${qs}`;

  doProxy(req, res, {
    url:     rawUrl,
    method:  req.method.toUpperCase(),
    headers: sanitizeHeaders(req.headers),
    body:    req.body && Object.keys(req.body).length ? req.body : undefined,
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({
    error:     'Not found.',
    statusCode: 404,
    usage:     'GET /proxy?url=<encoded-target-url>',
  });
});

// Global error handler
app.use((err, _req, res, _next) => {
  res.status(500).json({ error: 'Internal server error.', statusCode: 500 });
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CORS proxy listening on port ${PORT}`));

module.exports = app;

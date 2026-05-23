'use strict';

const http    = require('node:http');
const https   = require('node:https');
const express = require('express');
const cors    = require('cors');

const app = express();

// ── Constants ──────────────────────────────────────────────────────────────────
const TIMEOUT_MS    = 30_000;
const MAX_BODY      = '10mb';
const MAX_REDIRECTS = 5;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);
const SAFE_PROTOCOLS  = new Set(['http:', 'https:']);

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

// Explicitly set CORS headers on all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS,HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin');
  res.header('Access-Control-Expose-Headers', 'X-Proxy-Status');
  next();
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: false, limit: MAX_BODY }));

// ── Helpers ────────────────────────────────────────────────────────────────────

// Headers that must not be forwarded to/from upstream (RFC 7230 §6.1)
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

// ── Upstream HTTP client (node:http/https for maximum TLS compatibility) ───────
// Using the built-in http/https modules instead of native fetch avoids strict
// undici TLS behaviour that rejects servers with incomplete certificate chains.
// rejectUnauthorized is disabled so the proxy can reach sites whose certificate
// chains are incomplete (self-signed, missing intermediate CA, etc.). The
// browser already handles trust for its own connection to this proxy.
const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

function upstreamFetch(initialUrl, initialMethod, reqHeaders, reqBody) {
  return new Promise((resolve, reject) => {
    let redirectsLeft = MAX_REDIRECTS;
    let method = initialMethod;
    let body   = reqBody;

    function attempt(url) {
      // Validate every hop (catches SSRF via open redirect)
      let validUrl;
      try { validUrl = validateUrl(url); } catch (e) { return reject(e); }

      const urlObj  = new URL(validUrl);
      const isHttps = urlObj.protocol === 'https:';
      const mod     = isHttps ? https : http;
      const port    = urlObj.port ? Number(urlObj.port) : (isHttps ? 443 : 80);

      const options = {
        hostname : urlObj.hostname,
        port,
        path     : (urlObj.pathname || '/') + urlObj.search,
        method,
        headers  : reqHeaders,
        ...(isHttps ? { agent: HTTPS_AGENT } : {}),
      };

      const timer = setTimeout(() => {
        req.destroy();
        const e = new Error('Upstream request timed out.');
        e.name  = 'TimeoutError';
        reject(e);
      }, TIMEOUT_MS);

      const req = mod.request(options, (res) => {
        const { statusCode, headers: resHeaders } = res;

        if (
          [301, 302, 303, 307, 308].includes(statusCode) &&
          resHeaders.location &&
          redirectsLeft-- > 0
        ) {
          res.resume(); // discard redirect body
          clearTimeout(timer);
          // RFC 7231: 303 always becomes GET; 301/302 should too for non-GET
          if (statusCode === 303 || ((statusCode === 301 || statusCode === 302) && method !== 'GET' && method !== 'HEAD')) {
            method = 'GET';
            body   = undefined;
          }
          attempt(new URL(resHeaders.location, validUrl).href);
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          clearTimeout(timer);
          resolve({ status: statusCode, headers: resHeaders, body: Buffer.concat(chunks) });
        });
        res.on('error', (e) => { clearTimeout(timer); reject(e); });
      });

      req.on('error', (e) => { clearTimeout(timer); reject(e); });

      if (body !== undefined && body !== null) req.write(body);
      req.end();
    }

    attempt(initialUrl);
  });
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

    // Encode body for transport
    let reqBody;
    if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
      const ct = (reqHeaders['content-type'] ?? reqHeaders['Content-Type'] ?? '').toLowerCase();
      if (ct.includes('application/x-www-form-urlencoded')) {
        reqBody = typeof body === 'string' ? body : new URLSearchParams(body).toString();
      } else if (typeof body === 'object') {
        reqBody = JSON.stringify(body);
        if (!reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
          reqHeaders['content-type'] = 'application/json';
        }
      } else {
        reqBody = body;
      }
    }

    const upstream = await upstreamFetch(targetUrl, method, reqHeaders, reqBody);

    // Forward all non-hop-by-hop response headers
    for (const [k, v] of Object.entries(upstream.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) res.setHeader(k, v);
    }
    res.setHeader('X-Proxy-Status', 'success');

    res.status(upstream.status).send(upstream.body);

  } catch (err) {
    if (res.headersSent) return;

    const isTimeout = err.name === 'TimeoutError';
    const status    = err.statusCode ?? (isTimeout ? 504 : 502);
    const cause     = err.cause instanceof Error ? err.cause.message : null;
    const message   = isTimeout
      ? 'Upstream request timed out.'
      : (cause || err.message || 'Proxy request failed.');

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
// Vercel (and some reverse proxies) collapse "://" to ":/" in URL paths, so
// "https://example.com" arrives as "https:/example.com". We normalise any
// number of slashes after the protocol colon back to exactly two.
app.all('/proxy/*', (req, res) => {
  const pathPart   = req.params[0];
  const qs         = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const normalized = pathPart.replace(/^(https?:)\/*/, '$1//');
  const rawUrl     = /^https?:\/\//i.test(normalized) ? normalized + qs : `https://${pathPart}${qs}`;

  doProxy(req, res, {
    url:     rawUrl,
    method:  req.method.toUpperCase(),
    headers: sanitizeHeaders(req.headers),
    body:    req.body && Object.keys(req.body).length ? req.body : undefined,
  });
});

// Root – welcome / usage
app.get('/', (_req, res) => {
  res.json({
    name:    'CORS Bypasser',
    status:  'ok',
    usage: {
      query_param: 'GET /proxy?url=<encoded-target-url>',
      path_param:  'GET /proxy/<target-url>',
      examples: [
        '/proxy?url=https%3A%2F%2Fexample.com',
        '/proxy/https://example.com/api/data',
      ],
    },
    health: '/health',
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
    error:      'Not found.',
    statusCode: 404,
    usage:      'GET /proxy?url=<encoded-target-url>',
  });
});

// Global error handler
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error.', statusCode: 500 });
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CORS proxy listening on port ${PORT}`));

module.exports = app;

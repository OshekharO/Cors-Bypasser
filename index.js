const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle preflight requests globally
app.options('*', cors());

// Enhanced proxy endpoint that supports all methods
app.all('/proxy', async (req, res) => {
  const { url, method = req.method } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      message: 'Invalid or missing URL',
      status: 'error',
      statusCode: 400
    });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (error) {
    return res.status(400).json({
      message: 'Invalid URL format',
      status: 'error',
      statusCode: 400
    });
  }

  let headers = {};
  let body = {};

  try {
    // Parse headers and body from query params (for GET requests)
    if (req.query.headers) {
      headers = JSON.parse(req.query.headers);
    }
    if (req.query.body) {
      body = JSON.parse(req.query.body);
    }
  } catch (e) {
    return res.status(400).json({
      message: 'Invalid JSON in query parameters',
      status: 'error',
      statusCode: 400
    });
  }

  // Override with request body if provided (for POST, PUT, PATCH)
  if (req.body) {
    if (req.body.headers && typeof req.body.headers === 'object') {
      headers = { ...headers, ...req.body.headers };
    }
    if (req.body.body !== undefined) {
      body = req.body.body;
    }
  }

  // Merge with headers from actual request (for Authorization, etc.)
  const incomingHeaders = { ...req.headers };
  
  // Remove unwanted headers that might break the request
  delete incomingHeaders.host;
  delete incomingHeaders.connection;
  delete incomingHeaders['content-length'];
  
  headers = { ...headers, ...incomingHeaders };

  try {
    const config = {
      url,
      method: method.toUpperCase(),
      headers: {
        'User-Agent': 'CORS-Proxy-Server/1.0',
        ...headers
      },
      timeout: 30000, // 30 second timeout
      validateStatus: (status) => status < 600 // Accept all status codes
    };

    // Only include data for methods that typically have a body
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
      config.data = body;
    }

    const response = await axios(config);

    // Forward appropriate headers from the target response
    const forwardHeaders = [
      'content-type',
      'content-length',
      'cache-control',
      'etag',
      'last-modified',
      'location'
    ];

    forwardHeaders.forEach(header => {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    });

    // Handle different response types
    if (response.headers['content-type']?.includes('application/json')) {
      res.status(response.status).json(response.data);
    } else if (response.headers['content-type']?.includes('text/')) {
      res.status(response.status).send(response.data);
    } else {
      // For binary data or other content types
      res.status(response.status).send(response.data);
    }

  } catch (error) {
    console.error('Proxy error:', error.message);

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.statusText || error.message;

    res.status(statusCode).json({
      message: errorMessage,
      status: 'error',
      statusCode,
      error: error.response?.data || error.message,
      url: url
    });
  }
});

// Alternative endpoint that captures URL path for more RESTful usage
app.all('/proxy/*', async (req, res) => {
  const path = req.params[0];
  const method = req.method;
  
  if (!path) {
    return res.status(400).json({
      message: 'No URL path provided',
      status: 'error',
      statusCode: 400
    });
  }

  // Reconstruct the target URL
  let targetUrl;
  try {
    // If it looks like a full URL, use it directly
    if (path.startsWith('http://') || path.startsWith('https://')) {
      targetUrl = path;
    } else {
      // Otherwise, assume it's a path that needs a protocol
      targetUrl = `https://${path}`;
    }
    
    new URL(targetUrl); // Validate URL
  } catch (error) {
    return res.status(400).json({
      message: 'Invalid URL path',
      status: 'error',
      statusCode: 400
    });
  }

  let headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;

  try {
    const config = {
      url: targetUrl,
      method: method,
      headers: {
        'User-Agent': 'CORS-Proxy-Server/1.0',
        ...headers
      },
      data: req.body,
      timeout: 30000,
      validateStatus: (status) => status < 600
    };

    const response = await axios(config);

    // Forward headers
    const forwardHeaders = [
      'content-type',
      'content-length',
      'cache-control',
      'etag',
      'last-modified',
      'location'
    ];

    forwardHeaders.forEach(header => {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    });

    // Handle response based on content type
    const contentType = response.headers['content-type'];
    if (contentType?.includes('application/json')) {
      res.status(response.status).json(response.data);
    } else if (contentType?.includes('text/')) {
      res.status(response.status).send(response.data);
    } else {
      res.status(response.status).send(response.data);
    }

  } catch (error) {
    console.error('Proxy error:', error.message);

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.statusText || error.message;

    res.status(statusCode).json({
      message: errorMessage,
      status: 'error',
      statusCode,
      error: error.response?.data || error.message,
      url: targetUrl
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'CORS Proxy Server is running',
    timestamp: new Date().toISOString()
  });
});

// Usage examples endpoint
app.get('/examples', (req, res) => {
  res.json({
    examples: {
      'GET request': '/proxy?url=https://api.example.com/data',
      'POST with query params': '/proxy?url=https://api.example.com/data&method=POST',
      'POST with body': 'POST /proxy with body: { "url": "https://api.example.com/data", "method": "POST", "body": { "key": "value" }, "headers": { "Authorization": "Bearer token" } }',
      'RESTful style': 'GET /proxy/api.example.com/data'
    }
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Enhanced CORS proxy server running on http://localhost:${port}`);
  console.log('Endpoints:');
  console.log('  GET/POST/PUT/DELETE /proxy?url=URL&method=METHOD');
  console.log('  ALL /proxy/* (RESTful style)');
  console.log('  GET /health (Health check)');
  console.log('  GET /examples (Usage examples)');
});

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

// Enhanced proxy endpoint with better URL validation
app.all('/proxy', async (req, res) => {
  console.log('Received request:', {
    method: req.method,
    query: req.query,
    body: req.body,
    headers: req.headers
  });

  let url, method, headers, body;

  // Parse parameters from either query string or request body
  if (req.method === 'GET' || Object.keys(req.query).length > 0) {
    // From query parameters
    url = req.query.url;
    method = req.query.method || req.method;
    
    try {
      if (req.query.headers) {
        headers = typeof req.query.headers === 'string' 
          ? JSON.parse(req.query.headers) 
          : req.query.headers;
      }
      if (req.query.body) {
        body = typeof req.query.body === 'string'
          ? JSON.parse(req.query.body)
          : req.query.body;
      }
    } catch (e) {
      console.error('JSON parse error:', e.message);
      return res.status(400).json({
        message: 'Invalid JSON in query parameters',
        status: 'error',
        statusCode: 400,
        details: e.message
      });
    }
  }

  // Override with request body if provided
  if (req.body && Object.keys(req.body).length > 0) {
    url = req.body.url || url;
    method = req.body.method || method || req.method;
    headers = { ...headers, ...req.body.headers };
    body = req.body.body !== undefined ? req.body.body : body;
  }

  // Final method fallback
  method = method || req.method;

  console.log('Parsed parameters:', { url, method, headers, body });

  // Validate URL
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return res.status(400).json({
      message: 'Invalid or missing URL',
      status: 'error',
      statusCode: 400,
      receivedUrl: url
    });
  }

  // Clean and validate URL
  const cleanUrl = url.trim();
  
  try {
    // Basic URL validation - allow any valid URL
    const urlObj = new URL(cleanUrl);
    
    // Ensure protocol is http or https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return res.status(400).json({
        message: 'Invalid URL protocol. Only HTTP and HTTPS are allowed.',
        status: 'error',
        statusCode: 400
      });
    }
  } catch (error) {
    return res.status(400).json({
      message: 'Invalid URL format',
      status: 'error',
      statusCode: 400,
      details: error.message,
      url: cleanUrl
    });
  }

  // Prepare headers
  const finalHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    ...headers
  };

  // Remove problematic headers that might interfere
  delete finalHeaders.host;
  delete finalHeaders.connection;
  delete finalHeaders['content-length'];
  delete finalHeaders['accept-encoding'];

  try {
    console.log('Making request to:', cleanUrl, 'with method:', method);
    
    const config = {
      url: cleanUrl,
      method: method.toUpperCase(),
      headers: finalHeaders,
      timeout: 30000,
      validateStatus: (status) => status < 600, // Accept all status codes
      maxRedirects: 5
    };

    // Handle different content types for body
    if (body) {
      if (finalHeaders['content-type'] === 'application/x-www-form-urlencoded') {
        // For form-urlencoded, body should be a string
        config.data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
      } else if (typeof body === 'object' && !Buffer.isBuffer(body)) {
        // For JSON, stringify the object
        config.data = JSON.stringify(body);
      } else {
        // For other types, use as-is
        config.data = body;
      }
    }

    console.log('Axios config:', {
      url: config.url,
      method: config.method,
      headers: config.headers,
      data: config.data
    });

    const response = await axios(config);

    console.log('Response received:', {
      status: response.status,
      headers: response.headers,
      data: response.data
    });

    // Forward appropriate headers from the target response
    const forwardHeaders = [
      'content-type',
      'content-length',
      'cache-control',
      'etag',
      'last-modified',
      'location',
      'set-cookie'
    ];

    forwardHeaders.forEach(header => {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    });

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle different response types
    const contentType = response.headers['content-type'];
    
    if (contentType && contentType.includes('application/json')) {
      res.status(response.status).json(response.data);
    } else if (contentType && contentType.includes('text/')) {
      res.status(response.status).send(response.data);
    } else {
      res.status(response.status).send(response.data);
    }

  } catch (error) {
    console.error('Proxy error:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.statusText || error.message;

    res.status(statusCode).json({
      message: errorMessage,
      status: 'error',
      statusCode,
      error: error.response?.data || error.message,
      url: cleanUrl,
      details: error.code
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'CORS Proxy Server is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Test endpoint to verify the proxy is working
app.post('/test', async (req, res) => {
  try {
    const testResponse = await axios({
      url: 'https://jsonplaceholder.typicode.com/posts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        title: 'Test Post',
        body: 'This is a test',
        userId: 1
      }
    });

    res.json({
      message: 'Proxy test successful',
      status: 'success',
      testResponse: {
        status: testResponse.status,
        data: testResponse.data
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Proxy test failed',
      error: error.message
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Enhanced CORS proxy server running on http://localhost:${port}`);
  console.log('Endpoints:');
  console.log('  GET/POST/PUT/DELETE /proxy');
  console.log('  GET /health (Health check)');
  console.log('  POST /test (Test endpoint)');
});

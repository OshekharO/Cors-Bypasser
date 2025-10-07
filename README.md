# Cors Bypasser

A comprehensive, feature-rich CORS proxy server that enables cross-origin requests to any API. Supports all HTTP methods with multiple usage patterns and advanced configuration options.

## 🚀 Features

- **Full HTTP Method Support**: GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD
- **Multiple Usage Patterns**: Query parameters, RESTful style, and request body
- **Enhanced CORS Headers**: Pre-configured for all cross-origin scenarios
- **Flexible Request Configuration**: Headers, body, and method customization
- **Comprehensive Error Handling**: Detailed error responses with status codes
- **Multiple Content Type Support**: JSON, text, binary data, and more
- **Request Timeout**: 30-second timeout for all requests
- **Health Monitoring**: Built-in health check endpoint
- **RESTful URL Support**: Path-based proxy routing

## 📦 Installation

```bash
# Clone the repository
git clone <your-repo>
cd cors-proxy

# Install dependencies
npm install

# Start the server
npm start

# For development with auto-restart
npm run dev
```

### Dependencies

```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "axios": "^1.6.0"
}
```

## 🛠️ Usage

### Method 1: Query Parameters (Simple GET)

```javascript
// GET request
fetch('/proxy?url=https://api.example.com/data')
  .then(response => response.json())
  .then(data => console.log(data));

// GET with custom headers
fetch('/proxy?url=https://api.example.com/data&headers=' + encodeURIComponent(JSON.stringify({
  'Authorization': 'Bearer your-token'
})))
.then(response => response.json());
```

### Method 2: Request Body (Recommended for POST/PUT)

```javascript
// POST request with body and headers
fetch('/proxy', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://api.example.com/users',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-token',
      'Content-Type': 'application/json'
    },
    body: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  })
})
.then(response => response.json());

// PUT request
fetch('/proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://api.example.com/users/123',
    method: 'PUT',
    body: {
      name: 'Jane Doe',
      email: 'jane@example.com'
    }
  })
});

// DELETE request
fetch('/proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://api.example.com/users/123',
    method: 'DELETE'
  })
});
```

### Method 3: RESTful Style

```javascript
// Simple GET with path
fetch('/proxy/api.example.com/data')
  .then(response => response.json());

// Full URL support
fetch('/proxy/https://jsonplaceholder.typicode.com/posts')
  .then(response => response.json());
```

## 📋 API Endpoints

### Main Proxy Endpoint
- **URL**: `/proxy`
- **Methods**: ALL (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
- **Parameters**:
  - `url` (string, required): Target URL to proxy
  - `method` (string, optional): HTTP method (defaults to GET or request method)
  - `headers` (object, optional): Request headers as JSON string
  - `body` (object, optional): Request body as JSON string (query params only)

### RESTful Proxy Endpoint
- **URL**: `/proxy/*`
- **Methods**: ALL
- **Description**: Use the path as the target URL

### Health Check
- **URL**: `/health`
- **Method**: GET
- **Response**: Server status and timestamp

### Examples
- **URL**: `/examples`
- **Method**: GET
- **Response**: Usage examples and patterns

## 🔧 Configuration

### Environment Variables
```bash
PORT=3000  # Server port (default: 3000)
```

### Custom Headers
The proxy automatically:
- Forwards most headers from the original request
- Adds `User-Agent: CORS-Proxy-Server/1.0`
- Removes problematic headers (`host`, `connection`, `content-length`)
- Preserves `Content-Type` and other important headers

### Supported Content Types
- `application/json`
- `text/*` (text/plain, text/html, text/xml)
- Binary data
- Multipart forms

## 🚨 Error Handling

The proxy returns structured error responses:

```javascript
// Success Response
{
  "data": "response data"
}

// Error Response
{
  "message": "Error description",
  "status": "error",
  "statusCode": 400,
  "error": "Detailed error information",
  "url": "https://failed-url.com"
}
```

### Common Status Codes
- `400`: Bad Request (invalid URL, missing parameters)
- `500`: Internal Server Error (proxy error)
- `429`: Too Many Requests (if rate limiting implemented)
- `5xx`: Forwarded from target API

## 💡 Examples

### Complete Example with Error Handling

```javascript
async function makeProxyRequest() {
  try {
    const response = await fetch('/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://jsonplaceholder.typicode.com/posts',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          title: 'foo',
          body: 'bar',
          userId: 1
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('Success:', data);
    return data;
  } catch (error) {
    console.error('Request failed:', error);
  }
}
```

### Using with Axios

```javascript
import axios from 'axios';

const proxyRequest = async (targetUrl, method = 'GET', data = null) => {
  const response = await axios({
    method: 'POST',
    url: '/proxy',
    data: {
      url: targetUrl,
      method: method,
      body: data,
      headers: {
        'Authorization': 'Bearer your-token'
      }
    }
  });
  return response.data;
};

// Usage
const result = await proxyRequest('https://api.example.com/data', 'POST', { key: 'value' });
```

## 🔒 Security Considerations

1. **Use HTTPS** in production
2. **Implement rate limiting** for public deployments
3. **Add authentication** if needed
4. **Validate and sanitize** target URLs
5. **Consider domain whitelisting** for production use

## 🐛 Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure you're using the proxy URL, not the target URL directly
2. **Timeout Errors**: Check if target API is accessible and responsive
3. **JSON Parse Errors**: Verify your request body is valid JSON
4. **Invalid URL**: Ensure URLs include protocol (http:// or https://)

### Debugging

Enable logging by adding to your server code:
```javascript
// Add this before the axios request
console.log('Proxying:', { url, method, headers });
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

**Note**: This proxy is designed for development and moderate usage. For high-traffic production environments, consider implementing additional security measures, rate limiting, and caching.

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Proxy Route ----------
app.all('/fetchdata', async (req, res) => {
  const { url, method = 'GET' } = req.query;

  let headers = {};
  let body = {};

  try {
    if (req.query.headers) headers = JSON.parse(req.query.headers);
    if (req.query.body) body = JSON.parse(req.query.body);
  } catch (e) {
    return res.status(400).json({
      message: 'Invalid JSON in query params',
      status: 'error',
      statusCode: 400
    });
  }

  headers = Object.keys(req.body?.headers || {}).length ? req.body.headers : headers;
  body = Object.keys(req.body?.body || {}).length ? req.body.body : body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      message: 'Invalid or missing URL',
      status: 'error',
      statusCode: 400
    });
  }

  try {
    const response = await axios({
      url,
      method: method.toUpperCase(),
      headers,
      data: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error occurred:', error.message);

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.statusText || error.message;

    res.status(statusCode).json({
      message: errorMessage,
      status: 'error',
      statusCode,
      error: error.response?.data,
    });
  }
});

// ---------- Frontend Tester Page ----------
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CORS Proxy Tester</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    input, textarea, select, button { margin: 5px 0; width: 100%; padding: 8px; }
    textarea { height: 100px; }
    .container { max-width: 700px; margin: auto; }
    .json-viewer { font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 10px; border-radius: 6px; }
    .key { color: #9cdcfe; }
    .string { color: #ce9178; }
    .number { color: #b5cea8; }
    .boolean { color: #569cd6; }
    .null { color: #808080; }
    .collapsible { cursor: pointer; color: #569cd6; }
    .nested { margin-left: 20px; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h2>CORS Proxy Tester</h2>
    <label>Target URL:</label>
    <input type="text" id="url" placeholder="https://jsonplaceholder.typicode.com/todos/1">

    <label>Method:</label>
    <select id="method">
      <option>GET</option>
      <option>POST</option>
      <option>PUT</option>
      <option>DELETE</option>
      <option>PATCH</option>
    </select>

    <label>Headers (JSON):</label>
    <textarea id="headers">{ "Content-Type": "application/json" }</textarea>

    <label>Body (JSON):</label>
    <textarea id="body">{}</textarea>

    <button onclick="sendRequest()">Send Request</button>

    <h3>Response:</h3>
    <div id="response" class="json-viewer"></div>
  </div>

  <script>
    async function sendRequest() {
      const url = document.getElementById("url").value.trim();
      const method = document.getElementById("method").value;
      let headers, body;

      try {
        headers = JSON.parse(document.getElementById("headers").value || "{}");
        body = JSON.parse(document.getElementById("body").value || "{}");
      } catch (e) {
        document.getElementById("response").textContent = "Invalid JSON in headers/body";
        return;
      }

      try {
        const res = await fetch(\`/fetchdata?url=\${encodeURIComponent(url)}&method=\${method}\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headers, body })
        });

        const data = await res.json();
        renderJSON(data, document.getElementById("response"));
      } catch (err) {
        document.getElementById("response").textContent = "Error: " + err.message;
      }
    }

    function renderJSON(obj, container) {
      container.innerHTML = syntaxHighlight(obj, 0);
      attachCollapsibles(container);
    }

    function syntaxHighlight(json, level) {
      if (typeof json !== 'object' || json === null) {
        return formatPrimitive(json);
      }
      const isArray = Array.isArray(json);
      let html = isArray ? '[<div class="nested">' : '{<div class="nested">';
      for (let key in json) {
        if (Object.hasOwnProperty.call(json, key)) {
          html += '<div>';
          if (!isArray) {
            html += '<span class="key">"' + key + '"</span>: ';
          }
          if (typeof json[key] === 'object' && json[key] !== null) {
            html += '<span class="collapsible">▶</span> ' + syntaxHighlight(json[key], level + 1);
          } else {
            html += formatPrimitive(json[key]);
          }
          html += '</div>';
        }
      }
      html += '</div>' + (isArray ? ']' : '}');
      return html;
    }

    function formatPrimitive(value) {
      if (typeof value === 'string') return '<span class="string">"' + value + '"</span>';
      if (typeof value === 'number') return '<span class="number">' + value + '</span>';
      if (typeof value === 'boolean') return '<span class="boolean">' + value + '</span>';
      if (value === null) return '<span class="null">null</span>';
      return value;
    }

    function attachCollapsibles(container) {
      container.querySelectorAll('.collapsible').forEach(toggle => {
        const nested = toggle.nextElementSibling.querySelector('.nested');
        if (!nested) return;

        // collapse everything by default
        nested.style.display = "none";
        toggle.textContent = "▶";

        // expand first-level objects only
        if (toggle.closest('.json-viewer > div')) {
          nested.style.display = "block";
          toggle.textContent = "▼";
        }

        toggle.addEventListener('click', function () {
          if (nested.style.display === "none") {
            nested.style.display = "block";
            this.textContent = "▼";
          } else {
            nested.style.display = "none";
            this.textContent = "▶";
          }
        });
      });
    }
  </script>
</body>
</html>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(\`CORS proxy server running on http://localhost:\${port}\`);
});

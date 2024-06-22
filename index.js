const http2 = require('http2');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cache = require('node-cache');

const app = express();
app.use(cors());
app.use(express.json());

const cacheTTL = 3600; // 1 hour cache TTL

app.all('/fetchdata', async (req, res) => {
  const { url, method = 'GET', headers = {}, body = {} } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).send({ message: 'Invalid URL', status: 'error', statusCode: 400 });
  }

  const cacheKey = `${url}:${method}:${JSON.stringify(headers)}`;
  const cachedResponse = cache.get(cacheKey);
  if (cachedResponse) {
    return res.send(cachedResponse);
  }

  try {
    const response = await axios({
      url,
      method,
      headers: Object.keys(headers).reduce((acc, key) => ({ ...acc, [key]: headers[key] }), {}),
      data: body,
    });

    cache.set(cacheKey, response.data, cacheTTL);
    res.send(response.data);
  } catch (error) {
    console.error('Error occurred:', error.message);

    const statusCode = error.response?.status || 500;
    const errorMessage = error.message || 'Internal Server Error';

    res.status(statusCode).send({
      message: errorMessage,
      status: 'error',
      statusCode,
      error: error.response?.data,
    });
  }
});

const server = http2.createServer(app);

server.listen(3000, () => {
  console.log(`CORS proxy server running on http://localhost:3000`);
});

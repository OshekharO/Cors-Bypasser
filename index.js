const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`CORS proxy server running on http://localhost:${port}`);
});

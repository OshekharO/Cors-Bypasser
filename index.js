const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http2 = require('http2');

const app = express();
app.use(cors());
app.use(express.json());

app.all('/fetchdata', async (req, res) => {
  const { url, method = 'GET', headers = {}, body = {} } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).send({ message: 'Invalid URL', status: 'error', statusCode: 400 });
  }

  try {
    const response = await axios({
      url,
      method,
      headers: Object.keys(headers).reduce((acc, key) => ({ ...acc, [key]: headers[key] }), {}),
      data: body,
    });

    res.send(response.data);
  } catch (error) {
    console.error('Error occurred:', error.message);

    const statusCode = error.response?.status || 500;
    const errorMessage = error.message || 'Internal Server Error';

    res.status(statusCode).send({
      message: errorMessage,
      status: 'error',
      statusCode,
    });
  }
});

const server = http2.createServer(app);
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`CORS proxy server running on http://localhost:${port}`);
});

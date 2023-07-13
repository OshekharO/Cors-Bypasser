const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());

app.use(express.json()); // to parse JSON body

const processRequest = async (req, res, next, url, headers) => {
  try {
    if (!url) {
      throw new Error("URL is required");
    }

    const response = await axios({
      url: url,
      method: req.method,
      headers: headers,
      data: req.method === 'POST' ? req.body : {},
    });

    if (response.status >= 200 && response.status < 300) {
      res.send(response.data);
    } else {
      throw new Error(`Request to ${url} returned status ${response.status}`);
    }
  } catch (error) {
    next(error);
  }
};

// Handler for GET requests
app.get('/fetchdata', async (req, res, next) => {
  const { url } = req.query;
  await processRequest(req, res, next, url);
});

// Handler for POST requests
app.post('/fetchdata', async (req, res, next) => {
  const { url, headers } = req.body;
  await processRequest(req, res, next, url, headers);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(`Error occurred: ${error.message}`);

  const statusCode = error.response?.status || 500;
  const errorMessage = error.message || 'Internal Server Error';

  res.status(statusCode).send({
    message: errorMessage,
    status: 'error',
    statusCode,
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

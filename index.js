const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

app.all('/fetchdata', async (req, res) => {
  try {
    const { url, method, headers, body } = req.body;
    
    // Make the request to the target URL
    const response = await axios({
      url,
      method: method || 'GET',
      headers: headers || {},
      data: body || {},
    });
    
    // Forward the response back to the client
    res.send(response.data);
  } catch (error) {
    console.error('Error occurred:', error.message);
    
    // Handle any errors and send an error response
    const statusCode = error.response?.status || 500;
    const errorMessage = error.message || 'Internal Server Error';
    res.status(statusCode).send({
      message: errorMessage,
      status: 'error',
      statusCode,
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`CORS proxy server running on http://localhost:${port}`);
});

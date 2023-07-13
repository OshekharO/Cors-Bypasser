# 🔀 Simple CORS Proxy

## 🚀 Features

- 🔎 GET and POST requests to any URL
- 🛠 Bypasses CORS restrictions
- 📨 Includes headers in the request
- 🚦 Handles CORS preflight requests
- 🖥 Built with Express.js

## 📚 Usage

### GET Requests 📩

Simply append the target URL as a query parameter:

`https://simple-cors-proxy.vercel.app/fetchdata?url=YOUR_URL_HERE`

### POST Requests 📤

Send a JSON object in the body of the request with url and headers properties:

`fetch('https://simple-cors-proxy.vercel.app/fetchdata', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url: YOUR_URL_HERE, headers: YOUR_HEADERS_HERE })
})
.then(response => response.json())
.then(data => {
    // Handle the data here
})
.catch(error => {
    console.error(error);
});`

### 🎓 Educational Purposes Only

This project is intended for educational purposes only. Ensure your usage of APIs complies with their terms and policies.

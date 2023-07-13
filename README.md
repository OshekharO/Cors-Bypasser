# 🔀 CORS Proxy

## 🚀 Features

- 🔎 GET and POST requests
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

```javascript
function check(code) {
    const targetUrl = `https://securepayment.zee5.com/paymentGateway/coupon/verification?coupon_code=${code}&country_code=IN&translation=en`;
    const proxyUrl = 'https://simple-cors-proxy.vercel.app/fetchdata';
    const headers = {
        'Referer': 'https://b2bapi.zee5.com/',
        'Origin': 'https://b2bapi.zee5.com'
    }
    const body = {
        'coupon_code': code,
        'country_code': 'IN',
        'translation': 'en'
    }

    return fetch(proxyUrl, { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: targetUrl, headers: headers, body: body })
        })
        .then(response => {
            return {status: response.status, data: response.json()};
        });
}

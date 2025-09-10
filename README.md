# 🔀 CORS Proxy

## 🚀 Features

- 🔎 Supports **GET** and **POST** requests
- 🛠 Bypasses **CORS restrictions**
- 📨 Allows **custom headers and body**
- 🚦 Handles **CORS preflight requests**
- 🌐 Accepts **headers/body via query string or JSON body**
- 🖥 Built with **Express.js + Axios**

---

## 📚 Usage

### 1️⃣ GET Requests 📩

Simply append the target URL as a query parameter:

```bash
https://cors-bypasser-gilt.vercel.app/fetchdata?url=YOUR_URL_HERE
```

Example:

```bash
curl "https://cors-bypasser-gilt.vercel.app/fetchdata?url=https://jsonplaceholder.typicode.com/todos/1"
```

---

### 2️⃣ GET with Headers in Query

```bash
curl "https://cors-bypasser-gilt.vercel.app/fetchdata?url=https://httpbin.org/headers&headers={\"X-Test\":\"123\"}"
```

---

### 3️⃣ POST with Query Parameters 📤

```bash
curl "https://cors-bypasser-gilt.vercel.app/fetchdata?url=https://httpbin.org/post&method=POST&body={\"foo\":\"bar\"}"
```

---

### 4️⃣ POST with JSON Body (Recommended) 📤

Send a JSON object in the body of the request with **url**, **headers**, and **body** properties:

```javascript
function check(code) {
    const targetUrl = `https://securepayment.zee5.com/paymentGateway/coupon/verification?coupon_code=${code}&country_code=IN&translation=en`;
    const proxyUrl = 'https://cors-bypasser-gilt.vercel.app/fetchdata';
    const headers = {
        'Referer': 'https://b2bapi.zee5.com/',
        'Origin': 'https://b2bapi.zee5.com'
    };
    const body = {
        'coupon_code': code,
        'country_code': 'IN',
        'translation': 'en'
    };

    return fetch(proxyUrl + '?method=POST', { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: targetUrl, headers: headers, body: body })
        })
        .then(response => response.json())
        .then(data => ({ status: 200, data }))
        .catch(err => ({ status: 500, error: err.message }));
}
```

---

✅ Now you can use this proxy to bypass CORS for **any API request** safely and flexibly.

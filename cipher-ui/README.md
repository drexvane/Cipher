# Cipher UI

This is the standalone frontend for the Cipher data analysis platform. It can be connected to any compatible backend that implements the Cipher API.

## Project Structure

```
cipher-ui/
├── index.html       # Main HTML file
├── style.css        # All styles
├── app.js          # Frontend application logic
├── package.json    # Node.js dependencies (optional)
└── README.md       # This file
```

## Getting Started

### Option 1: Simple HTTP Server (No Build Required)

You can run this UI with any static file server:

```bash
# Using Python
python -m http.server 8080

# Using Node.js http-server
npx http-server -p 8080

# Using PHP
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.

### Option 2: With a Modern Dev Server

```bash
npm install
npm start
```

## Connecting to a Backend

The UI makes API calls to `/api/*` endpoints. You need to configure your backend to:

1. Serve the static files (HTML, CSS, JS)
2. Handle API requests at the `/api/*` path

### Backend API Endpoints Required

The UI expects the following API endpoints:

- `GET /api/status` - Get system status
- `GET /api/sessions` - List all analysis sessions
- `POST /api/ask` - Submit a new question
- `POST /api/reset` - Clear all sessions
- `DELETE /api/sessions/:id` - Delete a specific session
- `POST /api/pipeline/run` - Run data cleaning pipeline
- `GET /api/workspace/tree` - Get workspace file tree
- `GET /api/workspace/file?path=...` - Get file contents
- `POST /api/workspace/load` - Load a dataset from workspace
- `POST /api/upload` - Upload new dataset files

### Example: Connecting to Different Backends

#### Python/Flask Backend
Configure CORS and serve static files:
```python
from flask import Flask, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='../cipher-ui')
CORS(app)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')
```

#### Node.js/Express Backend
```javascript
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, '../cipher-ui')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../cipher-ui/index.html'));
});
```

#### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    
    location / {
        root /path/to/cipher-ui;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://backend:8000;
    }
}
```

## Configuration

### API Base URL

By default, the UI assumes the API is available at the same origin under `/api`. To change this, modify the `api()` function in `app.js`:

```javascript
async function api(method, path, body) {
    const BASE_URL = 'https://your-backend-api.com'; // Add this
    const options = { method, headers: {} };
    // ... rest of the function
    const response = await fetch(BASE_URL + path, options); // Update this line
}
```

## Features

- 📊 Interactive data analysis dashboard
- 💬 Session-based question answering
- 📁 Workspace file browser
- 🎨 Light/Dark theme support
- 📈 Plotly.js chart rendering
- 🔍 Real-time data profiling
- ⚙️ Data cleaning pipeline controls

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Dependencies

The UI uses CDN-hosted dependencies:
- Plotly.js 2.35.2 (charts)
- Google Fonts (DM Sans, DM Mono)

No build step or package manager is required unless you want to:
- Bundle dependencies locally
- Use a development server with hot reload
- Optimize for production

## Development

### Local Development

1. Make sure your backend is running
2. Start a local server in the `cipher-ui` directory
3. Open the app in your browser
4. Changes to HTML/CSS/JS will require a browser refresh

### Production Build

For production, you may want to:

1. Minify CSS and JavaScript
2. Host dependencies locally instead of using CDN
3. Enable gzip compression on your server
4. Add caching headers

Example production build script (optional):

```bash
# Install build tools
npm install --save-dev clean-css-cli uglify-js

# Minify
npx clean-css-cli -o style.min.css style.css
npx uglifyjs app.js -o app.min.js -c -m

# Update index.html to use minified files
```

## License

Part of the Cipher project.

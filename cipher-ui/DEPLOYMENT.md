# Cipher UI Deployment Guide

This guide explains how to deploy the Cipher UI to different hosting platforms and connect it to your backend.

## Quick Start

The Cipher UI is a static web application that can be deployed anywhere that serves HTML, CSS, and JavaScript files. The only requirement is that your backend API is accessible from the UI.

## Deployment Options

### 1. Same Server as Backend

The simplest option is to serve the UI from your backend application.

#### Flask (Python)
```python
from flask import Flask, send_from_directory
import os

app = Flask(__name__)

# Serve static UI files
UI_DIR = os.path.join(os.path.dirname(__file__), 'cipher-ui')

@app.route('/')
def index():
    return send_from_directory(UI_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(UI_DIR, path)):
        return send_from_directory(UI_DIR, path)
    # If file doesn't exist, serve index.html (for SPA routing)
    return send_from_directory(UI_DIR, 'index.html')

# Your API routes
@app.route('/api/status')
def api_status():
    return {"status": "ok"}
```

#### Express (Node.js)
```javascript
const express = require('express');
const path = require('path');

const app = express();

// Serve static UI files
app.use(express.static(path.join(__dirname, 'cipher-ui')));

// API routes
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok' });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'cipher-ui', 'index.html'));
});

app.listen(3000);
```

### 2. Separate Static Hosting with Reverse Proxy

Deploy the UI to a CDN or static host, and use a reverse proxy to connect to your backend.

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Serve UI files
    root /var/www/cipher-ui;
    index index.html;

    # Enable gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Apache Configuration
```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    DocumentRoot /var/www/cipher-ui

    <Directory /var/www/cipher-ui>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # Rewrite rules for SPA
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    # Proxy API requests
    ProxyPass /api/ http://localhost:8000/api/
    ProxyPassReverse /api/ http://localhost:8000/api/
</VirtualHost>
```

### 3. Cloud Platform Deployments

#### Netlify

1. Create `netlify.toml` in `cipher-ui/`:

```toml
[build]
  publish = "."

[[redirects]]
  from = "/api/*"
  to = "https://your-backend-api.com/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

2. Deploy:
```bash
cd cipher-ui
npm install -g netlify-cli
netlify deploy --prod
```

#### Vercel

1. Create `vercel.json` in `cipher-ui/`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://your-backend-api.com/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

2. Deploy:
```bash
cd cipher-ui
npm install -g vercel
vercel --prod
```

#### AWS S3 + CloudFront

1. Build and upload:
```bash
aws s3 sync cipher-ui/ s3://your-bucket-name/ --delete
```

2. Configure CloudFront:
   - Origin: Your S3 bucket
   - Behaviors:
     - `/api/*` → Forward to your API backend (API Gateway or ALB)
     - `/*` → Serve from S3

3. Set error pages to redirect to `index.html` for SPA routing

#### Google Cloud Storage

```bash
# Upload files
gsutil -m cp -r cipher-ui/* gs://your-bucket-name/

# Make bucket public
gsutil iam ch allUsers:objectViewer gs://your-bucket-name

# Set up load balancer to route /api/* to backend
```

### 4. Docker Deployment

Create `Dockerfile` in `cipher-ui/`:

```dockerfile
FROM nginx:alpine

# Copy UI files
COPY . /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

Create `nginx.conf`:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Build and run:
```bash
docker build -t cipher-ui .
docker run -d -p 8080:80 cipher-ui
```

Or use `docker-compose.yml`:

```yaml
version: '3.8'

services:
  ui:
    build: ./cipher-ui
    ports:
      - "80:80"
    depends_on:
      - backend
    environment:
      - API_URL=http://backend:8000

  backend:
    build: .
    ports:
      - "8000:8000"
```

## CORS Configuration

If your UI and backend are on different domains, configure CORS on your backend:

### Python/Flask
```python
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=['https://your-ui-domain.com'])
```

### Node.js/Express
```javascript
const cors = require('cors');

app.use(cors({
    origin: 'https://your-ui-domain.com',
    credentials: true
}));
```

### FastAPI (Python)
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-ui-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Environment-Specific Configuration

For different environments (dev, staging, production), create different config files:

**config.dev.js:**
```javascript
window.CIPHER_CONFIG = {
    API_BASE_URL: 'http://localhost:8000',
    DEBUG: true
};
```

**config.prod.js:**
```javascript
window.CIPHER_CONFIG = {
    API_BASE_URL: 'https://api.production.com',
    DEBUG: false
};
```

Then include the appropriate config in your build process or nginx configuration.

## Performance Optimization

### 1. Enable Compression
```nginx
gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
gzip_min_length 1000;
```

### 2. Set Cache Headers
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. Use HTTP/2
```nginx
listen 443 ssl http2;
```

### 4. Minify Assets (Optional)
```bash
npm run build
```

## Security Considerations

1. **HTTPS**: Always use HTTPS in production
2. **CSP Headers**: Add Content Security Policy
   ```nginx
   add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://cdn.plot.ly; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;";
   ```
3. **API Authentication**: Implement authentication on your backend
4. **Rate Limiting**: Add rate limiting to prevent abuse

## Monitoring

Set up monitoring for:
- API response times
- Error rates
- User sessions
- Resource loading times

Example with Google Analytics in `index.html`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## Troubleshooting

### UI Can't Connect to API
1. Check CORS configuration
2. Verify API_BASE_URL in config
3. Check browser console for errors
4. Test API endpoints directly with curl

### 404 Errors on Refresh
Configure your server to serve `index.html` for all routes (SPA routing)

### Assets Not Loading
1. Check file paths in index.html
2. Verify static file serving configuration
3. Check browser console for 404 errors

## Support

For issues specific to deployment, check:
- Backend API documentation
- Web server documentation (Nginx, Apache, etc.)
- Cloud platform documentation

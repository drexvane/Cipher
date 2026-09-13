# UI Migration Guide

This guide helps you move the Cipher UI to a different backend.

## What Was Done

The UI has been extracted from the main project into a standalone `cipher-ui/` folder with:

```
cipher-ui/
├── index.html              # Main HTML page
├── style.css               # All styles (light/dark theme)
├── app.js                  # Frontend JavaScript logic
├── package.json            # Optional dev dependencies
├── config.example.js       # Configuration template
├── .gitignore             # Node.js ignore rules
├── README.md              # Setup instructions
├── DEPLOYMENT.md          # Platform-specific deployment guides
└── MIGRATION_GUIDE.md     # This file
```

## Quick Migration Steps

### Step 1: Copy the UI Folder

Copy the entire `cipher-ui/` folder to your new project:

```bash
# From the Cipher project root
cp -r cipher-ui /path/to/your/new/backend/
```

### Step 2: Configure API Endpoint

If your backend is on a different domain, create a config file:

```bash
cd /path/to/your/new/backend/cipher-ui
cp config.example.js config.js
```

Edit `config.js`:
```javascript
window.CIPHER_CONFIG = {
    API_BASE_URL: 'http://localhost:5000',  // Your backend URL
    DEBUG: true  // Enable for development
};
```

Then add it to `index.html` before `app.js`:
```html
<script src="config.js"></script>
<script src="app.js"></script>
```

### Step 3: Set Up Your Backend

Your backend must implement these API endpoints:

#### Core Endpoints
- `GET /api/status` - System status
- `GET /api/sessions` - List analysis sessions
- `POST /api/ask` - Submit question
- `DELETE /api/sessions/:id` - Delete session

#### Workspace Endpoints
- `GET /api/workspace/tree` - File tree
- `GET /api/workspace/file?path=...` - File contents
- `POST /api/workspace/load` - Load dataset

#### Pipeline Endpoints
- `POST /api/pipeline/run` - Run cleaning pipeline
- `POST /api/upload` - Upload files
- `POST /api/reset` - Clear sessions

### Step 4: Serve the UI

Choose a serving method based on your backend:

#### Python/Flask
```python
from flask import Flask, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='cipher-ui')
CORS(app)  # Enable if UI is on different domain

@app.route('/')
def index():
    return send_from_directory('cipher-ui', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('cipher-ui', path)

# Your API routes here...
```

#### Node.js/Express
```javascript
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());  // Enable if UI is on different domain
app.use(express.static(path.join(__dirname, 'cipher-ui')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'cipher-ui/index.html'));
});

// Your API routes here...
```

#### Go (Gin)
```go
package main

import (
    "github.com/gin-gonic/gin"
    "github.com/gin-contrib/cors"
)

func main() {
    r := gin.Default()
    
    // Enable CORS if needed
    r.Use(cors.Default())
    
    // Serve static files
    r.Static("/", "./cipher-ui")
    
    // Your API routes here...
    
    r.Run(":8080")
}
```

#### Java/Spring Boot
```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/cipher-ui/");
    }
    
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins("*");
    }
}
```

### Step 5: Test the Integration

1. Start your backend server
2. Open `http://localhost:YOUR_PORT` in a browser
3. Check browser console for any API errors
4. Verify all features work:
   - File upload
   - Question asking
   - Workspace browsing
   - Session management

## API Response Format Examples

Your backend should return responses in these formats:

### GET /api/status
```json
{
    "has_active_log": true,
    "dataset_name": "sales_data.csv",
    "row_count": 10000,
    "col_count": 15,
    "validation_status": "passed",
    "profile": {
        "measures": ["revenue", "quantity"],
        "dimensions": ["product", "region"],
        "temporal": ["date"]
    }
}
```

### POST /api/ask
```json
{
    "ok": true,
    "summary": "The total revenue is $1.2M",
    "model": "gpt-4",
    "tiles": [
        {"label": "Total Revenue", "value": "$1.2M", "note": "2024 YTD"},
        {"label": "Avg Order", "value": "$120", "note": "Mean value"}
    ],
    "primary_chart": {
        "data": [...],
        "layout": {...}
    },
    "takeaways": ["Revenue increased 15% YoY"],
    "plan": {"query": "SELECT ...", "steps": [...]}
}
```

### GET /api/sessions
```json
{
    "sessions": [
        {
            "id": "abc123",
            "subject": "What is total revenue?",
            "question": "What is total revenue?",
            "time": "2024-01-15T10:30:00Z",
            "result": { /* answer object */ }
        }
    ]
}
```

## Common Issues

### CORS Errors
If you see CORS errors in the browser console:

1. Add CORS middleware to your backend
2. Allow these headers: `Content-Type`, `Authorization`
3. Allow these methods: `GET`, `POST`, `DELETE`

### API Not Found (404)
1. Verify your backend is running
2. Check API_BASE_URL in config.js
3. Test API endpoints directly with curl:
   ```bash
   curl http://localhost:5000/api/status
   ```

### Charts Not Rendering
The UI uses Plotly.js for charts. Ensure your API returns Plotly-compatible JSON:
```json
{
    "primary_chart": {
        "data": [
            {
                "x": [1, 2, 3],
                "y": [10, 20, 15],
                "type": "scatter"
            }
        ],
        "layout": {
            "title": "Sales Trend"
        }
    }
}
```

### Session Not Persisting
The UI stores theme preferences in localStorage. For sessions, ensure your backend:
1. Returns unique session IDs
2. Persists sessions across requests
3. Returns session history on GET /api/sessions

## Customization

### Branding
Edit `index.html` and update:
- Page title: `<title>Your App Name</title>`
- Logo: Change "CIPHER" text in `.wordmark`
- Favicon: Add `<link rel="icon" href="favicon.ico">`

### Styling
Edit `style.css`:
- Colors: Update CSS custom properties in `:root`
- Fonts: Change `--mono` and `--sans` variables
- Theme: Modify `html[data-theme="dark"]` section

### Features
Edit `app.js`:
- Remove features: Comment out event listeners and UI sections
- Add features: Follow existing patterns for API calls and rendering
- Change behavior: Modify functions like `submitQuestion()`, `renderAnswer()`

## Testing Checklist

- [ ] Upload CSV file
- [ ] Ask a question
- [ ] View chart visualization
- [ ] Browse workspace files
- [ ] Open file in editor
- [ ] Load dataset from workspace
- [ ] Delete a session
- [ ] Run cleaning pipeline
- [ ] Switch between light/dark themes
- [ ] Resize sidebar
- [ ] Toggle sidebar visibility

## Getting Help

If you encounter issues:
1. Check browser console for errors
2. Review DEPLOYMENT.md for your platform
3. Test API endpoints independently
4. Verify response formats match examples above

## Next Steps

After successful migration:
1. Customize branding and styling
2. Add authentication if needed
3. Set up production deployment (see DEPLOYMENT.md)
4. Configure monitoring and analytics
5. Optimize performance (caching, CDN, etc.)

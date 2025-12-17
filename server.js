const express = require('express');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const app = express();

// --- CONFIGURATION ---
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

app.use(express.json());
// Serve the 'public' folder (where index.html lives)
app.use(express.static(path.join(__dirname, 'public')));


// --- ROUTES ---

// 1. HOMEPAGE (The Viewer)
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("ERROR: 'public/index.html' is missing. Check your GitHub repo!");
    }
});

// 2. 360 UPLOAD API (POST)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file sent" });

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path);
    
    // Delete local temp file
    fs.unlinkSync(req.file.path);

    // Generate Viewer Link
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const viewerUrl = `${protocol}://${host}/?img=${result.secure_url}`;

    res.json({ 
      success: true, 
      image_url: result.secure_url,
      viewer_link: viewerUrl 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. RECTANGLE GENERATOR API (GET)
// Usage: /api/rect?w=500&h=300&c=red
app.get('/api/rect', (req, res) => {
    try {
        const width = parseInt(req.query.w) || 200;
        const height = parseInt(req.query.h) || 200;
        const color = req.query.c || '#000000'; // Default black

        new Jimp(width, height, color, (err, image) => {
            if (err) {
                return res.status(500).send("Error generating image");
            }
            
            // Set header so browser knows it's an image
            res.setHeader('Content-Type', 'image/jpeg');
            
            // Stream the buffer back directly
            image.quality(80).getBuffer(Jimp.MIME_JPEG, (err, buffer) => {
                if (err) return res.status(500).send(err);
                res.send(buffer);
            });
        });
    } catch (e) {
        res.status(500).send("Failed: " + e.message);
    }
});

// --- START SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

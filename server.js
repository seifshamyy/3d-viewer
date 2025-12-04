const express = require('express');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const app = express();

// 1. Setup Cloudinary (Reads from Railway Env Variables)
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

app.use(express.static('public')); // Serve the viewer
app.use(express.json());

// 2. THE API ENDPOINT
// Send a POST request here with a file to get your link
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file sent" });

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path);
    
    // Clean up local file
    fs.unlinkSync(req.file.path);

    // Generate your Viewer Link
    // NOTE: This assumes your app is at the root domain
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
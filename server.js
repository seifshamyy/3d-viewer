const express = require('express');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

// --- VIDEO TOOLS ---
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

// --- CONFIGURATION ---
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

// Increase limit to 50mb because sending back video frames is heavy
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));


// --- HELPER: LINE DRAWING MATH ---
function drawLine(image, x0, y0, x1, y1, color) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
        if (x0 >= 0 && x0 < image.bitmap.width && y0 >= 0 && y0 < image.bitmap.height) {
             image.setPixelColor(color, x0, y0);
        }
        if (x0 === x1 && y0 === y1) break;
        let e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}


// --- ROUTES ---

// 1. HOMEPAGE (The Viewer)
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send("Error: public/index.html missing.");
});

// 2. 360 UPLOAD API (Cloudinary)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file sent" });
    const result = await cloudinary.uploader.upload(req.file.path);
    fs.unlinkSync(req.file.path);
    
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    
    res.json({ 
      success: true, 
      image_url: result.secure_url, 
      viewer_link: `${protocol}://${host}/?img=${result.secure_url}` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. RECTANGLE API (Jimp)
app.get('/api/rect', (req, res) => {
    try {
        const width = parseInt(req.query.w) || 200;
        const height = parseInt(req.query.h) || 200;
        const color = req.query.c || '#000000'; 

        new Jimp(width, height, color, (err, image) => {
            if (err) throw err;
            res.setHeader('Content-Type', 'image/jpeg');
            image.quality(80).getBuffer(Jimp.MIME_JPEG, (err, buffer) => {
                if (err) throw err;
                res.send(buffer);
            });
        });
    } catch (e) {
        res.status(500).send("Failed: " + e.message);
    }
});

// 4. LINE SKEW API (Jimp + Math)
app.get('/api/lines', (req, res) => {
    try {
        const width = parseInt(req.query.w) || 500;
        const height = parseInt(req.query.h) || 500;
        const lineColor = 0x000000FF; // Black
        const bgColor = 0xFFFFFFFF;   // White

        new Jimp(width, height, bgColor, (err, image) => {
            if (err) throw err;

            if (req.query.x1) {
                drawLine(image, Number(req.query.x1), Number(req.query.y1), Number(req.query.x2), Number(req.query.y2), lineColor);
            }
            if (req.query.x3) {
                drawLine(image, Number(req.query.x3), Number(req.query.y3), Number(req.query.x4), Number(req.query.y4), lineColor);
            }

            res.setHeader('Content-Type', 'image/jpeg');
            image.quality(90).getBuffer(Jimp.MIME_JPEG, (e, b) => {
                if (e) throw e;
                res.send(b);
            });
        });
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});

// 5. VIDEO FRAME API (FFmpeg)
app.post('/api/video-frames', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No video sent" });

    const videoPath = req.file.path;
    const outputFolder = path.join(__dirname, 'uploads', 'frames_' + Date.now());
    
    if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder);

    ffmpeg(videoPath)
        .outputOptions('-vf', 'fps=0.5') // 1 frame every 2 seconds
        .output(path.join(outputFolder, 'frame-%d.jpg'))
        .on('end', () => {
            const files = fs.readdirSync(outputFolder);
            const frameArray = [];

            files.forEach(file => {
                const filePath = path.join(outputFolder, file);
                const fileData = fs.readFileSync(filePath);
                frameArray.push(`data:image/jpeg;base64,${fileData.toString('base64')}`);
                fs.unlinkSync(filePath);
            });

            fs.rmdirSync(outputFolder);
            fs.unlinkSync(videoPath);

            res.json({ success: true, count: frameArray.length, frames: frameArray });
        })
        .on('error', (err) => {
            console.error(err);
            res.status(500).json({ error: "Video processing failed" });
        })
        .run();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

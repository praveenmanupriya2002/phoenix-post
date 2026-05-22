require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const app = express();

// ----------------- CORS (Netlify frontend + local dev) -----------------
const allowedOrigins = [
  'https://thephoenixarc.netlify.app',
  'https://phoenixarc.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ---------- AI Client (Groq) ----------
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

// ---------- Directories ----------
const OUTPUT_DIR = path.join(__dirname, 'output_images');
const FONTS_DIR = path.join(__dirname, 'fonts');
const LOGO_PATH = path.join(__dirname, 'logo.png');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
app.use('/images', express.static(OUTPUT_DIR));

// ---------- Register Fonts ----------
try {
  registerFont(path.join(FONTS_DIR, 'Poppins-Bold.ttf'), { family: 'Poppins-Bold' });
  registerFont(path.join(FONTS_DIR, 'Poppins-Regular.ttf'), { family: 'Poppins-Regular' });
  console.log('✅ Poppins fonts loaded.');
} catch(e) {
  console.warn('⚠️ Poppins missing – using system fonts.');
}

// ---------- AI Content Generation ----------
async function generateMotivationalPost(topic) {
  const completion = await openai.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a professional motivational writer for "The Phoenix Arc". 
Always respond in EXACTLY this format:

TITLE: ... (max 8 words, powerful and uppercase style)
BODY: ... (2-3 sentences, inspiring, can use line breaks)
CAPTION: ... (full social media caption – use emojis, line breaks, calls to action like "💬 Comment", "🔁 Share", "❤️ Like". End with 10-15 RELEVANT hashtags)

No extra words, no markdown, no explanations.`
      },
      {
        role: 'user',
        content: `Topic: "${topic}"
Write a short, powerful motivation (title max 8 words, body 2-3 sentences).
Then write a STRONG, EMOTIONAL caption. Include line breaks, emojis, a call to action, and 10-15 specific hashtags.`
      }
    ],
    temperature: 0.85,
  });

  const raw = completion.choices[0].message.content;
  const titleMatch = raw.match(/^TITLE:\s*(.+)/im);
  const bodyMatch = raw.match(/BODY:\s*([\s\S]+?)(?=CAPTION:|$)/i);
  const captionMatch = raw.match(/CAPTION:\s*([\s\S]+)/i);

  if (!titleMatch || !bodyMatch || !captionMatch) {
    throw new Error('Invalid AI response');
  }

  return {
    title: titleMatch[1].trim(),
    body: bodyMatch[1].trim(),
    caption: captionMatch[1].trim()
  };
}

// ---------- Pixabay Background ----------
async function fetchBackgroundImage(topic) {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) throw new Error('Missing Pixabay API key');
  const keywords = topic.split(' ').slice(0, 3).join(' ');
  const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(keywords)}&image_type=photo&orientation=vertical&per_page=10`;
  const res = await axios.get(url);
  if (!res.data.hits.length) {
    const fallback = await axios.get(`https://pixabay.com/api/?key=${apiKey}&q=nature&image_type=photo&orientation=vertical`);
    return fallback.data.hits[0].largeImageURL;
  }
  return res.data.hits[Math.floor(Math.random() * res.data.hits.length)].largeImageURL;
}

// ---------- Helper Functions ----------
function roundedRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  return ctx;
}

function getWrappedLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = current + ' ' + words[i];
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = words[i];
    } else {
      current = test;
    }
  }
  lines.push(current);
  return lines;
}

async function renderMotivationalImage(title, body, bgImageUrl, logoPath, outputPath) {
  const width = 1080;
  let currentY = 80;
  const horizontalMargin = 80;

  // Measure title
  const titleFontSize = 76;
  const titleLineHeight = 95;
  const titleMaxWidth = width - 2 * horizontalMargin;
  const tempCtx = createCanvas(width, 100).getContext('2d');
  tempCtx.font = `bold ${titleFontSize}px "Poppins-Bold", Arial, sans-serif`;
  const titleLines = getWrappedLines(tempCtx, title.toUpperCase(), titleMaxWidth);
  const titleHeight = titleLines.length * titleLineHeight;

  // Measure body
  const bodyFontSize = 40;
  const bodyLineHeight = 62;
  const bodyMaxWidth = 780;
  tempCtx.font = `${bodyFontSize}px "Poppins-Regular", Arial, sans-serif`;
  const bodyLines = getWrappedLines(tempCtx, body, bodyMaxWidth);
  const totalBodyTextHeight = bodyLines.length * bodyLineHeight;
  const boxPadding = 50;
  const boxHeight = totalBodyTextHeight + 2 * boxPadding;

  // Logo
  let logoHeight = 0;
  if (fs.existsSync(logoPath)) {
    const logoImg = await loadImage(logoPath);
    const logoWidth = 220;
    logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    logoHeight += 30;
  } else {
    logoHeight = 70;
  }

  const ctaHeight = 50;
  const totalHeight = currentY + titleHeight + 40 + boxHeight + 55 + logoHeight + 25 + ctaHeight + 80;
  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext('2d');

  // Background
  const bg = await loadImage(bgImageUrl);
  const bgWidth = bg.width;
  const bgHeight = bg.height;
  const scale = Math.max(width / bgWidth, totalHeight / bgHeight);
  const scaledWidth = bgWidth * scale;
  const scaledHeight = bgHeight * scale;
  const dx = (width - scaledWidth) / 2;
  const dy = (totalHeight - scaledHeight) / 2;
  ctx.drawImage(bg, dx, dy, scaledWidth, scaledHeight);

  // Overlay
  const grad = ctx.createLinearGradient(0, 0, 0, totalHeight);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, totalHeight);

  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'center';

  // Title
  ctx.font = `bold ${titleFontSize}px "Poppins-Bold", Arial, sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  let y = currentY + titleLineHeight / 2;
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, y);
    y += titleLineHeight;
  }
  currentY += titleHeight + 40;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 100, currentY - 10);
  ctx.lineTo(width / 2 + 100, currentY - 10);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#E8B86B';
  ctx.stroke();
  currentY += 20;

  // Body box
  const boxX = (width - bodyMaxWidth - 2 * boxPadding) / 2;
  const boxY = currentY;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, bodyMaxWidth + 2 * boxPadding, boxHeight, 32);
  ctx.fill();
  ctx.font = `${bodyFontSize}px "Poppins-Regular", Arial, sans-serif`;
  ctx.fillStyle = '#F8F9FA';
  ctx.shadowBlur = 10;
  const textStartY = boxY + boxPadding + (boxHeight - totalBodyTextHeight) / 2 + 8;
  for (let i = 0; i < bodyLines.length; i++) {
    ctx.fillText(bodyLines[i], width / 2, textStartY + i * bodyLineHeight);
  }
  currentY += boxHeight + 55;

  // Logo
  if (fs.existsSync(logoPath)) {
    ctx.beginPath();
    ctx.moveTo(width / 2 - 110, currentY - 25);
    ctx.lineTo(width / 2 + 110, currentY - 25);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#E8B86B';
    ctx.stroke();
    const logo = await loadImage(logoPath);
    const logoWidth = 220;
    const logoDrawHeight = (logo.height / logo.width) * logoWidth;
    ctx.drawImage(logo, (width - logoWidth) / 2, currentY, logoWidth, logoDrawHeight);
    currentY += logoDrawHeight + 25;
  } else {
    ctx.font = `bold 36px "Poppins-Regular", sans-serif`;
    ctx.fillStyle = '#E8B86B';
    ctx.fillText('THE PHOENIX ARC', width / 2, currentY + 30);
    currentY += 70;
  }

  // CTA
  ctx.font = `italic 26px "Poppins-Regular", sans-serif`;
  ctx.fillStyle = '#E8B86B';
  ctx.fillText('✦ Share this to inspire someone ✦', width / 2, currentY + 45);

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.96 });
  fs.writeFileSync(outputPath, buffer);
}

// ---------- ImgBB Upload ----------
async function uploadToImgBB(imageBuffer, apiKey) {
  const form = new FormData();
  form.append('image', imageBuffer.toString('base64'));
  const response = await axios.post('https://api.imgbb.com/1/upload', form, {
    params: { key: apiKey },
    headers: form.getHeaders()
  });
  return response.data.data.url;
}

// ---------- API Endpoint (FIXED) ----------
app.post('/api/generate-post', async (req, res) => {
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'Topic required' });

  try {
    console.log(`Generating post for: ${topic}`);
    const { title, body, caption } = await generateMotivationalPost(topic);
    const bgUrl = await fetchBackgroundImage(topic);
    const imageName = `phoenix_${Date.now()}.jpg`;
    const imagePath = path.join(OUTPUT_DIR, imageName);
    await renderMotivationalImage(title, body, bgUrl, LOGO_PATH, imagePath);

    // Read the generated image buffer
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Try to upload to ImgBB (permanent storage)
    let finalImageUrl = null;
    const imgbbKey = process.env.IMGBB_API_KEY;
    if (imgbbKey) {
      try {
        finalImageUrl = await uploadToImgBB(imageBuffer, imgbbKey);
        console.log('✅ Uploaded to ImgBB:', finalImageUrl);
        // Delete local file after successful upload
        fs.unlinkSync(imagePath);
      } catch (uploadErr) {
        console.error('ImgBB upload failed:', uploadErr.message);
        // Fallback to local serving (if Railway permits)
        const backendUrl = process.env.BACKEND_URL || `https://${req.get('host')}`;
        finalImageUrl = `${backendUrl}/images/${imageName}`;
      }
    } else {
      console.warn('⚠️ IMGBB_API_KEY not set, using local file (may be deleted on restart)');
      const backendUrl = process.env.BACKEND_URL || `https://${req.get('host')}`;
      finalImageUrl = `${backendUrl}/images/${imageName}`;
    }

    res.json({
      success: true,
      title,
      body,
      caption,
      imageUrl: finalImageUrl,          // permanent HTTPS URL
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Download endpoint (if local file exists)
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const safePath = path.join(OUTPUT_DIR, path.basename(filename));
  if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'File not found' });
  res.download(safePath, filename);
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.json({ message: 'Phoenix Arc API is running. Use POST /api/generate-post' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🔥 Phoenix Arc server running on port ${PORT}`));
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();

// ----------------- CORS (Allows Netlify + local dev) -----------------
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

// No app.options('*', ...) needed – cors() handles preflight

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
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = await loadImage(bgImageUrl);
  ctx.drawImage(bg, 0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(0,0,0,0.7)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.font = 'bold 76px "Poppins-Bold", "Arial", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 16;
  ctx.textAlign = 'center';
  
  const titleMaxWidth = width - 160;
  const titleLines = getWrappedLines(ctx, title.toUpperCase(), titleMaxWidth);
  const titleLineHeight = 95;
  const titleStartY = 180;
  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], width/2, titleStartY + i * titleLineHeight);
  }
  const titleTotalHeight = titleLines.length * titleLineHeight;
  
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(width/2 - 90, titleStartY + titleTotalHeight - 25);
  ctx.lineTo(width/2 + 90, titleStartY + titleTotalHeight - 25);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#E8B86B';
  ctx.stroke();

  ctx.font = '40px "Poppins-Regular", "Arial", sans-serif';
  ctx.shadowBlur = 0;
  const bodyLineHeight = 62;
  const maxBodyWidth = width - 200;
  const bodyLines = getWrappedLines(ctx, body, maxBodyWidth);
  const bodyHeight = bodyLines.length * bodyLineHeight;
  
  const boxPadding = 40;
  const boxWidth = maxBodyWidth + 70;
  const boxHeight = bodyHeight + (boxPadding * 2);
  
  const reservedBottom = 180;
  const freeAreaStart = titleStartY + titleTotalHeight + 40;
  const freeAreaEnd = height - reservedBottom;
  const freeAreaHeight = freeAreaEnd - freeAreaStart;
  const boxY = freeAreaStart + (freeAreaHeight - boxHeight) / 2;
  const finalBoxY = Math.max(freeAreaStart, boxY);
  
  const boxX = (width - boxWidth) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  roundedRect(ctx, boxX, finalBoxY, boxWidth, boxHeight, 28);
  ctx.fill();
  
  const textStartY = finalBoxY + boxPadding + (boxHeight - (2 * boxPadding) - bodyHeight) / 2;
  ctx.fillStyle = '#F8F9FA';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  for (let i = 0; i < bodyLines.length; i++) {
    ctx.fillText(bodyLines[i], width/2, textStartY + i * bodyLineHeight);
  }

  let logoBottomY = finalBoxY + boxHeight + 50;
  if (fs.existsSync(logoPath)) {
    const logo = await loadImage(logoPath);
    const maxLogoWidth = 200;
    const logoWidth = Math.min(logo.width, maxLogoWidth);
    const logoHeightLogo = (logo.height / logo.width) * logoWidth;
    const logoX = (width - logoWidth) / 2;
    const logoY = finalBoxY + boxHeight + 40;
    const maxLogoY = height - logoHeightLogo - 70;
    const finalLogoY = Math.min(logoY, maxLogoY);
    
    ctx.beginPath();
    ctx.moveTo(width/2 - 100, finalLogoY - 20);
    ctx.lineTo(width/2 + 100, finalLogoY - 20);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#E8B86B';
    ctx.stroke();
    
    ctx.shadowBlur = 0;
    ctx.drawImage(logo, logoX, finalLogoY, logoWidth, logoHeightLogo);
    logoBottomY = finalLogoY + logoHeightLogo;
  } else {
    ctx.font = '32px "Poppins-Regular", sans-serif';
    ctx.fillStyle = '#E8B86B';
    ctx.fillText('The Phoenix Arc', width/2, finalBoxY + boxHeight + 50);
    logoBottomY = finalBoxY + boxHeight + 80;
  }

  ctx.font = 'italic 36px "Poppins-Regular", sans-serif';
  ctx.fillStyle = '#E8B86B';
  ctx.shadowBlur = 6;
  let ctaY = logoBottomY + 35;
  if (ctaY + 50 > height) ctaY = height - 60;
  ctx.fillText('✦ Share this to inspire someone ✦', width/2, ctaY);

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
  fs.writeFileSync(outputPath, buffer);
}

// ---------- API Endpoint ----------
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
    
    res.json({
      success: true,
      title,
      body,
      caption,
      imageUrl: `/images/${imageName}`,
      downloadUrl: `/api/download/${imageName}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Download endpoint
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
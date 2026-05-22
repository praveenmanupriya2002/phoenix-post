require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();

// ----------------- CORS -----------------
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

// ---------- AI Client ----------
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
BODY: ... (Maximum 5 lines AND max 231 characters including spaces. Keep it concise and impactful.)
CAPTION: ... (full social media caption with emojis, line breaks, CTA and hashtags)

No extra words, no markdown, no explanations.`
      },
      {
        role: 'user',
        content: `Topic: "${topic}"
Write a short, powerful motivation.
- TITLE: max 8 words
- BODY: Maximum 5 lines & max 231 characters with spaces.
- CAPTION: Strong emotional caption with emojis, line breaks, call to action and 10-15 hashtags.`
      }
    ],
    temperature: 0.82,
    max_tokens: 600,
  });

  const raw = completion.choices[0].message.content;
  const titleMatch = raw.match(/^TITLE:\s*(.+)/im);
  const bodyMatch = raw.match(/BODY:\s*([\s\S]+?)(?=CAPTION:|$)/i);
  const captionMatch = raw.match(/CAPTION:\s*([\s\S]+)/i);

  if (!titleMatch || !bodyMatch || !captionMatch) {
    throw new Error('Invalid AI response');
  }

  let body = bodyMatch[1].trim();
  // Enforce 231 characters including spaces
  body = enforceCharLimit(body, 231);

  // Keep original line breaks (AI may insert \n)
  const bodyLines = body.split('\n').filter(line => line.trim() !== '');
  if (bodyLines.length > 5) {
    body = bodyLines.slice(0, 5).join('\n');
  }

  return {
    title: titleMatch[1].trim(),
    body: body,
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

// ==================== MAIN RENDER FUNCTION (FIXED) ====================
async function renderMotivationalImage(title, body, bgImageUrl, logoPath, outputPath) {
  const width = 1080;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bg = await loadImage(bgImageUrl);
  ctx.drawImage(bg, 0, 0, width, height);

  // Overlay
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // ==================== TITLE ====================
  ctx.font = 'bold 76px "Poppins-Bold", Arial, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'center';

  const titleMaxWidth = width - 160;
  const titleLines = getWrappedLines(ctx, title.toUpperCase(), titleMaxWidth);
  const titleLineHeight = 95;
  const titleStartY = 165;

  titleLines.forEach((line, i) => {
    ctx.fillText(line, width/2, titleStartY + i * titleLineHeight);
  });

  const titleTotalHeight = titleLines.length * titleLineHeight;

  // Title underline
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(width/2 - 100, titleStartY + titleTotalHeight - 18);
  ctx.lineTo(width/2 + 100, titleStartY + titleTotalHeight - 18);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#E8B86B';
  ctx.stroke();

  // ==================== BODY BOX ====================
  ctx.font = '40px "Poppins-Regular", Arial, sans-serif';
  
  let bodyLines = body.split('\n').filter(line => line.trim() !== '');
  if (bodyLines.length > 5) bodyLines = bodyLines.slice(0, 5);

  const bodyLineHeight = 62;
  const totalBodyHeight = bodyLines.length * bodyLineHeight;

  const boxPadding = 55;
  const maxBodyWidth = 780;
  const boxWidth = maxBodyWidth + 100;
  const boxHeight = totalBodyHeight + (boxPadding * 2);

  const boxX = (width - boxWidth) / 2;
  const boxY = titleStartY + titleTotalHeight + 70;

  // Draw box
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 32);
  ctx.fill();

  // ==================== BODY TEXT - PERFECT CENTER ====================
  ctx.fillStyle = '#F8F9FA';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 12;
  ctx.textAlign = 'center';

  const boxCenterY = boxY + (boxHeight / 2);
  const textStartY = boxCenterY - (totalBodyHeight / 2) + (bodyLineHeight / 3);

  bodyLines.forEach((line, i) => {
    ctx.fillText(line.trim(), width / 2, textStartY + i * bodyLineHeight);
  });

  // ==================== LOGO ====================
  let logoY = boxY + boxHeight + 55;

  if (fs.existsSync(logoPath)) {
    const logo = await loadImage(logoPath);
    const logoWidth = 220;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    const logoX = (width - logoWidth) / 2;

    ctx.beginPath();
    ctx.moveTo(width/2 - 110, logoY - 25);
    ctx.lineTo(width/2 + 110, logoY - 25);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#E8B86B';
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
    logoY += logoHeight + 28;
  } else {
    ctx.font = 'bold 36px "Poppins-Regular", sans-serif';
    ctx.fillStyle = '#E8B86B';
    ctx.fillText('THE PHOENIX ARC', width/2, logoY + 35);
    logoY += 75;
  }

  

  // Save
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.96 });
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
app.get('/', (req, res) => res.json({ message: 'Phoenix Arc API is running.' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🔥 Phoenix Arc server running on port ${PORT}`));
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
  const width = 1080;                     // fixed width (Instagram‑friendly)
  let currentY = 80;                      // top margin
  const horizontalMargin = 80;             // left/right margins for text

  // ---------- 1. Measure title ----------
  const titleFontSize = 76;
  const titleLineHeight = 95;
  const titleMaxWidth = width - 2 * horizontalMargin;
  const tempCtx = createCanvas(width, 100).getContext('2d');
  tempCtx.font = `bold ${titleFontSize}px "Poppins-Bold", Arial, sans-serif`;
  const titleLines = getWrappedLines(tempCtx, title.toUpperCase(), titleMaxWidth);
  const titleHeight = titleLines.length * titleLineHeight;

  // ---------- 2. Measure body text box ----------
  const bodyFontSize = 40;
  const bodyLineHeight = 62;
  const bodyMaxWidth = 780;
  tempCtx.font = `${bodyFontSize}px "Poppins-Regular", Arial, sans-serif`;
  const bodyLines = getWrappedLines(tempCtx, body, bodyMaxWidth);
  const totalBodyTextHeight = bodyLines.length * bodyLineHeight;
  const boxPadding = 50;
  const boxHeight = totalBodyTextHeight + 2 * boxPadding;

  // ---------- 3. Measure logo ----------
  let logoHeight = 0;
  if (fs.existsSync(logoPath)) {
    const logoImg = await loadImage(logoPath);
    const logoWidth = 220;
    logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    // add small decorative line above logo
    logoHeight += 30;   // line gap + line itself
  } else {
    logoHeight = 70;    // fallback text height
  }

  // ---------- 4. CTA height ----------
  const ctaFontSize = 26;
  const ctaHeight = 50;   // approximate

  // ---------- 5. Calculate total canvas height ----------
  const totalHeight = currentY           // top margin
    + titleHeight                        // title block
    + 40                                 // gap after title
    + boxHeight                          // body box
    + 55                                 // gap before logo
    + logoHeight                         // logo + its line
    + 25                                 // gap before CTA
    + ctaHeight                          // CTA text
    + 80;                                // bottom margin

  // Create canvas with dynamic height
  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext('2d');

  // ---------- 6. Draw background (cover mode) ----------
  const bg = await loadImage(bgImageUrl);
  const bgWidth = bg.width;
  const bgHeight = bg.height;
  const scale = Math.max(width / bgWidth, totalHeight / bgHeight);
  const scaledWidth = bgWidth * scale;
  const scaledHeight = bgHeight * scale;
  const dx = (width - scaledWidth) / 2;
  const dy = (totalHeight - scaledHeight) / 2;
  ctx.drawImage(bg, dx, dy, scaledWidth, scaledHeight);

  // Dark overlay gradient (stretched to new height)
  const grad = ctx.createLinearGradient(0, 0, 0, totalHeight);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, totalHeight);

  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'center';

  // ---------- 7. Draw title ----------
  ctx.font = `bold ${titleFontSize}px "Poppins-Bold", Arial, sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  let y = currentY + titleLineHeight / 2;  // vertical center of first line
  titleLines.forEach((line) => {
    ctx.fillText(line, width / 2, y);
    y += titleLineHeight;
  });
  currentY += titleHeight + 40;  // after title + small gap

  // Underline
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 100, currentY - 10);
  ctx.lineTo(width / 2 + 100, currentY - 10);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#E8B86B';
  ctx.stroke();
  currentY += 20;

  // ---------- 8. Draw body box ----------
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
  bodyLines.forEach((line, i) => {
    ctx.fillText(line, width / 2, textStartY + i * bodyLineHeight);
  });

  currentY += boxHeight + 55;  // after box + gap

  // ---------- 9. Draw logo + line above ----------
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

  // ---------- 10. Draw CTA ----------
  ctx.font = `italic ${ctaFontSize}px "Poppins-Regular", sans-serif`;
  ctx.fillStyle = '#E8B86B';
  ctx.fillText('✦ Share this to inspire someone ✦', width / 2, currentY + 45);

  // Save image
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
app.get('/', (req, res) => res.json({ message: 'Phoenix Arc API is running. Use POST /api/generate-post' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🔥 Phoenix Arc server running on port ${PORT}`));
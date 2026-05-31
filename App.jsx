import { useState, useEffect } from 'react';
import axios from 'axios';

// ---------- 50+ Motivational Topics ----------
const TOPICS = [
  "From self-doubt to self-belief in one small step",
  "From broke to building wealth – one rupee at a time",
  "Why you feel stuck at 25 (and how to break free)",
  "Failed exam? Here's what I learned",
  "When everyone left, I found myself",
  "The power of waking up at 5 AM",
  "My first business failed. Here's why I'm grateful",
  "Why your pain has a purpose",
  "Stop waiting for motivation. Start discipline.",
  "How I stopped comparing myself to others",
  "The side hustle that changed my life",
  "From village boy to city dreamer",
  "The strength in being single and focused",
  "How heartbreak made me unstoppable",
  "Stop begging for attention – build yourself",
  "Why you feel alone even in a crowd",
  "From rejected to promoted in 6 months",
  "Why your 9-to-5 is not your destiny",
  "The art of starting over after failure",
  "How I learned a new skill in 30 days",
  "From lazy to 5K run – my journey",
  "Why you're not losing weight (mental block)",
  "The morning routine that saved my life",
  "Consistency over intensity – my rule",
  "How I quit sugar and changed everything",
  "Why you should start before you're ready",
  "The 4 AM hustle nobody sees",
  "From employee to employer – my truth",
  "Why being a beginner is your superpower",
  "When God says 'wait' – do this",
  "The silent battle no one knows about",
  "How I found peace in the storm",
  "Letting go of what you can't control",
  "A letter to my younger self (from a parent)",
  "Why I work hard for my mother's dream",
  "The sacrifice my parents made that I never saw",
  "Raising myself while raising my sibling",
  "To the one who feels invisible",
  "Why your struggle is someone's inspiration",
  "The power of a single 'thank you'",
  "How kindness changed my life",
  "If you're watching this at 3 AM...",
  "The one video you need to see today",
  "Share this with someone who needs to hear it",
  "Comment 'YES' if you're ready to change"
];

const getTodayString = () => new Date().toISOString().slice(0, 10);
const getRandomTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)];

// ✅ Get backend URL – production default is Railway, local dev can override
const getBackendUrl = () => {
  // For Vite
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // For Create React App
  if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  // Default to your Railway backend (production)
  return 'phoenix-post-production-5cc9.up.railway.app';
};

const BACKEND_URL = getBackendUrl();

function App() {
  const [topic, setTopic] = useState('');
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const lastGenDate = localStorage.getItem('lastPostDate');
    const today = getTodayString();
    if (lastGenDate !== today) {
      const randomTopic = getRandomTopic();
      setTopic(randomTopic);
      setAutoMode(true);
      generatePost(randomTopic);
    } else {
      const savedPost = localStorage.getItem('lastMotivationPost');
      const savedTopic = localStorage.getItem('lastMotivationTopic');
      if (savedPost && savedTopic) {
        setPost(JSON.parse(savedPost));
        setTopic(savedTopic);
      }
    }
    // eslint-disable-next-line
  }, []);

  const generatePost = async (customTopic = null) => {
    const finalTopic = customTopic || topic;
    if (!finalTopic) {
      setError('Please enter a topic');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/generate-post`, { topic: finalTopic });
      const newPost = res.data;
      setPost(newPost);
      localStorage.setItem('lastPostDate', getTodayString());
      localStorage.setItem('lastMotivationTopic', finalTopic);
      localStorage.setItem('lastMotivationPost', JSON.stringify(newPost));
    } catch (err) {
      console.error('API error:', err);
      let message = 'Failed to generate post. ';
      if (err.response) {
        message += err.response.data?.error || `Server error: ${err.response.status}`;
      } else if (err.request) {
        message += 'Cannot reach backend. Check your network or CORS.';
      } else {
        message += err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
      setAutoMode(false);
    }
  };

  const handleRegenerateToday = () => {
    const randomTopic = getRandomTopic();
    setTopic(randomTopic);
    generatePost(randomTopic);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('✅ Caption copied to clipboard!');
  };

  // Helper: Get full image URL (works for both relative and absolute)
  const getFullImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl;
    }
    // Relative path – append backend URL
    return `${BACKEND_URL}${imageUrl}`;
  };

  // Download image – works for any URL (ImgBB or local)
  const downloadImage = async () => {
    const imageUrl = getFullImageUrl(post?.imageUrl);
    if (!imageUrl) {
      alert('No image to download');
      return;
    }
    try {
      // Fetch image as blob
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'phoenix_motivation.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Could not download image. Try right-click + Save As.');
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: 'auto', padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ textAlign: 'center' }}>🔥 The Phoenix Arc – Daily Motivation</h1>
      <p style={{ textAlign: 'center', color: '#555' }}>
        {autoMode ? '🤖 Auto‑generating today’s post...' : `Today's Topic (${getTodayString()})`}
      </p>

      <input
        type="text"
        placeholder="Enter a topic (or leave for random daily)"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        style={{ width: '100%', padding: 12, marginBottom: 10, fontSize: 16, border: '1px solid #ccc', borderRadius: 8 }}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={() => generatePost()} disabled={loading} className="btn btn-primary">
          {loading ? 'Generating...' : 'Generate New Post'}
        </button>
        <button onClick={handleRegenerateToday} disabled={loading} className="btn btn-secondary">
          🔄 Random Topic for Today
        </button>
      </div>

      {error && <div style={{ color: 'red', marginBottom: 16, padding: 10, background: '#ffe0e0', borderRadius: 8 }}>{error}</div>}

      {post && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            {post.imageUrl ? (
              <img
                src={getFullImageUrl(post.imageUrl)}
                alt="Motivation post"
                style={{ width: '100%', maxWidth: 540, borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
              />
            ) : (
              <div style={{ padding: 40, background: '#eee', borderRadius: 16 }}>Image not available</div>
            )}
          </div>

          <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 12, marginBottom: 16 }}>
            <h3>{post.title}</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{post.body}</p>
            <hr />
            <p><strong>📢 Caption (copy & paste on Facebook):</strong></p>
            <textarea
              rows={3}
              value={post.caption}
              readOnly
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => copyToClipboard(post.caption)} className="btn btn-success">
              📋 Copy Caption
            </button>
            <button onClick={downloadImage} className="btn btn-info">
              ⬇️ Download Image
            </button>
          </div>
        </div>
      )}

      <style>{`
        .btn {
          padding: 12px 24px;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: opacity 0.2s ease;
        }
        .btn-primary { background-color: #007bff; }
        .btn-primary:hover { opacity: 0.85; }
        .btn-secondary { background-color: #6c757d; }
        .btn-secondary:hover { opacity: 0.85; }
        .btn-success { background-color: #28a745; }
        .btn-success:hover { opacity: 0.85; }
        .btn-info { background-color: #17a2b8; }
        .btn-info:hover { opacity: 0.85; }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

export default App;
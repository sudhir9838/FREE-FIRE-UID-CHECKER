// server.js
const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG ===
const UPSTREAM = 'https://ffcheckhid.vercel.app/accinfo'; // your working manual endpoint
const CACHE_TTL = 300; // seconds
const REQUEST_TIMEOUT = 10000; // ms
const MAX_RETRIES = 2;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 60 });

// helper: call upstream with retries
async function fetchUpstream(uid, region) {
  const url = `${UPSTREAM}?uid=${encodeURIComponent(uid)}&region=${encodeURIComponent(region)}`;
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await axios.get(url, { timeout: REQUEST_TIMEOUT });
      return resp.data;
    } catch (err) {
      lastErr = err;
      // small delay between retries
      await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  // throw last error if all retries failed
  throw lastErr;
}

// normalize response into friendly view
function normalize(raw, uid, region) {
  const basic = raw.basicInfo || raw.basic_info || {};
  const social = raw.socialInfo || raw.social_info || {};
  const clan = raw.clanBasicInfo || raw.clan_basic_info || {};
  const captain = raw.captainBasicInfo || raw.captain_basic_info || {};

  return {
    raw,
    view: {
      uid: basic.accountId || uid,
      nickname: basic.nickname || '-',
      level: basic.level ?? '-',
      region: basic.region || region || '-',
      likes: basic.liked ?? basic.likes ?? 0,
      bio: social.socialHighlight || social.social_highlight || social.signature || '-',
      clanName: clan.clanName || '-',
      clanLevel: clan.clanLevel ?? '-',
      clanOwner: captain.nickname || '-'
    }
  };
}

// API endpoint for frontend to call
app.get('/api/accinfo', async (req, res) => {
  try {
    const uid = String(req.query.uid || '').trim();
    let region = (req.query.region || 'IND').toString().trim().toUpperCase();
    if (!uid || !/^\d+$/.test(uid)) {
      return res.status(400).json({ error: 'Invalid UID (must be numeric)' });
    }
    // normalize some common region inputs
    if (region === 'IND' || region === 'IN' || region.toLowerCase() === 'ind') region = 'IND';

    const key = `acc:${uid}:${region}`;
    const cached = cache.get(key);
    if (cached) return res.json(cached);

    const upstreamData = await fetchUpstream(uid, region);
    if (!upstreamData) {
      return res.status(502).json({ error: 'Empty upstream response' });
    }
    // if upstream returned an error payload, forward it
    if (upstreamData.error) {
      return res.status(502).json({ error: upstreamData.error });
    }

    const out = normalize(upstreamData, uid, region);
    cache.set(key, out);
    return res.json(out);
  } catch (err) {
    console.error('Proxy error:', err && err.message ? err.message : err);
    // try to give helpful message
    if (err.response && err.response.data) {
      return res.status(502).json({ error: 'Upstream error', details: err.response.data });
    }
    return res.status(500).json({ error: 'Server error', message: err.message || String(err) });
  }
});

// serve UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`FF UID proxy running on port ${PORT}`));
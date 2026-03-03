// netlify/functions/fetch-meta.js
// Accepts ?url=... and returns { type, embedId, title, description, thumbnail, show, showKey }

exports.handler = async (event) => {
  const raw = event.queryStringParameters?.url;
  if (!raw) return json(400, { error: 'Missing url parameter' });

  const url = decodeURIComponent(raw);

  try {
    if (isSpotify(url))  return json(200, await spotifyMeta(url));
    if (isYouTube(url))  return json(200, await youtubeMeta(url));
    return json(400, { error: 'Unsupported URL. Paste a Spotify episode or YouTube video link.' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};

// ─── helpers ────────────────────────────────────────────────────────────────

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    body: JSON.stringify(body),
  };
}

function isSpotify(url)  { return url.includes('open.spotify.com'); }
function isYouTube(url)  { return url.includes('youtube.com') || url.includes('youtu.be'); }

// Extract YouTube video ID from any YouTube URL format
function ytId(url) {
  const patterns = [
    /[?&]v=([^&#]+)/,
    /youtu\.be\/([^?&#]+)/,
    /\/shorts\/([^?&#]+)/,
    /\/embed\/([^?&#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// Extract Spotify episode/show ID
function spotifyParts(url) {
  const m = url.match(/open\.spotify\.com\/(episode|show)\/([A-Za-z0-9]+)/);
  return m ? { type: m[1], id: m[2] } : null;
}

// Detect which show a Spotify/YouTube episode belongs to based on known show IDs
const SHOW_MAP = {
  // Spotify show IDs → showKey
  '1CJ2bvTnfHLjRxJWuSmVCZ': 'moderncto',
  '3yRCxWRSdSEEpKjUmHFgX7': 'levelup',
  '4rOoJ6Egrf8K2IrywzwOMk': 'geniuslife', // placeholder — update with real show IDs
  '76wMZ1SJV4OAql9HzbnQ87': 'toolbox',
  '0xgfGTzqcCflFqwa3e1F0T': 'pestinclass',
  '7FeyqemmrEhgXhXp0UwLEG': 'goodquestion',
  '6O4MEMM2zcXl5SBJvLchiz': 'mhpbroker',
  '7ee4TNklrAPYpTr9FpG4g4': 'afterfurther',
  '20Ixfbny473CVB2PizMIir': 'masteringst',
  '1ddUSqyruCiMIegjuQ3Yvi': 'missionadmissions',
  '2zhwtP0VyKCsEi9KGxVtjw': 'theapplication',
  '6fkbXx4EvIqXFmBH5KH5KU': 'hiddengem',
  '0ZwTg6kbHiHiGVubmMQqUw': 'aggiegrowth',
  '1ddUSqyruCiMIegjuQ3Yvi': 'missionadmissions',
};

const SHOW_NAMES = {
  moderncto:        'Modern CTO',
  levelup:          'Level Up Lifestyle',
  geniuslife:       'The Genius Life',
  toolbox:          'Toolbox for the Trades',
  pestinclass:      'Pest in Class',
  goodquestion:     'Good Question',
  mhpbroker:        "MHP Broker's Tips & Tricks",
  afterfurther:     'After Further Consideration',
  masteringst:      'Mastering ServiceTitan',
  missionadmissions:'Mission Admissions',
  theapplication:   'The Application',
  hiddengem:        'The Hidden Gem',
  aggiegrowth:      'Aggie Growth Hacks',
  madeofmettle:     'Made of Mettle Motivation',
  victorygroove:    'Victory Groove',
  moneyrealestate:  'Money, Real Estate & More',
};

// ─── Spotify ─────────────────────────────────────────────────────────────────
async function spotifyMeta(url) {
  const parts = spotifyParts(url);
  if (!parts) throw new Error('Could not parse Spotify URL');

  // Use oEmbed to get title + description — no auth needed
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(oembedUrl);
  if (!res.ok) throw new Error('Spotify oEmbed failed');
  const data = await res.json();

  // Try to detect show from the embed HTML (contains show name)
  // oEmbed title is usually "Episode Title | Show Name"
  let showKey = null;
  let episodeTitle = data.title || '';
  const titleParts = episodeTitle.split(' | ');
  if (titleParts.length >= 2) {
    episodeTitle = titleParts[0].trim();
    const showNameRaw = titleParts.slice(1).join(' | ').trim();
    // Match against known show names
    for (const [key, name] of Object.entries(SHOW_NAMES)) {
      if (showNameRaw.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(showNameRaw.toLowerCase())) {
        showKey = key;
        break;
      }
    }
  }

  const isCurrentShow = showKey === 'moderncto' || showKey === 'levelup';

  return {
    platform:    'spotify',
    contentType: isCurrentShow ? 'spotify' : 'spotify',
    embedId:     parts.id,
    embedType:   parts.type,     // 'episode' or 'show'
    embedUrl:    `https://open.spotify.com/embed/${parts.type}/${parts.id}?utm_source=generator&theme=0`,
    title:       episodeTitle,
    description: '',             // Spotify oEmbed doesn't give description
    thumbnail:   data.thumbnail_url || '',
    showKey:     showKey || 'unknown',
    showName:    showKey ? SHOW_NAMES[showKey] : 'Unknown Show',
  };
}

// ─── YouTube ─────────────────────────────────────────────────────────────────
async function youtubeMeta(url) {
  const videoId = ytId(url);
  if (!videoId) throw new Error('Could not extract YouTube video ID');

  const isShort = url.includes('/shorts/');
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YouTube API key not configured');

  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`;
  const res = await fetch(apiUrl);
  const data = await res.json();

  if (!res.ok || !data.items?.length) {
    throw new Error('YouTube video not found or API error');
  }

  const item = data.items[0];
  const snippet = item.snippet;
  const stats   = item.statistics;

  // Try to detect show from video title or channel name
  let showKey = null;
  const titleLower = (snippet.title || '').toLowerCase();
  const channelLower = (snippet.channelTitle || '').toLowerCase();
  for (const [key, name] of Object.entries(SHOW_NAMES)) {
    const nameLower = name.toLowerCase();
    if (titleLower.includes(nameLower) || channelLower.includes(nameLower)) {
      showKey = key;
      break;
    }
  }

  return {
    platform:    isShort ? 'youtube-short' : 'youtube',
    contentType: isShort ? 'social' : 'youtube',
    embedId:     videoId,
    embedUrl:    `https://www.youtube.com/embed/${videoId}`,
    title:       snippet.title || '',
    description: (snippet.description || '').slice(0, 200),
    thumbnail:   snippet.thumbnails?.medium?.url || '',
    showKey:     showKey || 'unknown',
    showName:    showKey ? SHOW_NAMES[showKey] : snippet.channelTitle || 'Unknown Show',
    views:       parseInt(stats.viewCount || 0, 10),
    likes:       parseInt(stats.likeCount || 0, 10),
  };
}

// netlify/functions/youtube-stats.js
// Proxies YouTube Data API v3 — keeps your API key server-side only.
// Called by the page as: /.netlify/functions/youtube-stats?ids=ID1,ID2,...

exports.handler = async (event) => {
  const ids = event.queryStringParameters?.ids;

  if (!ids) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ids parameter' }) };
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || 'YouTube API error' }) };
    }

    // Return only the fields we need: videoId → { views, likes }
    const stats = {};
    for (const item of data.items || []) {
      stats[item.id] = {
        views: parseInt(item.statistics.viewCount  || 0, 10),
        likes: parseInt(item.statistics.likeCount  || 0, 10),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 1 hour so you don't burn through API quota on every page load
        'Cache-Control': 'public, max-age=3600',
      },
      body: JSON.stringify(stats),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

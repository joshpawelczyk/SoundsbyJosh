// netlify/functions/episodes.js
// GET  → returns all saved episodes as JSON array
// POST → saves a new episode (requires admin password in Authorization header)
// DELETE ?id=... → removes an episode

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'episodes';
const INDEX_KEY  = 'index'; // one key holds array of all episode IDs

function authOk(event) {
  const header = event.headers['authorization'] || '';
  const token  = header.replace('Bearer ', '').trim();
  return token === process.env.ADMIN_PASSWORD;
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const store = getStore(STORE_NAME);

  // ── GET — public, returns all episodes ordered by savedAt desc ───────────
  if (event.httpMethod === 'GET') {
    try {
      const indexRaw = await store.get(INDEX_KEY);
      if (!indexRaw) return json(200, []);

      const ids = JSON.parse(indexRaw);
      const episodes = await Promise.all(
        ids.map(async id => {
          try {
            const raw = await store.get(id);
            return raw ? JSON.parse(raw) : null;
          } catch { return null; }
        })
      );

      return json(200, episodes.filter(Boolean));
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  // ── POST — save a new episode ────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    if (!authOk(event)) return json(401, { error: 'Unauthorized' });

    let episode;
    try { episode = JSON.parse(event.body); }
    catch { return json(400, { error: 'Invalid JSON body' }); }

    // Generate a unique ID
    const id = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    episode.id = id;
    episode.savedAt = new Date().toISOString();

    try {
      // Save the episode
      await store.set(id, JSON.stringify(episode));

      // Update the index
      const indexRaw = await store.get(INDEX_KEY);
      const ids = indexRaw ? JSON.parse(indexRaw) : [];
      ids.unshift(id); // newest first
      await store.set(INDEX_KEY, JSON.stringify(ids));

      return json(200, { ok: true, id, episode });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  // ── DELETE — remove an episode ───────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    if (!authOk(event)) return json(401, { error: 'Unauthorized' });

    const id = event.queryStringParameters?.id;
    if (!id) return json(400, { error: 'Missing id parameter' });

    try {
      await store.delete(id);

      const indexRaw = await store.get(INDEX_KEY);
      if (indexRaw) {
        const ids = JSON.parse(indexRaw).filter(i => i !== id);
        await store.set(INDEX_KEY, JSON.stringify(ids));
      }

      return json(200, { ok: true });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method not allowed' });
};

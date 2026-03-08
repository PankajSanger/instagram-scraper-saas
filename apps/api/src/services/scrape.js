function extractShortcode(postUrl) {
  try {
    const url = new URL(postUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i += 1) {
      const segment = parts[i].toLowerCase();
      if (segment === 'p' || segment === 'reel' || segment === 'tv') {
        return parts[i + 1] || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function extractJsonObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;

  const firstBrace = source.indexOf('{', markerIndex + marker.length);
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;

    if (depth === 0) return source.slice(firstBrace, i + 1);
  }

  return null;
}

function normalizeCommentNode(node) {
  const commentId = node.id || node.pk || '';
  const username = node.owner?.username || node.user?.username || 'unknown';
  const text = String(node.text || node.comment_text || '').replace(/\s+/g, ' ').trim();
  const likeCount = Number(node.edge_liked_by?.count || node.like_count || 0);
  const createdAt = Number(node.created_at || node.created_time || node.taken_at_timestamp || 0);
  const timestampIso = createdAt ? new Date(createdAt * 1000).toISOString() : '';

  return { commentId, username, text, likeCount, timestampIso };
}

function buildCsv(rows) {
  const headers = ['CommentID', 'Username', 'Text', 'LikeCount', 'Timestamp_ISO'];
  const body = rows.map((row) => [
    `"${String(row.commentId || '').replace(/"/g, '""')}"`,
    `"${String(row.username || '').replace(/"/g, '""')}"`,
    `"${String(row.text || '').replace(/"/g, '""')}"`,
    Number(row.likeCount || 0),
    `"${String(row.timestampIso || '').replace(/"/g, '""')}"`
  ].join(','));

  return [headers.join(','), ...body].join('\n');
}

function getCommonHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
    'x-ig-app-id': '936619743392459'
  };
}

function getEdgesFromResponse(data) {
  const media = data?.graphql?.shortcode_media
    || data?.data?.shortcode_media
    || data?.data?.xdt_shortcode_media
    || data?.shortcode_media
    || null;

  const conn = media?.edge_media_to_parent_comment || media?.edge_media_preview_comment || null;
  return conn?.edges || [];
}

async function tryA1(shortcode) {
  const paths = [`/p/${shortcode}/`, `/reel/${shortcode}/`, `/tv/${shortcode}/`];
  for (const path of paths) {
    try {
      const url = `https://www.instagram.com${path}?__a=1&__d=dis`;
      const response = await fetch(url, { headers: getCommonHeaders() });
      if (!response.ok) continue;
      const data = await response.json();
      const edges = getEdgesFromResponse(data);
      if (edges.length) return edges;
    } catch {
      // continue
    }
  }
  return [];
}

async function tryGraphql(shortcode) {
  const hashes = [
    '97b41c52301f77ce508f55e66d17620e',
    'f0986789a5c5d17c2400faebf16efd0d',
    'd5d763b1e2acf209d62d22d184488e57'
  ];

  const vars = encodeURIComponent(JSON.stringify({ shortcode, first: 50, after: null }));

  for (const hash of hashes) {
    try {
      const url = `https://www.instagram.com/graphql/query/?query_hash=${hash}&variables=${vars}`;
      const response = await fetch(url, { headers: getCommonHeaders() });
      if (!response.ok) continue;
      const data = await response.json();

      const media = data?.data?.shortcode_media || null;
      const conn = media?.edge_media_to_parent_comment || media?.edge_media_preview_comment || null;
      const edges = conn?.edges || [];
      if (edges.length) return edges;
    } catch {
      // continue
    }
  }

  return [];
}

async function tryHtmlMarker(shortcode) {
  const paths = [`/p/${shortcode}/`, `/reel/${shortcode}/`, `/tv/${shortcode}/`];
  for (const path of paths) {
    try {
      const targetUrl = `https://www.instagram.com${path}`;
      const response = await fetch(targetUrl, { headers: getCommonHeaders() });
      if (!response.ok) continue;

      const html = await response.text();
      const extracted = extractJsonObject(html, '"edge_media_to_parent_comment":');
      if (!extracted) continue;

      const parsed = JSON.parse(extracted);
      const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
      if (edges.length) return edges;
    } catch {
      // continue
    }
  }
  return [];
}

async function scrapeCommentsFromInstagramUrl(postUrl) {
  const shortcode = extractShortcode(postUrl);
  if (!shortcode) {
    return { error: 'invalid_instagram_post_url' };
  }

  let edges = await tryA1(shortcode);
  if (!edges.length) edges = await tryGraphql(shortcode);
  if (!edges.length) edges = await tryHtmlMarker(shortcode);

  const rows = edges
    .map((edge) => normalizeCommentNode(edge?.node || edge || {}))
    .filter((row) => row.commentId && row.text);

  if (!rows.length) {
    return { error: 'comments_not_found_or_instagram_blocked' };
  }

  const csv = buildCsv(rows);
  const filename = `instagram_comments_${shortcode}_${Date.now()}.csv`;
  return { shortcode, rows, csv, filename };
}

module.exports = { scrapeCommentsFromInstagramUrl };

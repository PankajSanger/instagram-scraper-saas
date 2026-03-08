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
  } catch (err) {
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

    if (depth === 0) {
      return source.slice(firstBrace, i + 1);
    }
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

  return {
    commentId,
    username,
    text,
    likeCount,
    timestampIso
  };
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

async function scrapeCommentsFromInstagramUrl(postUrl) {
  const shortcode = extractShortcode(postUrl);
  if (!shortcode) {
    return { error: 'invalid_instagram_post_url' };
  }

  const targetUrl = `https://www.instagram.com/p/${shortcode}/`;

  let html = '';
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html'
      }
    });

    if (!response.ok) {
      return { error: 'instagram_post_not_accessible' };
    }

    html = await response.text();
  } catch (err) {
    return { error: 'instagram_fetch_failed' };
  }

  const extracted = extractJsonObject(html, '"edge_media_to_parent_comment":');
  if (!extracted) {
    return { error: 'comments_not_found_or_private_post' };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(extracted);
  } catch (err) {
    return { error: 'comment_parse_failed' };
  }

  const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
  const rows = edges
    .map((edge) => normalizeCommentNode(edge?.node || edge || {}))
    .filter((row) => row.commentId && row.text);

  if (!rows.length) {
    return { error: 'no_comments_available' };
  }

  const csv = buildCsv(rows);
  const filename = `instagram_comments_${shortcode}_${Date.now()}.csv`;

  return {
    shortcode,
    rows,
    csv,
    filename
  };
}

module.exports = { scrapeCommentsFromInstagramUrl };

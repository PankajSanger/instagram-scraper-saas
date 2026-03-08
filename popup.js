// popup.js - updated: sends options to injected scraper and receives live progress updates

const scrapeBtn = document.getElementById('scrapeBtn');
const statusBox = document.getElementById('statusBox');
const statusLine = document.getElementById('statusLine');
const progressFill = document.getElementById('progressFill');
const percentLabel = document.getElementById('percent');
const etaLabel = document.getElementById('eta');
const phaseLabel = document.getElementById('phase');
const detailLabel = document.getElementById('detail');
const apiUrlInput = document.getElementById('apiUrl');
const apiKeyInput = document.getElementById('apiKey');

let scrapeStart = null;
let totalEstimate = null;
let processedSoFar = 0;

// Format seconds to mm:ss
function formatSeconds(secs) {
  if (!isFinite(secs) || secs <= 0) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function showStatusBox() {
  statusBox.style.display = 'block';
}

function setPopupProgress({phaseText=null, percent=null, eta=null, detail=null}) {
  showStatusBox();
  if (phaseText !== null) phaseLabel.textContent = `phase: ${phaseText}`;
  if (percent !== null) {
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    progressFill.style.width = pct + '%';
    percentLabel.textContent = pct + '%';
  }
  if (eta !== null) etaLabel.textContent = `ETA: ${eta}`;
  if (detail !== null) detailLabel.textContent = detail;
}

function resetPopupState() {
  scrapeStart = null;
  totalEstimate = null;
  processedSoFar = 0;
  progressFill.style.width = '0%';
  percentLabel.textContent = '0%';
  etaLabel.textContent = 'ETA: --:--';
  phaseLabel.textContent = 'phase: idle';
  detailLabel.textContent = '';
}

function loadSaasConfig() {
  try {
    const apiUrl = localStorage.getItem('igSaasApiUrl') || 'http://localhost:8080';
    const apiKey = localStorage.getItem('igSaasApiKey') || '';
    apiUrlInput.value = apiUrl;
    apiKeyInput.value = apiKey;
  } catch (e) {}
}

function saveSaasConfig() {
  try {
    localStorage.setItem('igSaasApiUrl', (apiUrlInput.value || '').trim());
    localStorage.setItem('igSaasApiKey', (apiKeyInput.value || '').trim());
  } catch (e) {}
}

loadSaasConfig();
apiUrlInput.addEventListener('change', saveSaasConfig);
apiKeyInput.addEventListener('change', saveSaasConfig);

// Listener for progress messages from the scraper
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'ig-progress') return;
  const now = Date.now();

  switch (msg.phase) {
    case 'start':
      scrapeStart = now;
      totalEstimate = msg.total_estimate || null;
      processedSoFar = 0;
      statusLine.textContent = 'Status: started';
      setPopupProgress({ phaseText: 'starting', percent: 0, eta: formatSeconds(0), detail: `Estimated total: ${totalEstimate || 'unknown'}` });
      break;

    case 'page_fetched':
      processedSoFar = msg.itemsFetchedSoFar || processedSoFar;
      statusLine.textContent = `Status: fetched page ${msg.pageIndex}`;
      if (totalEstimate) {
        const pct = (processedSoFar / totalEstimate) * 100;
        const elapsed = (now - scrapeStart) / 1000;
        const etaSecs = processedSoFar > 0 ? (elapsed / processedSoFar) * (totalEstimate - processedSoFar) : null;
        setPopupProgress({ phaseText: `page ${msg.pageIndex}`, percent: pct, eta: formatSeconds(etaSecs), detail: `${processedSoFar}/${totalEstimate} comments` });
      } else {
        setPopupProgress({ phaseText: `page ${msg.pageIndex}`, percent: null, eta: '--:--', detail: `${processedSoFar} comments` });
      }
      break;

    case 'thread_fetched':
      processedSoFar = msg.itemsFetchedSoFar || processedSoFar;
      statusLine.textContent = `Status: fetched replies for ${msg.parentCommentId}`;
      if (totalEstimate) {
        const pct = (processedSoFar / totalEstimate) * 100;
        const elapsed = (now - scrapeStart) / 1000;
        const etaSecs = processedSoFar > 0 ? (elapsed / processedSoFar) * (totalEstimate - processedSoFar) : null;
        setPopupProgress({ phaseText: 'thread replies', percent: pct, eta: formatSeconds(etaSecs), detail: `${processedSoFar}/${totalEstimate} comments` });
      } else {
        setPopupProgress({ phaseText: 'thread replies', percent: null, detail: `${processedSoFar} comments` });
      }
      break;

    case 'profiles_progress':
      statusLine.textContent = `Status: profiles ${msg.profilesFetched}/${msg.totalProfiles || '??'}`;
      setPopupProgress({ phaseText: 'profiles', percent: msg.totalProfiles ? Math.round((msg.profilesFetched / msg.totalProfiles) * 100) : null, eta: '--:--', detail: `${msg.profilesFetched}/${msg.totalProfiles || '??'} profiles` });
      break;

    case 'done':
      statusLine.textContent = `Status: done - CSV download started`;
      setPopupProgress({ phaseText: 'done', percent: 100, eta: '00:00', detail: `Total rows: ${msg.totalRows || 'unknown'}${msg.uploadResult ? ' | ' + msg.uploadResult : ''}` });
      // re-enable button after small delay
      setTimeout(() => {
        scrapeBtn.disabled = false;
        scrapeBtn.textContent = 'Scrape Comments';
      }, 800);
      break;

    case 'error':
      statusLine.textContent = `Status: error - ${msg.message || 'unknown'}`;
      setPopupProgress({ phaseText: 'error', percent: null, eta: '--:--', detail: msg.message || '' });
      scrapeBtn.disabled = false;
      scrapeBtn.textContent = 'Scrape Comments';
      break;

    default:
      // generic events
      if (msg.itemsFetchedSoFar) {
        processedSoFar = msg.itemsFetchedSoFar;
      }
      if (msg.total_estimate) totalEstimate = msg.total_estimate;
      break;
  }
});

// click handler - collects options and injects the scraper
scrapeBtn.addEventListener('click', async () => {
  const threaded = document.getElementById('threadedToggle').checked;
  const profiles = document.getElementById('profilesToggle').checked;
  const apiUrl = (apiUrlInput.value || '').trim();
  const apiKey = (apiKeyInput.value || '').trim();
  saveSaasConfig();

  resetPopupState();
  scrapeBtn.disabled = true;
  scrapeBtn.textContent = 'Launching...';
  statusLine.textContent = 'Status: initializing scraper...';
  showStatusBox();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/instagram\.com/.test(tab.url)) {
      throw new Error('Please open an Instagram post/reel/tv page in the active tab.');
    }

    // Inject the scraper function (defined below) and pass options.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedScraper, // the function will be serialized and executed in page context
      args: [{ threadedReplies: threaded, fetchProfiles: profiles, saasApiUrl: apiUrl, saasApiKey: apiKey }]
    });

    statusLine.textContent = 'Status: scraper injected - check overlay on IG page';
    scrapeBtn.textContent = 'Running...';
  } catch (err) {
    statusLine.textContent = `Error: ${err.message || String(err)}`;
    scrapeBtn.disabled = false;
    scrapeBtn.textContent = 'Scrape Comments';
  }
});

/* ---------- injectedScraper (runs in page) - robust scraper with progress messages ---------- */
/* This is a condensed/annotated robust scraper — it sends progress events via chrome.runtime.sendMessage.
   Replace / tune internals (hashes, concurrency) as needed for your Instagram build. */
function injectedScraper(options = { threadedReplies: true, fetchProfiles: true, saasApiUrl: '', saasApiKey: '' }) {
  // small helper to notify popup via extension message
  function notifyProgress(payload) {
    try {
      chrome.runtime.sendMessage(Object.assign({ type: 'ig-progress' }, payload));
    } catch (e) {
      // fallback: console
      console.log('[ig-progress-fallback]', payload);
    }
  }

  // --- basic helpers & small-config (tweak if needed) ---
  const PER_PAGE = 100;
  const PROFILE_CONCURRENCY = 6;
  const PROFILE_DELAY = 120; // ms
  const GRAPHQL_COMMENT_HASHES = ["97b41c52301f77ce508f55e66d17620e","f0986789a5c5d17c2400faebf16efd0d","d5d763b1e2acf209d62d22d184488e57"];
  const THREAD_HASHES = ["97b41c52301f77ce508f55e66d17620e","3e0b0d9b4f7ea9f9b3f8b9a7b9f4d3c1","5aefa4f7c0f0b7d1b2174b9d3d9a5c2f"];
  const PROFILE_URL_SUFFIX = '/?__a=1&__d=dis';
  const MAX_THREAD_ROUNDS = 500;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function q(v){ return encodeURIComponent(JSON.stringify(v)); }
  function safeJSONParse(s){ try{return JSON.parse(s);}catch(e){return null;} }
  function formatToIST(isoOrEpoch){
    try{
      let d;
      if(!isoOrEpoch) d=new Date();
      else if(typeof isoOrEpoch==='number') d=new Date(isoOrEpoch*1000);
      else d=new Date(isoOrEpoch);
      return d.toLocaleString('en-GB',{timeZone:'Asia/Kolkata'}).replace(',','').replace(/\//g,'-');
    }catch(e){ return new Date().toISOString(); }
  }

  // overlay UI on page (so user can see progress there too)
  const overlay = document.createElement('div');
  overlay.id = '__ig_scraper_overlay';
  overlay.style = 'position:fixed;top:18px;right:18px;z-index:2147483647;background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:10px;border-radius:10px;min-width:320px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
  overlay.innerHTML = `<div id="__ig_status" style="font-weight:700;margin-bottom:6px">IG Scraper</div><div id="__ig_sub" style="font-size:13px">starting...</div><div style="height:8px;background:rgba(255,255,255,0.12);border-radius:6px;margin-top:8px;overflow:hidden"><div id="__ig_bar" style="height:100%;width:0%;background:white;transition:width .22s;"></div></div>`;
  document.documentElement.appendChild(overlay);
  const setOverlay = (text, pct, sub) => {
    try {
      const s = document.getElementById('__ig_status'); const sb = document.getElementById('__ig_sub'); const bar = document.getElementById('__ig_bar');
      if (s) s.textContent = text;
      if (sb) sb.textContent = sub || sb.textContent;
      if (bar && typeof pct === 'number') bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    } catch(e){}
  };

  // simple fetch with retries/backoff
  async function fetchWithRetries(url, opts = {}, { retries = 3, backoffBase = 450 } = {}) {
    for (let attempt=0; attempt<=retries; attempt++){
      try{
        const res = await fetch(url, opts);
        if (res.ok) return res;
        if (res.status === 429) { await sleep(backoffBase * Math.pow(2, attempt) + 200); continue; }
        if (attempt < retries) { await sleep(backoffBase * (attempt+1)); continue; }
        return res;
      }catch(e){
        if (attempt < retries) { await sleep(backoffBase * (attempt+1)); continue; }
        throw e;
      }
    }
  }

  // simple shortcode extract (posts/reels/tv)
  function getShortcode(){
    try{
      const parts = location.pathname.split('/').filter(Boolean);
      for (let i=0;i<parts.length;i++){
        const seg = parts[i].toLowerCase();
        if (seg==='p' || seg==='reel' || seg==='tv'){ const sc = parts[i+1]; if(sc) return sc; }
      }
      const og = document.querySelector('meta[property="og:url"]');
      if (og && og.content){ const m = og.content.match(/\/(p|reel|tv)\/([^\/\?]+)/); if (m && m[2]) return m[2]; }
      if (window._sharedData){ const s = JSON.stringify(window._sharedData); const mm = s.match(/"shortcode":"([^"]+)"/); if(mm && mm[1]) return mm[1]; }
    }catch(e){}
    return null;
  }

  // fetch a1 endpoint
  async function fetchA1(shortcode){
    const cand = [location.pathname, `/p/${shortcode}/`, `/reel/${shortcode}/`, `/tv/${shortcode}/`];
    for (const p of cand) {
      const url = `https://www.instagram.com${p}?__a=1&__d=dis`;
      try {
        const res = await fetchWithRetries(url, { credentials: 'same-origin' }, { retries: 2, backoffBase: 500 });
        if (!res.ok) continue;
        return { json: await res.json(), usedPath: p };
      } catch(e){ continue; }
    }
    return null;
  }

  // GraphQL comments (try several hashes)
  async function fetchCommentsGraphQL(shortcode, first=PER_PAGE, after=null){
    for (const qh of GRAPHQL_COMMENT_HASHES){
      try{
        const url = `https://www.instagram.com/graphql/query/?query_hash=${qh}&variables=${q({shortcode, first, after})}`;
        const res = await fetchWithRetries(url, { credentials: 'same-origin' }, { retries: 2, backoffBase: 500 });
        if (!res.ok) continue;
        const j = await res.json();
        const media = j?.data?.shortcode_media || j?.data?.media || j?.data?.node || null;
        if (media) {
          const conn = media.edge_media_to_parent_comment || media.edgeMediaToParentComment || media.comments || null;
          if (conn) return { edges: conn.edges || [], page_info: conn.page_info || null, qh };
        }
        if (j?.data?.comments) return { edges: j.data.comments.edges || [], page_info: j.data.comments.page_info || null, qh };
      }catch(e){}
    }
    return null;
  }

  // normalize node
  function normalizeNode(node){
    const id = node.id || node.pk || null;
    const username = node.owner?.username || node.user?.username || 'unknown';
    let created = node.created_at || node.created_time || node.taken_at_timestamp || null;
    if (typeof created === 'number') created = new Date(created * 1000).toISOString();
    const text = (node.text || node.comment_text || '').toString().replace(/\s+/g,' ').trim();
    const likeCount = node.edge_liked_by?.count || node.like_count || 0;
    const threaded = node.edge_threaded_comments || node.node?.edge_threaded_comments || null;
    const replyCount = threaded?.count || threaded?.edges?.length || node.reply_count || 0;
    const repliesEdges = threaded?.edges || node.replies || [];
    return {
      id: id || `synth_${username}_${Date.now()}`,
      username,
      text,
      timestamp_iso: created || new Date().toISOString(),
      timestamp_ist: formatToIST(created || new Date().toISOString()),
      like_count: Number(likeCount || 0),
      reply_count: Number(replyCount || 0),
      repliesEdges
    };
  }

  // fetch threaded replies for a given comment (best-effort)
  async function fetchThreadedReplies(shortcode, parentId, startCursor=null){
    if (!options.threadedReplies) return [];
    for (const qh of THREAD_HASHES) {
      try {
        let cursor = startCursor;
        let hasNext = true;
        let collected = [];
        let rounds = 0;
        while (hasNext && rounds < MAX_THREAD_ROUNDS) {
          const url = `https://www.instagram.com/graphql/query/?query_hash=${qh}&variables=${q({shortcode, first:50, after:cursor, parent_comment_id: parentId})}`;
          const res = await fetchWithRetries(url, { credentials: 'same-origin' }, { retries: 2, backoffBase: 600 });
          if (!res.ok) break;
          const j = await res.json();
          const tc = j?.data?.shortcode_media?.edge_media_to_parent_comment?.edge_threaded_comments
                    || j?.data?.comment_thread
                    || j?.data?.threaded_comments
                    || j?.data?.comments
                    || null;
          if (tc) {
            const edges = tc.edges || tc.data || [];
            const page_info = tc.page_info || tc.pageInfo || null;
            collected.push(...edges);
            if (page_info && page_info.has_next_page) { cursor = page_info.end_cursor || null; hasNext = !!cursor; } else { hasNext = false; }
            rounds++;
            await sleep(180);
            continue;
          }
          break;
        }
        if (collected.length) return collected;
      } catch (e) { continue; }
    }
    return [];
  }

  // fetch profile (best-effort)
  async function fetchProfile(username){
    if (!options.fetchProfiles) return null;
    try {
      const url = `https://www.instagram.com/${username}${PROFILE_URL_SUFFIX}`;
      const res = await fetchWithRetries(url, { credentials: 'same-origin' }, { retries: 2, backoffBase: 600 });
      if (!res.ok) return null;
      const j = await res.json();
      const u = j?.graphql?.user || j?.user || j?.data?.user || null;
      if (!u) return null;
      const followers = u.edge_followed_by?.count || u.edge_follow?.count || u.followers_count || 0;
      return {
        username,
        full_name: u.full_name || u.fullName || '',
        is_verified: Boolean(u.is_verified),
        followers_count: Number(followers || 0),
        profile_pic_url: u.profile_pic_url_hd || u.profile_pic_url || '',
        profile_url: `https://www.instagram.com/${username}/`
      };
    } catch (e) { return null; }
  }

  // parse __a=1 shapes
  function parseA1(json){
    try{
      if (!json) return { edges:[], page_info:null, total:null };
      if (json?.graphql?.shortcode_media) {
        const sm = json.graphql.shortcode_media;
        const conn = sm.edge_media_to_parent_comment || sm.edge_media_to_parent_comment;
        const total = sm.edge_media_to_parent_comment?.count || sm.comments_count || sm.comment_count || null;
        if (conn) return { edges: conn.edges || [], page_info: conn.page_info || null, total_count: total||null };
      }
      if (json?.items?.length) {
        const it = json.items[0];
        const conn = it.edge_media_to_parent_comment || it.comments || null;
        if (conn) return { edges: conn.edges || conn.data || [], page_info: conn.page_info || null, total_count: conn.count||null };
      }
      const s = JSON.stringify(json||{});
      const m = s.match(/"edge_media_to_parent_comment":\s*(\{[\s\S]*?\})/);
      if (m) { const obj = safeJSONParse(m[1]); if (obj) return { edges: obj.edges||[], page_info: obj.page_info||null, total_count: obj.count||null }; }
    }catch(e){}
    return { edges:[], page_info:null, total_count:null };
  }

  // CSV download helper (BOM)
  function downloadCSVWithBOM(csvStr, filename) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  // MAIN run
  (async () => {
    try {
      const shortcode = getShortcode();
      if (!shortcode) {
        notifyProgress({ phase: 'error', message: 'shortcode_not_found' });
        setOverlay('Error: shortcode not found', 0, 'shortcode not found on page');
        return;
      }

      setOverlay('Fetching initial JSON...', 5, shortcode);
      notifyProgress({ phase: 'start', timestamp: Date.now(), total_estimate: null });

      const a1 = await fetchA1(shortcode);
      let { edges, page_info, total_count } = a1 && a1.json ? parseA1(a1.json) : { edges: [], page_info: null, total_count: null };
      let source = a1?.usedPath || 'a1';

      // try _sharedData fallback
      if ((!edges || edges.length === 0) && window._sharedData) {
        try {
          const sm = window._sharedData.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
          if (sm?.edge_media_to_parent_comment) {
            edges = sm.edge_media_to_parent_comment.edges || [];
            page_info = sm.edge_media_to_parent_comment.page_info || null;
            total_count = sm.edge_media_to_parent_comment.count || total_count || null;
            source = '_sharedData';
          }
        } catch(e) {}
      }

      // try GraphQL initial if needed
      if (!edges || edges.length === 0) {
        const gqlInit = await fetchCommentsGraphQL(shortcode, PER_PAGE, null);
        if (gqlInit) { edges = gqlInit.edges || []; page_info = gqlInit.page_info || null; source = 'graphql'; }
      }

      // pagination
      let allEdges = Array.from(edges || []);
      let cursor = page_info?.end_cursor || null;
      let hasNext = Boolean(page_info?.has_next_page);
      let rounds = 0;
      notifyProgress({ phase: 'start', timestamp: Date.now(), total_estimate: total_count || null });

      while ((hasNext || cursor) && rounds < 2000) {
        if (total_count && allEdges.length >= total_count) break;
        setOverlay('Paginating comments...', 10 + Math.min(60, rounds*2), `collected ${allEdges.length}`);
        const gql = await fetchCommentsGraphQL(shortcode, PER_PAGE, cursor);
        if (!gql || !gql.edges || gql.edges.length === 0) break;
        allEdges.push(...gql.edges);
        cursor = gql.page_info?.end_cursor || null;
        hasNext = Boolean(gql.page_info?.has_next_page);
        rounds++;
        // notify per page
        notifyProgress({ phase: 'page_fetched', pageIndex: rounds, itemsFetchedSoFar: allEdges.length, timestamp: Date.now(), total_estimate: total_count || null });
        await sleep(200);
      }

      // dedupe and flatten top-level + threaded
      setOverlay('Formatting & fetching threaded replies...', 75, `total top-level: ${allEdges.length}`);
      const seen = new Set(); const dedup = [];
      for (const e of allEdges) {
        const id = (e.node && (e.node.id || e.node.pk)) || e.id || JSON.stringify(e).slice(0,50);
        if (!id) continue;
        if (!seen.has(id)) { seen.add(id); dedup.push(e); }
      }

      // flatten with threaded (best-effort)
      const rows = [];
      for (let i = 0; i < dedup.length; i++) {
        const e = dedup[i]; const node = e.node || e;
        const top = normalizeNode(node);
        if (!top) continue;
        rows.push({ CommentID: top.id, ParentID: '', IsReply: 'false', Username: top.username, Text: top.text, Timestamp_ISO: top.timestamp_iso, Timestamp_IST: top.timestamp_ist, LikeCount: top.like_count, ReplyCount: top.reply_count, Source: source });

        // inline replies
        if (Array.isArray(top.repliesEdges) && top.repliesEdges.length) {
          for (const r of top.repliesEdges) {
            const rn = r.node || r; const rep = normalizeNode(rn);
            if (!rep) continue;
            rows.push({ CommentID: rep.id, ParentID: top.id, IsReply: 'true', Username: rep.username, Text: rep.text, Timestamp_ISO: rep.timestamp_iso, Timestamp_IST: rep.timestamp_ist, LikeCount: rep.like_count, ReplyCount: rep.reply_count, Source: source + '_inline' });
          }
        }

        // threaded fetch if needed
        const threadedContainer = node.edge_threaded_comments || node.node?.edge_threaded_comments || null;
        const inlineCount = (top.repliesEdges && top.repliesEdges.length) || 0;
        const shouldPaginate = options.threadedReplies && ((threadedContainer && threadedContainer.page_info && threadedContainer.page_info.has_next_page) || (top.reply_count > inlineCount));
        if (shouldPaginate) {
          const startCursor = threadedContainer?.page_info?.end_cursor || null;
          const threaded = await fetchThreadedReplies(shortcode, top.id, startCursor);
          if (threaded && threaded.length) {
            for (const tr of threaded) {
              const tnode = tr.node || tr; const tret = normalizeNode(tnode);
              if (!tret) continue;
              rows.push({ CommentID: tret.id, ParentID: top.id, IsReply: 'true', Username: tret.username, Text: tret.text, Timestamp_ISO: tret.timestamp_iso, Timestamp_IST: tret.timestamp_ist, LikeCount: tret.like_count, ReplyCount: tret.reply_count, Source: source + '_threaded' });
            }
            notifyProgress({ phase: 'thread_fetched', parentCommentId: top.id, threadedFetched: threaded.length, itemsFetchedSoFar: rows.length, timestamp: Date.now(), total_estimate: total_count || null });
          } else {
            notifyProgress({ phase: 'thread_fetched', parentCommentId: top.id, threadedFetched: 0, itemsFetchedSoFar: rows.length, timestamp: Date.now(), total_estimate: total_count || null });
          }
        }

        if (i % 30 === 0) {
          // update overlay progress
          setOverlay(`Processing comments ${i+1}/${dedup.length}`, 75 + Math.round(((i+1)/dedup.length)*10));
        }
      }

      // optionally fetch profiles
      let profileMap = new Map();
      const usernames = Array.from(new Set(rows.map(r => r.Username).filter(Boolean)));
      if (options.fetchProfiles && usernames.length) {
        setOverlay('Fetching commenter profiles...', 90, `profiles: 0/${usernames.length}`);
        const unique = usernames;
        let fetchedProfiles = 0;
        for (let i = 0; i < unique.length; i += PROFILE_CONCURRENCY) {
          const batch = unique.slice(i, i + PROFILE_CONCURRENCY);
          await Promise.all(batch.map(async (u) => {
            const p = await fetchProfile(u);
            if (p) profileMap.set(u, p);
            else profileMap.set(u, { username: u, full_name: '', is_verified: false, followers_count: 0, profile_pic_url: '', profile_url: `https://www.instagram.com/${u}/` });
            fetchedProfiles++;
          }));
          notifyProgress({ phase: 'profiles_progress', profilesFetched: fetchedProfiles, totalProfiles: unique.length, timestamp: Date.now() });
          setOverlay(`Profiles ${fetchedProfiles}/${unique.length}`, 90 + Math.round((fetchedProfiles/unique.length)*8));
          await sleep(PROFILE_DELAY);
        }
      } else {
        notifyProgress({ phase: 'profiles_progress', profilesFetched: 0, totalProfiles: usernames.length, timestamp: Date.now() });
      }

      // attach profile columns
      const finalRows = rows.map(r => {
        const p = profileMap.get(r.Username) || { full_name:'', profile_pic_url:'', is_verified:false, followers_count:0, profile_url:`https://www.instagram.com/${r.Username}/` };
        return Object.assign({}, r, {
          ProfileFullName: p.full_name || '',
          ProfilePicURL: p.profile_pic_url || '',
          IsVerifiedProfile: p.is_verified ? 'true' : 'false',
          FollowersCount: p.followers_count || 0,
          ProfileURL: p.profile_url || `https://www.instagram.com/${r.Username}/`
        });
      });

            let uploadResult = null;
      if (options.saasApiUrl && options.saasApiKey) {
        try {
          const uploadResp = await fetch(`${options.saasApiUrl.replace(/\/$/, '')}/scrape-jobs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': options.saasApiKey
            },
            body: JSON.stringify({
              metadata: {
                shortcode,
                source,
                exportedAt: new Date().toISOString()
              },
              rows: finalRows
            })
          });

          const uploadData = await uploadResp.json().catch(() => ({}));
          if (!uploadResp.ok) {
            uploadResult = `upload_failed:${uploadData.error || uploadResp.status}`;
          } else {
            uploadResult = `uploaded_job:${uploadData.jobId || 'unknown'}`;
          }
        } catch (err) {
          uploadResult = `upload_error:${err.message || String(err)}`;
        }
      }
      // build CSV
      const headers = ['CommentID','ParentID','IsReply','Username','Text','Timestamp_ISO','Timestamp_IST','LikeCount','ReplyCount','Source','ProfileFullName','ProfilePicURL','IsVerifiedProfile','FollowersCount','ProfileURL'];
      const csvRows = finalRows.map(r => {
        return [
          `"${(r.CommentID||'').replace(/"/g,'""')}"`,
          `"${(r.ParentID||'').replace(/"/g,'""')}"`,
          r.IsReply,
          `"${(r.Username||'').replace(/"/g,'""')}"`,
          `"${(r.Text||'').replace(/"/g,'""')}"`,
          `"${(r.Timestamp_ISO||'').replace(/"/g,'""')}"`,
          `"${(r.Timestamp_IST||'').replace(/"/g,'""')}"`,
          (r.LikeCount||0),
          (r.ReplyCount||0),
          `"${(r.Source||'').replace(/"/g,'""')}"`,
          `"${(r.ProfileFullName||'').replace(/"/g,'""')}"`,
          `"${(r.ProfilePicURL||'').replace(/"/g,'""')}"`,
          `"${(r.IsVerifiedProfile||'').replace(/"/g,'""')}"`,
          (r.FollowersCount||0),
          `"${(r.ProfileURL||'').replace(/"/g,'""')}"`
        ].join(',');
      });
      const csv = [headers.join(','), ...csvRows].join('\n');

      // notify done and start download
      notifyProgress({ phase: 'done', timestamp: Date.now(), totalRows: finalRows.length, uploadResult });
      setOverlay('Preparing download...', 100, `rows: ${finalRows.length}`);
      downloadCSVWithBOM(csv, `instagram_comments_full_${shortcode}_${Date.now()}.csv`);
      await sleep(500);
      overlay.remove();
    } catch (err) {
      console.error('[ig-detailed-scraper] fatal', err);
      notifyProgress({ phase: 'error', message: err && err.message ? err.message : String(err) });
      try { document.getElementById('__ig_status').textContent = 'Error'; } catch(e){}
    }
  })();
}






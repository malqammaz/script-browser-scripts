// Script Browser: async function body; no import/export or outer wrapper.
// Collects episodes listed on the current page and their player URLs.
const MAX_EPISODES = 300;
const REQUEST_DELAY_MS = 350;
const TIMEOUT_MS = 20000;
const origin = location.origin;
const absolute = (value, base) => {
  try {
    const u = new URL(value, base);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch { return null; }
};
const clean = value => (value || '').replace(/\s+/g, ' ').trim();
const numberOf = value => {
  const normalized = value.replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const m = normalized.match(/(?:الحلقة|حلقة|episode|\bep\b)[\s:_-]*(\d+)/i);
  return m ? Number(m[1]) : null;
};
const candidates = new Map();
for (const a of document.querySelectorAll('a[href]')) {
  const url = absolute(a.getAttribute('href'), location.href);
  if (!url || new URL(url).origin !== origin) continue;
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch {}
  const text = clean(a.textContent || a.getAttribute('aria-label'));
  const inEpisodes = a.closest('#epsGrid, .epsGrid, #show-episodes, .show-episodes, .episodes-list, .episode-list');
  const number = numberOf(text) ?? numberOf(decoded);
  if (!inEpisodes && number === null) continue;
  if (/الحلقة التالية|الحلقة السابقة|تفاصيل الحلقة/.test(text)) continue;
  const u = new URL(url);
  u.hash = '';
  const key = u.href;
  const old = candidates.get(key);
  if (!old || numberOf(text) !== null) candidates.set(key, { number, title: text || `Episode ${number ?? ''}`, url: key });
}
// On Yalanime the watch links identify this show's episodes precisely.
let episodes = [...candidates.values()];
if (episodes.some(e => /\/watch\/?(?:\?|$)/.test(e.url))) {
  episodes = episodes.filter(e => /\/watch\/?(?:\?|$)/.test(e.url));
}
episodes.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
const discovered = episodes.length;
episodes = episodes.slice(0, MAX_EPISODES);
if (!episodes.length) return {
  page: location.href,
  error: 'لم أجد روابط حلقات واضحة. افتح صفحة الأنمي أو قائمة حلقاته. قد يحتاج هذا الموقع محددات خاصة.',
  episodes: []
};
function extract(doc, base) {
  const found = new Map();
  const add = (raw, label, type) => {
    const url = absolute(raw, base);
    if (!url) return;
    const key = `${type}:${url}`;
    if (!found.has(key)) found.set(key, { label: clean(label), type, url });
  };
  for (const el of doc.querySelectorAll('[data-server], [data-embed], [data-video], [data-src], iframe[src], video[src], video source[src], a[href]')) {
    const label = el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '';
    for (const attr of ['data-server', 'data-embed', 'data-video']) {
      if (el.hasAttribute(attr)) add(el.getAttribute(attr), label, 'player');
    }
    if (el.tagName === 'IFRAME') add(el.getAttribute('src') || el.getAttribute('data-src'), label, 'iframe');
    if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') add(el.getAttribute('src'), label, 'media');
    if (el.tagName === 'A') {
      const raw = el.getAttribute('href') || '';
      if (/dood|d000|uqload|mega\.nz|morencius|vidara|streamtape|filemoon|streamwish|mixdrop|\.m3u8(?:\?|$)|\.mp4(?:\?|$)/i.test(raw)) {
        add(raw, label, /\.m3u8(?:\?|$)|\.mp4(?:\?|$)/i.test(raw) ? 'media' : 'host-link');
      }
    }
  }
  return [...found.values()];
}
const results = [];
for (const episode of episodes) {
  try {
    let doc;
    let base = episode.url;
    const current = new URL(location.href); current.hash = '';
    if (episode.url === current.href) doc = document;
    else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(episode.url, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (new URL(response.url).origin !== origin) throw new Error('Unexpected redirect outside site');
        base = response.url;
        const html = await response.text();
        doc = new DOMParser().parseFromString(html, 'text/html');
      } finally { clearTimeout(timer); }
    }
    const links = extract(doc, base);
    results.push({ ...episode, links, ...(links.length ? {} : { warning: 'لا توجد روابط ظاهرة في HTML؛ قد تتطلب الصفحة JavaScript أو تسجيل دخول.' }) });
  } catch (error) {
    results.push({ ...episode, links: [], error: String(error.message || error) });
  }
  if (episode !== episodes[episodes.length - 1]) await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
}
return {
  title: document.title,
  page: location.href,
  discovered,
  processed: results.length,
  truncated: discovered > MAX_EPISODES,
  note: 'روابط السيرفرات مستخرجة فقط ولم يتم التحقق من تشغيلها. يجمع الحلقات المدرجة في الصفحة الحالية؛ لا يجتاز صفحات القوائم تلقائياً.',
  episodes: results
};

// Part G - server-rendered, locale-driven feedback page.
const fs = require('fs/promises');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', '..', 'locales');
const SUPPORTED = ['en', 'fr'];
const DEFAULT_LANG = 'en';
const cache = new Map();

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Unsupported / missing / odd (array, object) lang values fall back to English. */
function resolveLang(value) {
  return typeof value === 'string' && SUPPORTED.includes(value.toLowerCase()) ? value.toLowerCase() : DEFAULT_LANG;
}

async function loadLocale(lang) {
  if (!cache.has(lang)) {
    cache.set(lang, JSON.parse(await fs.readFile(path.join(LOCALES_DIR, `${lang}.json`), 'utf8')));
  }
  return cache.get(lang);
}

function formatToday(lang, now = new Date()) {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(now);
}

function renderPage(lang, t, now = new Date()) {
  const questions = t.questions.map((q, i) => `
      <div class="q">
        <label for="q${i + 1}">${i + 1}. ${escapeHtml(q)}</label>
        <textarea id="q${i + 1}" name="q${i + 1}" rows="4" required></textarea>
      </div>`).join('');
  const switcher = SUPPORTED.map((l) => (l === lang
    ? `<strong>${l.toUpperCase()}</strong>` : `<a href="/feedback?lang=${l}">${l.toUpperCase()}</a>`)).join(' | ');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(t.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    .q { margin: 1.25rem 0; } label { display: block; font-weight: 600; margin-bottom: .35rem; }
    textarea { width: 100%; box-sizing: border-box; padding: .5rem; font: inherit; }
    .meta { color: #555; display: flex; justify-content: space-between; }
    button { padding: .6rem 1.2rem; font: inherit; cursor: pointer; }
  </style>
</head>
<body>
  <div class="meta"><span>${escapeHtml(t.dateLabel)}: ${escapeHtml(formatToday(lang, now))}</span><span>${switcher}</span></div>
  <h1>${escapeHtml(t.title)}</h1>
  <p>${escapeHtml(t.instructions)}</p>
  <form onsubmit="event.preventDefault(); alert(${JSON.stringify(t.thanks)});">${questions}
    <button type="submit">${escapeHtml(t.submit)}</button>
  </form>
</body>
</html>`;
}

exports.page = async (req, res) => {
  const lang = resolveLang(req.query.lang);
  const t = await loadLocale(lang);
  res.type('html').send(renderPage(lang, t));
};

exports._internals = { resolveLang, formatToday, renderPage };

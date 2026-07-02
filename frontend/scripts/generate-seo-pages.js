// Postbuild step: this is a plain create-react-app SPA, so every route serves the
// exact same static index.html (title/meta/JSON-LD only update after React mounts
// and react-helmet-async runs). Crawlers that don't execute JS — and even Google's
// first crawl pass — see byte-identical content on every URL, which is why only "/"
// was getting indexed. This script clones the already-built index.html (so the
// hashed JS/CSS bundle references stay correct) once per public route, swapping in
// route-specific title/meta/OG/canonical/JSON-LD/H1/intro text. React still mounts
// normally and takes over client-side routing — this only affects the first byte a
// crawler (or a user hitting the URL directly) sees before JS runs.

const fs = require('fs');
const path = require('path');
const { PAGE_META } = require('../src/seoMeta');

const SITE = 'https://praqen.com';
const BUILD_DIR = path.join(__dirname, '..', 'build');
const INDEX_PATH = path.join(BUILD_DIR, 'index.html');

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJson(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildPage(template, route, meta) {
  const canonical = `${SITE}${route === '/' ? '' : route}`;
  let html = template;

  // Self-closing void elements (meta/link) come out of the production build as
  // e.g. `content="..."/>` with no space before the slash — match either way.
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${meta.description.replace(/"/g, '&quot;')}"/>`
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${canonical}"/>`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${canonical}"/>`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${meta.ogTitle.replace(/"/g, '&quot;')}"/>`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${meta.ogDesc.replace(/"/g, '&quot;')}"/>`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${meta.ogTitle.replace(/"/g, '&quot;')}"/>`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${meta.ogDesc.replace(/"/g, '&quot;')}"/>`
  );

  // JSON-LD WebPage node — replace the whole node body in one shot so this
  // page's structured data describes itself, not the homepage.
  html = html.replace(
    /"@type":\s*"WebPage",\s*"@id":\s*"[^"]*",\s*"url":\s*"[^"]*",\s*"name":\s*"[^"]*",\s*"isPartOf":\s*\{[^}]*\},\s*"about":\s*\{[^}]*\},\s*"description":\s*"[^"]*"/,
    `"@type": "WebPage",\n          "@id": "${canonical}#webpage",\n          "url": "${canonical}",\n          "name": "${escapeJson(meta.title)}",\n          "isPartOf": { "@id": "${SITE}/#website" },\n          "about": { "@id": "${SITE}/#organization" },\n          "description": "${escapeJson(meta.description)}"`
  );

  // Hidden crawler-readable body + noscript fallback — swap the H1 and intro
  // paragraph so each route has genuinely unique first-paragraph content.
  html = html.replace(
    /(<h1>)[^<]*(<\/h1>)/g,
    `$1${escapeHtml(meta.h1)}$2`
  );
  html = html.replace(
    /(<div id="praqen-seo-body"[^>]*>\s*<h1>[^<]*<\/h1>\s*<p>)[^<]*(<\/p>)/,
    `$1${escapeHtml(meta.intro)}$2`
  );
  html = html.replace(
    /(<noscript>[\s\S]*?<h1>[^<]*<\/h1>\s*<p>)[^<]*(<\/p>)/,
    `$1${escapeHtml(meta.intro)}$2`
  );

  return html;
}

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('[generate-seo-pages] build/index.html not found — run `react-scripts build` first.');
    process.exit(1);
  }
  const template = fs.readFileSync(INDEX_PATH, 'utf8');

  Object.entries(PAGE_META).forEach(([route, meta]) => {
    if (route === '/') return; // homepage index.html is already correct as-is
    const html = buildPage(template, route, meta);
    const outDir = path.join(BUILD_DIR, route.replace(/^\//, ''));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    console.log(`[generate-seo-pages] wrote ${path.relative(BUILD_DIR, outDir)}/index.html`);
  });
}

main();

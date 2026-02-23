const fs = require('fs');
const path = require('path');
const marked = require('marked');
const matter = require('gray-matter');

marked.setOptions({ headerIds: false, mangle: false });

const AUTHORS = {
    angel:   { name: 'Ángel',   initial: 'Á', bio: 'Ingeniero de telecomunicaciones reconvertido en consultor de arquitecturas API.' },
    javi:    { name: 'Javi',    initial: 'J', bio: 'El espacio está listo. La primera entrada, en camino.' },
    antonio: { name: 'Antonio', initial: 'A', bio: 'Periodista. Escribe sobre cultura, medios y el lado terapéutico del arte. Co-fundador de NousArchives.' },
};

const ROOT = path.join(__dirname, '..');
const posts = [];

// ── UTILIDADES ────────────────────────────────────────────────────────────────

function calcReadtime(text) {
    const words = text.trim().split(/\s+/).length;
    const mins = Math.max(1, Math.round(words / 200));
    return `${mins} min`;
}

function extractToc(markdown) {
    const headings = [];
    const lines = markdown.split('\n');
    lines.forEach(line => {
        const m = line.match(/^(#{2,3})\s+(.+)/);
        if (m) {
            const level = m[1].length;
            const text = m[2].trim();
            const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            headings.push({ level, text, id });
        }
    });
    return headings;
}

function buildTocHTML(headings) {
    if (headings.length < 3) return '';
    const items = headings.map(h => {
        const indent = h.level === 3 ? ' style="padding-left:1rem;"' : '';
        return `<li${indent}><a href="#${h.id}">${h.text}</a></li>`;
    }).join('\n            ');
    return `
    <nav class="toc">
        <div class="toc-label">Índice</div>
        <ol class="toc-list">
            ${items}
        </ol>
    </nav>`;
}

// Inyecta IDs en los headings del HTML generado para que los enlaces del ToC funcionen
function injectHeadingIds(html) {
    return html.replace(/<h([23])>([^<]+)<\/h\1>/g, (match, level, text) => {
        const id = text.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `<h${level} id="${id}">${text}</h${level}>`;
    });
}

function relatedPostsHTML(currentPost, allPosts) {
    const related = allPosts
        .filter(p => p.url !== currentPost.url)
        .map(p => {
            const sharedTags = p.tags.filter(t => currentPost.tags.includes(t)).length;
            const sameAuthor = p.authorSlug === currentPost.authorSlug ? 1 : 0;
            return { post: p, score: sharedTags * 2 + sameAuthor };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(x => x.post);

    if (related.length === 0) return '';

    const items = related.map(p => {
        const typeLabel = p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : '';
        return `
            <a href="../${p.url}" class="related-item">
                <div class="related-meta">
                    <span class="pub-author">${p.author}</span>
                    <span class="pub-type ${p.type}">${typeLabel}</span>
                </div>
                <span class="related-title">${p.title}</span>
                <span class="pub-tldr">${p.tldr}</span>
            </a>`;
    }).join('');

    return `
    <section class="related-posts">
        <div class="section-header">
            <span class="section-label">También en NousArchives</span>
            <div class="section-rule"></div>
        </div>
        <div class="related-grid">
            ${items}
        </div>
    </section>`;
}

// ── CABECERA HTML COMÚN ──────────────────────────────────────────────────────
function htmlHead(title, depth = 1) {
    const rel = '../'.repeat(depth);
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — NousArchives</title>
    <link rel="icon" type="image/jpeg" href="${rel}logo_color.jpg">
    <link rel="stylesheet" href="${rel}style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
</head>`;
}

// ── NAV ───────────────────────────────────────────────────────────────────────
function authorNav(depth = 1) {
    const rel = '../'.repeat(depth);
    return `    <nav class="topnav">
        <a href="${rel}" class="nav-left">← NousArchives</a>
        <a href="${rel}" class="nav-center"><img src="${rel}logo.png" alt="NousArchives" class="nav-logo"></a>
        <div class="nav-links">
            <button class="dark-toggle" id="dark-toggle" aria-label="Modo oscuro">◐</button>
            <a href="${rel}archivo.html">Archivo</a>
            <a href="https://youtube.com/@NousArchives" target="_blank">YouTube ↗</a>
        </div>
    </nav>`;
}

// ── FOOTER ────────────────────────────────────────────────────────────────────
function authorFooter(depth = 1) {
    const rel = '../'.repeat(depth);
    return `    <footer class="footer">
        <div class="footer-top">
            <a href="${rel}" class="footer-logo">NousArchives</a>
            <nav class="footer-nav">
                <a href="${rel}archivo.html">Archivo</a>
                <a href="https://youtube.com/@NousArchives" target="_blank">YouTube ↗</a>
            </nav>
        </div>
        <div class="footer-bottom">
            <span>© 2026 NousArchives</span>
            <span>Contenido bajo <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank">CC BY-NC-SA 4.0</a> · Código bajo <a href="${rel}LICENSE">MIT</a></span>
        </div>
    </footer>`;
}

// ── SCRIPT COMPARTIDO ─────────────────────────────────────────────────────────
const sharedScript = `
    <script>
        // Dark mode (aplicar antes de pintar para evitar flash)
        (function() {
            const saved = localStorage.getItem('theme');
            if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        })();
        document.addEventListener('DOMContentLoaded', function() {
            // Dark mode toggle
            const btn = document.getElementById('dark-toggle');
            if (btn) {
                btn.addEventListener('click', function() {
                    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
                    localStorage.setItem('theme', isDark ? 'light' : 'dark');
                });
            }
            // Volver arriba
            const backBtn = document.getElementById('back-to-top');
            if (backBtn) {
                window.addEventListener('scroll', function() {
                    backBtn.classList.toggle('visible', window.scrollY > 600);
                });
                backBtn.addEventListener('click', function() {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            }
            // Scrollbar nA — SVG rotado
            // El SVG está rotado 90deg: el eje Y del SVG es el eje horizontal visual
            // El thumb se mueve en X (eje horizontal del SVG = vertical visual)
            // Track ocupa x: 115 a 18872 en coords internas → en SVG real: 115 a 1872
            const naThumb = document.getElementById('na-thumb-rect');
            if (naThumb) {
                const TRACK_LEFT = 115;   // x inicio de la n en coords SVG reales
                const TRACK_RIGHT = 1872; // x fin de la A en coords SVG reales
                const TRACK_LEN = TRACK_RIGHT - TRACK_LEFT;
                function updateNaThumb() {
                    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                    if (maxScroll <= 0) return;
                    const ratio = window.scrollY / maxScroll;
                    const thumbW = Math.max(80, TRACK_LEN * (window.innerHeight / document.documentElement.scrollHeight));
                    const pos = TRACK_LEFT + ratio * (TRACK_LEN - thumbW);
                    naThumb.setAttribute('x', pos);
                    naThumb.setAttribute('width', thumbW);
                }
                window.addEventListener('scroll', updateNaThumb, { passive: true });
                window.addEventListener('resize', updateNaThumb);
                updateNaThumb();
            }
        });
    </script>`;

const naScrollbar = `
    <div class="na-scrollbar" aria-hidden="true">
        <!--
            SVG del logo nA rotado 90deg para usarlo como scrollbar.
            El path original ocupa x:1158-18700, y:5200-6400 en coords internas (antes del scale).
            Aplicamos el mismo transform del SVG original: translate(0,1080) scale(0.1,-0.1)
            Luego recortamos con viewBox y rotamos 90deg el conjunto.
            viewBox recortado en coords SVG reales: x=115, y=422, w=1757, h=136
            Al rotar 90deg: w=136 → ancho (cabe en 32px), h=1757 → alto
            Scale = 32/136 = 0.2353  →  alto resultado = 1757*0.2353 = 413px
            Añadimos padding arriba y abajo para llegar a 800px: (800-413)/2 = 193.5
        -->
        <svg id="na-svg"
             viewBox="-193.5 115 800 136"
             preserveAspectRatio="none"
             xmlns="http://www.w3.org/2000/svg"
             style="transform: rotate(90deg); transform-origin: center center; width:32px; height:100%; position:absolute; top:0; left:0;">
            <g transform="translate(0,1080) scale(0.1,-0.1)" fill="currentColor" opacity="0.4">
                <path d="M18272 5803 c-11 -27 -295 -844 -304 -872 -4 -12 -97 -14 -639 -13
-349 1 -4061 9 -8249 18 -4188 8 -7638 17 -7667 20 l-52 5 -3 247 c-3 230 -4
250 -25 287 -44 84 -104 115 -216 115 -87 0 -131 -16 -186 -66 l-39 -35 -14
43 -15 43 -71 3 -72 3 2 -347 3 -346 90 -2 90 -1 5 225 c6 261 12 285 84 320
50 24 66 25 111 6 57 -24 60 -37 65 -306 l5 -245 945 -2 c520 -1 3798 -9 7285
-18 7118 -17 8644 -19 8652 -11 3 3 24 61 48 128 l41 123 210 0 209 0 41 -125
41 -125 61 -3 60 -3 -45 128 c-25 70 -67 191 -94 268 -27 77 -82 235 -122 350
l-74 210 -75 3 c-74 3 -75 2 -86 -25z m173 -325 c43 -128 80 -239 83 -245 3
-10 -36 -13 -173 -13 -137 0 -176 3 -173 13 3 6 40 117 83 245 43 127 83 232
90 232 6 0 47 -105 90 -232z"/>
            </g>
            <!-- thumb: rect vertical que se mueve. En este SVG rotado, y=posición horizontal original -->
            <rect id="na-thumb-rect" x="115" y="480" width="1757" height="4" fill="currentColor" opacity="0.8"/>
        </svg>
    </div>`;

const backToTopBtn = `    <button class="back-to-top" id="back-to-top" aria-label="Volver arriba">↑</button>`;

// ── TEMPLATE ARTÍCULO ────────────────────────────────────────────────────────
function articleTemplate(fm, htmlContent, authorSlug, tocHTML, relatedHTML) {
    const author = AUTHORS[authorSlug];
    const tagsHTML = (fm.tags || []).map(t => `<span class="pub-tag">${t}</span>`).join('');
    const typeLabel = fm.type ? fm.type.charAt(0).toUpperCase() + fm.type.slice(1) : '';

    return `${htmlHead(fm.title, 1)}
<body class="article-page">
    <div class="progress-bar" id="progress-bar"></div>
${authorNav(1)}
    <article>
        <header class="article-header">
            <div class="article-meta-top">
                <span><a href="../${authorSlug}/" style="color:inherit;text-decoration:none;">${author ? author.name : authorSlug}</a></span>
                <span>·</span>
                ${fm.type ? `<span class="pub-type ${fm.type}">${typeLabel}</span>` : ''}
                <span>·</span>
                <span>${fm.readtime}</span>
                <span>·</span>
                <span>${fm.wordcount} palabras</span>
            </div>
            <h1 class="article-title">${fm.title}</h1>
            ${fm.tldr ? `<p class="article-subtitle">${fm.tldr}</p>` : ''}
            <div class="article-byline">
                <span>${fm.date || ''}</span>
            </div>
            ${tagsHTML ? `<div class="article-tags">${tagsHTML}</div>` : ''}
        </header>
        ${tocHTML}
        <div class="article-body">
            ${htmlContent}
        </div>
    </article>
    ${relatedHTML}
${authorFooter(1)}
${backToTopBtn}
${naScrollbar}
    <script>
        // Barra de progreso de lectura
        window.addEventListener('scroll', function() {
            const article = document.querySelector('.article-body');
            if (!article) return;
            const bar = document.getElementById('progress-bar');
            const start = article.offsetTop;
            const end = article.offsetTop + article.offsetHeight - window.innerHeight;
            const progress = Math.min(100, Math.max(0, ((window.scrollY - start) / (end - start)) * 100));
            bar.style.width = progress + '%';
        });
    </script>
${sharedScript}
</body>
</html>`;
}

// ── TEMPLATE PÁGINA DE AUTOR ─────────────────────────────────────────────────
function authorPageTemplate(slug) {
    const author = AUTHORS[slug];
    return `${htmlHead(author.name, 1)}
<body>
${authorNav(1)}
    <header class="author-hero">
        <div class="author-hero-initial">${author.initial}</div>
        <div class="author-hero-right">
            <h1 class="author-hero-name">${author.name}</h1>
            <p class="author-hero-bio">${author.bio}</p>
            <div class="author-hero-meta">
                <span id="post-count">0 entradas</span>
            </div>
        </div>
    </header>

    <section class="author-posts-section">
        <div class="section-header">
            <span class="section-label">Todas las entradas</span>
            <div class="section-rule"></div>
        </div>
        <div id="author-pub-list"></div>
    </section>

${authorFooter(1)}
${backToTopBtn}
${naScrollbar}
    <script src="../posts.js"></script>
    <script>
        const CURRENT_AUTHOR_SLUG = "${slug}";
        function renderAuthorPage() {
            const pubList = document.getElementById('author-pub-list');
            const countLabel = document.getElementById('post-count');
            const myPosts = POSTS.filter(p => p.authorSlug === CURRENT_AUTHOR_SLUG);
            if (countLabel) {
                countLabel.textContent = myPosts.length + ' ' + (myPosts.length === 1 ? 'entrada' : 'entradas');
            }
            if (myPosts.length === 0) {
                pubList.innerHTML = '<div class="pub-empty"><span class="pub-empty-glyph">∅</span><p>Todavía no hay nada por aquí.<br>Pero el silencio también dice algo.</p></div>';
                return;
            }
            const listContainer = document.createElement('div');
            listContainer.className = 'pub-list';
            myPosts.forEach(post => {
                const tagsHTML = post.tags.map(t => '<span class="pub-tag">' + t + '</span>').join('');
                const postUrl = post.url.split('/').pop();
                const typeLabel = post.type ? post.type.charAt(0).toUpperCase() + post.type.slice(1) : '';
                listContainer.innerHTML += \`
                    <a href="\${postUrl}" class="pub-item">
                        <div class="pub-left">
                            <span class="pub-author">\${post.author}</span>
                            <span class="pub-date">\${post.date}</span>
                        </div>
                        <div class="pub-center">
                            <span class="pub-title">\${post.title}</span>
                            <span class="pub-tldr">\${post.tldr}</span>
                            <div class="pub-tags">\${tagsHTML}</div>
                        </div>
                        <div class="pub-right">
                            <span class="pub-type \${post.type}">\${typeLabel}</span>
                            <span class="pub-readtime">\${post.readtime}</span>
                        </div>
                    </a>\`;
            });
            pubList.appendChild(listContainer);
        }
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof POSTS !== 'undefined') renderAuthorPage();
        });
    </script>
${sharedScript}
</body>
</html>`;
}

// ── PÁGINA /archivo ───────────────────────────────────────────────────────────
function archivoPageTemplate() {
    return `${htmlHead('Archivo', 0)}
<body>
    <nav class="topnav">
        <a href="./" class="nav-left">← NousArchives</a>
        <a href="./" class="nav-center"><img src="logo.png" alt="NousArchives" class="nav-logo"></a>
        <div class="nav-links">
            <button class="dark-toggle" id="dark-toggle" aria-label="Modo oscuro">◐</button>
            <a href="https://youtube.com/@NousArchives" target="_blank">YouTube ↗</a>
        </div>
    </nav>

    <header class="hero" style="padding-bottom:0;">
        <h1 class="hero-title" style="font-size:clamp(2.5rem,7vw,5rem);">Archivo</h1>
        <div class="hero-meta" style="padding-bottom:3rem;">Todas las entradas por orden cronológico</div>
    </header>

    <main class="content" style="padding-bottom:5rem;">
        <div id="archivo-list"></div>
    </main>

    <footer class="footer">
        <div class="footer-top">
            <a href="./" class="footer-logo">NousArchives</a>
            <nav class="footer-nav">
                <a href="https://youtube.com/@NousArchives" target="_blank">YouTube ↗</a>
            </nav>
        </div>
        <div class="footer-bottom">
            <span>© 2026 NousArchives</span>
            <span>Contenido bajo <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank">CC BY-NC-SA 4.0</a> · Código bajo <a href="LICENSE">MIT</a></span>
        </div>
    </footer>
${backToTopBtn}
${naScrollbar}
    <script src="posts.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof POSTS === 'undefined') return;
            const container = document.getElementById('archivo-list');

            // Agrupar por año-mes
            const groups = {};
            POSTS.forEach(post => {
                const d = new Date(post.date);
                const key = isNaN(d) ? 'Sin fecha' : d.getFullYear() + '-' + String(d.getMonth()).padStart(2,'0');
                const label = isNaN(d) ? 'Sin fecha' : d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                if (!groups[key]) groups[key] = { label, posts: [] };
                groups[key].posts.push(post);
            });

            const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
            sortedKeys.forEach(key => {
                const g = groups[key];
                const section = document.createElement('div');
                section.innerHTML = \`
                    <div class="section-header">
                        <span class="section-label">\${g.label}</span>
                        <div class="section-rule"></div>
                    </div>\`;
                const list = document.createElement('div');
                list.className = 'pub-list';
                g.posts.forEach(post => {
                    const tagsHTML = post.tags.map(t => '<span class="pub-tag">' + t + '</span>').join('');
                    const typeLabel = post.type ? post.type.charAt(0).toUpperCase() + post.type.slice(1) : '';
                    list.innerHTML += \`
                        <a href="\${post.url}" class="pub-item">
                            <div class="pub-left">
                                <span class="pub-author">\${post.author}</span>
                                <span class="pub-date">\${post.date}</span>
                            </div>
                            <div class="pub-center">
                                <span class="pub-title">\${post.title}</span>
                                <span class="pub-tldr">\${post.tldr}</span>
                                <div class="pub-tags">\${tagsHTML}</div>
                            </div>
                            <div class="pub-right">
                                <span class="pub-type \${post.type}">\${typeLabel}</span>
                                <span class="pub-readtime">\${post.readtime}</span>
                            </div>
                        </a>\`;
                });
                section.appendChild(list);
                container.appendChild(section);
            });
        });
    </script>
${sharedScript}
</body>
</html>`;
}

// ── PROCESADO DE AUTORES ─────────────────────────────────────────────────────
Object.keys(AUTHORS).forEach(slug => {
    const authorDir = path.join(ROOT, slug);
    if (!fs.existsSync(authorDir)) {
        fs.mkdirSync(authorDir);
        console.log(`📁 Creado directorio: ${slug}/`);
    }

    fs.writeFileSync(path.join(authorDir, 'index.html'), authorPageTemplate(slug));

    const files = fs.readdirSync(authorDir);

    files.forEach(file => {
        if (!file.endsWith('.md')) return;

        const filePath = path.join(authorDir, file);
        const raw = fs.readFileSync(filePath, 'utf-8');

        let fm, body;
        try {
            const parsed = matter(raw);
            fm = parsed.data;
            body = parsed.content;
        } catch (e) {
            console.warn(`⚠️  Frontmatter inválido en ${slug}/${file}: ${e.message}`);
            return;
        }

        if (!fm.title) {
            console.warn(`⚠️  Sin título en ${slug}/${file}, saltando.`);
            return;
        }

        if (!Array.isArray(fm.tags)) {
            fm.tags = fm.tags ? String(fm.tags).replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean) : [];
        }

        if (!fm.author) fm.author = AUTHORS[slug]?.name || slug;
        fm.authorSlug = slug;

        // Readtime y wordcount automáticos (override si el autor lo especificó)
        const wordcount = body.trim().split(/\s+/).length;
        fm.wordcount = wordcount;
        if (!fm.readtime) fm.readtime = calcReadtime(body);

        posts.push({
            title:      fm.title,
            tldr:       fm.tldr || '',
            date:       fm.date ? (fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date)) : '',
            type:       fm.type || 'articulo',
            tags:       fm.tags,
            readtime:   fm.readtime,
            wordcount:  fm.wordcount,
            author:     fm.author,
            authorSlug: slug,
            url:        `${slug}/${file.replace('.md', '.html')}`,
        });

        console.log(`✅ ${slug}/${file} → ${file.replace('.md', '.html')} (${fm.wordcount} palabras, ${fm.readtime})`);
    });

    // Limpieza: borrar .html sin .md correspondiente
    fs.readdirSync(authorDir).forEach(file => {
        if (!file.endsWith('.html') || file === 'index.html') return;
        const mdPath = path.join(authorDir, file.replace('.html', '.md'));
        if (!fs.existsSync(mdPath)) {
            fs.unlinkSync(path.join(authorDir, file));
            console.log(`🗑️  Eliminado: ${slug}/${file} (su .md no existe)`);
        }
    });
});

// ── ORDENAR Y GENERAR HTMLS DE ARTÍCULOS (necesita todos los posts para relacionados) ──
posts.sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return db - da;
});

posts.forEach(postMeta => {
    const [slug, filename] = postMeta.url.split('/');
    const mdFile = filename.replace('.html', '.md');
    const filePath = path.join(ROOT, slug, mdFile);
    if (!fs.existsSync(filePath)) return;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data: fm, content: body } = matter(raw);

    if (!Array.isArray(fm.tags)) {
        fm.tags = fm.tags ? String(fm.tags).replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean) : [];
    }
    fm.readtime = postMeta.readtime;
    fm.wordcount = postMeta.wordcount;

    const headings = extractToc(body);
    const tocHTML = buildTocHTML(headings);
    const htmlContent = injectHeadingIds(marked.parse(body));
    const relatedHTML = relatedPostsHTML(postMeta, posts);

    const outputPath = path.join(ROOT, slug, filename);
    fs.writeFileSync(outputPath, articleTemplate(fm, htmlContent, slug, tocHTML, relatedHTML));
});

// ── GUARDAR posts.js ──────────────────────────────────────────────────────────
fs.writeFileSync(
    path.join(ROOT, 'posts.js'),
    `const POSTS = ${JSON.stringify(posts, null, 2)};\n`
);

// ── GENERAR /archivo ──────────────────────────────────────────────────────────
fs.writeFileSync(path.join(ROOT, 'archivo.html'), archivoPageTemplate());

console.log(`\n📦 posts.js actualizado con ${posts.length} entrada(s).`);
console.log(`📅 archivo.html generado.`);

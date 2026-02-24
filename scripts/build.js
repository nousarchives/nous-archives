const fs = require('fs');
const path = require('path');
const marked = require('marked');
const matter = require('gray-matter');

marked.setOptions({ headerIds: false, mangle: false });

const AUTHORS = {
    angel: {
        name: 'Ángel Allepuz',
        initial: 'Á',
        bio: 'A collection of my thoughts and experiments.',
        bodyClass: 'angel-page',
        socialLinks: [
            { label: 'LinkedIn ↗', url: 'https://www.linkedin.com/in/angelallepuz/' },
            { label: 'GitHub ↗',   url: 'https://github.com/allepuzz' },
        ],
        watermarkImages: ['dm1.jpg','dm2.jpg','dm3.jpg','dm4.jpg','dm5.jpg','dm6.png'],
        openTopics: {
            'AI / ML': [
                '¿Pueden los LLMs razonar de verdad o solo reconocen patrones sofisticados?',
                'Interpretabilidad mecánica: entender qué ocurre dentro de los transformers',
                'Agentes autónomos y los límites de la planificación emergente',
                'Alineación: el problema de especificar lo que realmente queremos',
            ],
            'Consciencia': [
                'El problema difícil de la consciencia y por qué la neurociencia no lo resuelve sola',
                '¿Puede una máquina ser consciente? El test de Turing revisitado',
                'Qualia, experiencia subjetiva y el abismo explicativo',
                'Panpsiquismo, IIT y otras teorías no convencionales',
            ],
        },
    },
    javi: {
        name: 'Javi',
        initial: 'J',
        bio: 'El espacio está listo. La primera entrada, en camino.',
    },
    antonio: {
        name: 'Antonio',
        initial: 'A',
        bio: 'Periodista. Escribe sobre cultura, medios y el lado terapéutico del arte. Co-fundador de NousArchives.',
    },
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
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@300;400;500&family=Open+Sans:wght@400;700&display=swap" rel="stylesheet">
</head>`;
}

// ── NAV ───────────────────────────────────────────────────────────────────────
function authorNav(depth = 1) {
    const rel = '../'.repeat(depth);
    return `    <nav class="topnav">
        <span class="nav-left">EST. ENE 24</span>
        <a href="${rel}" class="nav-center" aria-label="nous Archives">
            <span class="nav-wordmark" id="nav-wordmark">
                <span class="ht-n">n</span><span class="ht-ous">ous</span><span class="ht-line" aria-hidden="true"></span><span class="ht-A">A</span><span class="ht-rchives">rchives</span>
            </span>
        </a>
        <div class="nav-links">
            <button class="dark-toggle" id="dark-toggle" aria-label="Modo oscuro">◐</button>
            <a href="${rel}archivo.html">Archivo</a>
            <a href="https://youtube.com/@NousArchives" target="_blank">YouTube ↗</a>
            <a href="https://github.com/nousarchives/blog" target="_blank">GitHub ↗</a>
        </div>
    </nav>`;
}

// ── FOOTER ────────────────────────────────────────────────────────────────────
function authorFooter(depth = 1) {
    const rel = '../'.repeat(depth);
    return `    <footer class="footer">
        <div class="footer-bottom">
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
            // Scrollbar nA — thumb se mueve en X dentro del viewBox real (115 → 1872)
            const naThumb = document.getElementById('na-thumb-rect');
            if (naThumb) {
                const TRACK_START = 115;
                const TRACK_END = 1872;
                const TRACK_LEN = TRACK_END - TRACK_START;
                function updateNaThumb() {
                    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                    if (maxScroll <= 0) return;
                    const ratio = window.scrollY / maxScroll;
                    const thumbW = Math.max(80, TRACK_LEN * (window.innerHeight / document.documentElement.scrollHeight));
                    const pos = TRACK_START + ratio * (TRACK_LEN - thumbW);
                    naThumb.setAttribute('x', pos.toFixed(1));
                    naThumb.setAttribute('width', thumbW.toFixed(1));
                }
                window.addEventListener('scroll', updateNaThumb, { passive: true });
                window.addEventListener('resize', updateNaThumb);
                updateNaThumb();
            }
            // Animación navbar: nousArchives ↔ n_A
            const navWordmark = document.getElementById('nav-wordmark');
            if (navWordmark) {
                const THRESHOLD = 80;
                let isCollapsed = false;
                function updateWordmark() {
                    const shouldCollapse = window.scrollY > THRESHOLD;
                    if (shouldCollapse !== isCollapsed) {
                        isCollapsed = shouldCollapse;
                        navWordmark.classList.toggle('collapsed', isCollapsed);
                    }
                }
                window.addEventListener('scroll', updateWordmark, { passive: true });
                updateWordmark();
            }
        });
    </script>`;

const naScrollbar = `
    <div class="na-scrollbar" aria-hidden="true">
        <svg id="na-svg"
             viewBox="115 470 1757 188"
             preserveAspectRatio="xMidYMid meet"
             xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(0,1080) scale(0.1,-0.1)" fill="currentColor" opacity="0.5">
                <path d="M18272 5803 c-11 -27 -295 -844 -304 -872 -4 -12 -97 -14 -639 -13 -349 1 -4061 9 -8249 18 -4188 8 -7638 17 -7667 20 l-52 5 -3 247 c-3 230 -4 250 -25 287 -44 84 -104 115 -216 115 -87 0 -131 -16 -186 -66 l-39 -35 -14 43 -15 43 -71 3 -72 3 2 -347 3 -346 90 -2 90 -1 5 225 c6 261 12 285 84 320 50 24 66 25 111 6 57 -24 60 -37 65 -306 l5 -245 945 -2 c520 -1 3798 -9 7285 -18 7118 -17 8644 -19 8652 -11 3 3 24 61 48 128 l41 123 210 0 209 0 41 -125 41 -125 61 -3 60 -3 -45 128 c-25 70 -67 191 -94 268 -27 77 -82 235 -122 350 l-74 210 -75 3 c-74 3 -75 2 -86 -25z m173 -325 c43 -128 80 -239 83 -245 3 -10 -36 -13 -173 -13 -137 0 -176 3 -173 13 3 6 40 117 83 245 43 127 83 232 90 232 6 0 47 -105 90 -232z"/>
            </g>
            <rect id="na-thumb-rect" x="115" y="648" width="300" height="8" rx="4" fill="currentColor" opacity="0.7"/>
        </svg>
    </div>`;

const backToTopBtn = `    <button class="back-to-top" id="back-to-top" aria-label="Volver arriba">↑</button>`;

// ── TEMPLATE ARTÍCULO ────────────────────────────────────────────────────────
function articleTemplate(fm, htmlContent, authorSlug, tocHTML, relatedHTML) {
    const author = AUTHORS[authorSlug];
    const tagsHTML = (fm.tags || []).map(t => `<span class="pub-tag">${t}</span>`).join('');
    const typeLabel = fm.type ? fm.type.charAt(0).toUpperCase() + fm.type.slice(1) : '';

    const angelWatermark = authorSlug === 'angel' ? `
    <div class="angel-watermark"><img id="angel-watermark-img" src="" alt=""></div>` : '';
    const angelWatermarkScript = authorSlug === 'angel' ? `
            const watermarkImg = document.getElementById('angel-watermark-img');
            if (watermarkImg) {
                const imgs = ['dm1.jpg','dm2.jpg','dm3.jpg','dm4.jpg','dm5.jpg','dm6.png'];
                watermarkImg.src = '../angel/' + imgs[Math.floor(Math.random() * imgs.length)];
            }` : '';

    return `${htmlHead(fm.title, 1)}
<body class="article-page${authorSlug === 'angel' ? ' angel-page' : ''}">
    <div class="progress-bar" id="progress-bar"></div>
${angelWatermark}
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
        document.addEventListener('DOMContentLoaded', function() {${angelWatermarkScript}
        });
    </script>
${sharedScript}
</body>
</html>`;
}

// ── TEMPLATE PÁGINA DE AUTOR ─────────────────────────────────────────────────
function authorPageTemplate(slug) {
    const author = AUTHORS[slug];

    // Watermark (solo si el autor tiene imágenes configuradas)
    const watermarkDiv = author.watermarkImages
        ? `\n    <div class="angel-watermark"><img id="angel-watermark-img" src="" alt=""></div>` : '';

    // Social links en el hero
    const socialLinksHTML = author.socialLinks
        ? author.socialLinks.map(l => `<a href="${l.url}" target="_blank" class="author-social">${l.label}</a>`).join('')
        : '';

    // Open topics (solo si el autor los tiene configurados)
    const openTopicsSection = author.openTopics ? `
    <section class="open-topics-section">
        <div class="section-header">
            <span class="section-label">Current Open Topics</span>
            <div class="section-rule"></div>
        </div>
        <div class="open-topics-grid">
            ${Object.entries(author.openTopics).map(([category, items]) => `
            <div class="open-topic-group">
                <h3 class="open-topic-category">${category}</h3>
                <ul class="open-topic-list">
                    ${items.map(item => `<li>${item}</li>`).join('\n                    ')}
                </ul>
            </div>`).join('')}
        </div>
    </section>` : '';

    // Script watermark (solo si el autor tiene imágenes)
    const watermarkScript = author.watermarkImages ? `
            const watermarkImg = document.getElementById('angel-watermark-img');
            if (watermarkImg) {
                const imgs = ${JSON.stringify(author.watermarkImages)};
                watermarkImg.src = imgs[Math.floor(Math.random() * imgs.length)];
            }` : '';

    return `${htmlHead(author.name, 1)}
<body${author.bodyClass ? ` class="${author.bodyClass}"` : ''}>
${authorNav(1)}
${watermarkDiv}
    <header class="author-hero">
        <div class="author-hero-initial">${author.initial}</div>
        <div class="author-hero-right">
            <h1 class="author-hero-name">${author.name}</h1>
            <p class="author-hero-bio">${author.bio}</p>
            <div class="author-hero-meta"><span id="post-count">0 entradas</span>${socialLinksHTML}</div>
        </div>
    </header>
${openTopicsSection}
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
${watermarkScript}
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
        <a href="./" class="nav-center" aria-label="nous Archives">
            <span class="nav-wordmark" id="nav-wordmark">
                <span class="ht-n">n</span><span class="ht-ous">ous</span><span class="ht-line" aria-hidden="true"></span><span class="ht-A">A</span><span class="ht-rchives">rchives</span>
            </span>
        </a>
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
        <div class="footer-bottom">
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

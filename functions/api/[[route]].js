// functions/api/[[route]].js
// الباك إند الكامل لموقع المانجا

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api', '');
  const method = request.method;

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  if (method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    // ======== PUBLIC API ========

    // GET /api/settings
    if (path === '/settings' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
      const s = {};
      results.forEach(r => s[r.key] = r.value);
      return json(s, cors);
    }

    // GET /api/manga?page=1&search=&genre=&status=&type=&sort=updated
    if (path === '/manga' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const search = url.searchParams.get('search') || '';
      const genre = url.searchParams.get('genre') || '';
      const status = url.searchParams.get('status') || '';
      const type = url.searchParams.get('type') || '';
      const sort = url.searchParams.get('sort') || 'updated';
      const limit = parseInt(url.searchParams.get('limit') || '24');
      const offset = (page - 1) * limit;

      let q = 'SELECT * FROM manga WHERE 1=1';
      const p = [];
      if (search) { q += ' AND title LIKE ?'; p.push(`%${search}%`); }
      if (genre)  { q += ' AND genres LIKE ?'; p.push(`%${genre}%`); }
      if (status) { q += ' AND status = ?'; p.push(status); }
      if (type)   { q += ' AND type = ?'; p.push(type); }

      const orderMap = {
        updated: 'updated_at DESC',
        views: 'views DESC',
        rating: 'rating DESC',
        new: 'created_at DESC',
        az: 'title ASC',
      };
      q += ` ORDER BY ${orderMap[sort] || 'updated_at DESC'} LIMIT ? OFFSET ?`;
      p.push(limit, offset);

      const { results } = await env.DB.prepare(q).bind(...p).all();

      // عدد الفصول لكل مانجا
      const list = await Promise.all(results.map(async m => {
        const r = await env.DB.prepare('SELECT COUNT(*) as c, MAX(chapter_number) as last FROM chapters WHERE manga_id=?').bind(m.id).first();
        return { ...m, chapter_count: r?.c || 0, last_chapter: r?.last || 0 };
      }));

      const countQ = q.replace(/SELECT \*/, 'SELECT COUNT(*) as total').replace(/ORDER BY.*$/, '');
      const total = await env.DB.prepare(countQ.split('LIMIT')[0]).bind(...p.slice(0, -2)).first();

      return json({ manga: list, total: total?.total || 0, page }, cors);
    }

    // GET /api/manga/hot
    if (path === '/manga/hot' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM manga WHERE is_hot=1 OR views > 100 ORDER BY views DESC LIMIT 10').all();
      return json({ manga: results }, cors);
    }

    // GET /api/manga/latest-chapters
    if (path === '/manga/latest-chapters' && method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT m.*, c.chapter_number, c.chapter_name, c.created_at as ch_date
        FROM chapters c JOIN manga m ON m.id = c.manga_id
        ORDER BY c.created_at DESC LIMIT 20
      `).all();
      return json({ chapters: results }, cors);
    }

    // GET /api/manga/:slug
    const mangaMatch = path.match(/^\/manga\/([^\/]+)$/);
    if (mangaMatch && method === 'GET') {
      const slug = mangaMatch[1];
      const manga = await env.DB.prepare('SELECT * FROM manga WHERE slug=?').bind(slug).first();
      if (!manga) return json({ error: 'غير موجود' }, cors, 404);

      await env.DB.prepare('UPDATE manga SET views=views+1 WHERE id=?').bind(manga.id).run();

      const { results: chapters } = await env.DB.prepare(
        'SELECT id, chapter_number, chapter_name, views, created_at FROM chapters WHERE manga_id=? ORDER BY chapter_number ASC'
      ).bind(manga.id).all();

      const genres = manga.genres ? manga.genres.split(',').map(g => g.trim()).filter(Boolean) : [];
      return json({ ...manga, chapters, genres }, cors);
    }

    // GET /api/chapters/:id
    const chMatch = path.match(/^\/chapters\/(\d+)$/);
    if (chMatch && method === 'GET') {
      const ch = await env.DB.prepare('SELECT * FROM chapters WHERE id=?').bind(chMatch[1]).first();
      if (!ch) return json({ error: 'غير موجود' }, cors, 404);

      await env.DB.prepare('UPDATE chapters SET views=views+1 WHERE id=?').bind(chMatch[1]).run();

      const manga = await env.DB.prepare('SELECT id,title,slug FROM manga WHERE id=?').bind(ch.manga_id).first();
      const { results: allChapters } = await env.DB.prepare(
        'SELECT id, chapter_number, chapter_name FROM chapters WHERE manga_id=? ORDER BY chapter_number ASC'
      ).bind(ch.manga_id).all();

      return json({ ...ch, images: JSON.parse(ch.images || '[]'), manga, all_chapters: allChapters }, cors);
    }

    // ======== ADMIN API ========
    if (!checkAdmin(request, env)) return json({ error: 'غير مصرح' }, cors, 401);

    // GET /api/admin/stats
    if (path === '/admin/stats' && method === 'GET') {
      const manga = await env.DB.prepare('SELECT COUNT(*) as c FROM manga').first();
      const chapters = await env.DB.prepare('SELECT COUNT(*) as c FROM chapters').first();
      const vaults = await env.DB.prepare('SELECT COUNT(*) as c FROM kvaults').first();
      const views = await env.DB.prepare('SELECT SUM(views) as c FROM manga').first();
      return json({
        manga: manga?.c || 0,
        chapters: chapters?.c || 0,
        vaults: vaults?.c || 0,
        views: views?.c || 0,
      }, cors);
    }

    // GET /api/admin/settings
    if (path === '/admin/settings' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
      const s = {};
      results.forEach(r => s[r.key] = r.value);
      return json(s, cors);
    }

    // POST /api/admin/settings
    if (path === '/admin/settings' && method === 'POST') {
      const data = await request.json();
      for (const [key, value] of Object.entries(data)) {
        await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(key, String(value)).run();
      }
      return json({ success: true }, cors);
    }

    // GET /api/admin/vaults
    if (path === '/admin/vaults' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM kvaults ORDER BY id ASC').all();
      return json({ vaults: results }, cors);
    }

    // POST /api/admin/vaults
    if (path === '/admin/vaults' && method === 'POST') {
      const { name, url: vurl, api_key } = await request.json();
      await env.DB.prepare('INSERT INTO kvaults(name,url,api_key) VALUES(?,?,?)').bind(name, vurl, api_key).run();
      return json({ success: true }, cors);
    }

    // DELETE /api/admin/vaults/:id
    const vaultDelMatch = path.match(/^\/admin\/vaults\/(\d+)$/);
    if (vaultDelMatch && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM kvaults WHERE id=?').bind(vaultDelMatch[1]).run();
      return json({ success: true }, cors);
    }

    // GET /api/admin/manga
    if (path === '/admin/manga' && method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT m.*, (SELECT COUNT(*) FROM chapters c WHERE c.manga_id=m.id) as chapter_count
        FROM manga m ORDER BY m.updated_at DESC
      `).all();
      return json({ manga: results }, cors);
    }

    // POST /api/admin/manga
    if (path === '/admin/manga' && method === 'POST') {
      const d = await request.json();
      const slug = d.slug || slugify(d.title);
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT OR REPLACE INTO manga(title,slug,description,cover,genres,status,author,type,is_hot,is_new,kvault_id,kvault_path,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(d.title, slug, d.description||'', d.cover||'', d.genres||'', d.status||'ongoing', d.author||'', d.type||'manhwa', d.is_hot?1:0, d.is_new?1:0, d.kvault_id||null, d.kvault_path||'', now, now).run();
      return json({ success: true, slug }, cors);
    }

    // PUT /api/admin/manga/:id
    const mangaEditMatch = path.match(/^\/admin\/manga\/(\d+)$/);
    if (mangaEditMatch && method === 'PUT') {
      const d = await request.json();
      const now = new Date().toISOString();
      await env.DB.prepare(`
        UPDATE manga SET title=?,description=?,cover=?,genres=?,status=?,author=?,type=?,is_hot=?,is_new=?,updated_at=? WHERE id=?
      `).bind(d.title, d.description||'', d.cover||'', d.genres||'', d.status||'ongoing', d.author||'', d.type||'manhwa', d.is_hot?1:0, d.is_new?1:0, now, mangaEditMatch[1]).run();
      return json({ success: true }, cors);
    }

    // DELETE /api/admin/manga/:id
    if (mangaEditMatch && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM manga WHERE id=?').bind(mangaEditMatch[1]).run();
      return json({ success: true }, cors);
    }

    // POST /api/admin/chapters
    if (path === '/admin/chapters' && method === 'POST') {
      const d = await request.json();
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO chapters(manga_id,chapter_number,chapter_name,images,created_at)
        VALUES(?,?,?,?,?)
      `).bind(d.manga_id, d.chapter_number, d.chapter_name||`الفصل ${d.chapter_number}`, JSON.stringify(d.images||[]), now).run();
      await env.DB.prepare('UPDATE manga SET updated_at=? WHERE id=?').bind(now, d.manga_id).run();
      return json({ success: true }, cors);
    }

    // DELETE /api/admin/chapters/:id
    const chDelMatch = path.match(/^\/admin\/chapters\/(\d+)$/);
    if (chDelMatch && method === 'DELETE') {
      const ch = await env.DB.prepare('SELECT manga_id FROM chapters WHERE id=?').bind(chDelMatch[1]).first();
      await env.DB.prepare('DELETE FROM chapters WHERE id=?').bind(chDelMatch[1]).run();
      if (ch) await env.DB.prepare('UPDATE manga SET updated_at=? WHERE id=?').bind(new Date().toISOString(), ch.manga_id).run();
      return json({ success: true }, cors);
    }

    // ======== K-VAULT API ========

    // POST /api/admin/kvault/folders — جلب مجلدات من K-Vault
    if (path === '/admin/kvault/folders' && method === 'POST') {
      const { vault_id } = await request.json();
      const vault = await env.DB.prepare('SELECT * FROM kvaults WHERE id=?').bind(vault_id).first();
      if (!vault) return json({ error: 'Vault غير موجود' }, cors, 404);

      try {
        const folders = await kvaultFolders(vault.url, vault.api_key, '');
        return json({ folders }, cors);
      } catch(e) {
        return json({ error: `فشل الاتصال بـ K-Vault: ${e.message}`, folders: [] }, cors, 502);
      }
    }

    // POST /api/admin/kvault/subfolders — فصول داخل مانهوا
    if (path === '/admin/kvault/subfolders' && method === 'POST') {
      const { vault_id, manga_path } = await request.json();
      const vault = await env.DB.prepare('SELECT * FROM kvaults WHERE id=?').bind(vault_id).first();
      if (!vault) return json({ error: 'Vault غير موجود' }, cors, 404);

      const folders = await kvaultFolders(vault.url, vault.api_key, manga_path);
      return json({ folders }, cors);
    }

    // POST /api/admin/kvault/preview — معاينة صور فصل
    if (path === '/admin/kvault/preview' && method === 'POST') {
      const { vault_id, folder_path } = await request.json();
      const vault = await env.DB.prepare('SELECT * FROM kvaults WHERE id=?').bind(vault_id).first();
      if (!vault) return json({ error: 'Vault غير موجود' }, cors, 404);

      const images = await kvaultImages(vault.url, vault.api_key, folder_path);
      return json({ images, count: images.length }, cors);
    }

    // POST /api/admin/kvault/import-chapter — استيراد فصل واحد
    if (path === '/admin/kvault/import-chapter' && method === 'POST') {
      const { vault_id, manga_id, folder_path, chapter_number, chapter_name } = await request.json();
      const vault = await env.DB.prepare('SELECT * FROM kvaults WHERE id=?').bind(vault_id).first();
      if (!vault) return json({ error: 'Vault غير موجود' }, cors, 404);

      const images = await kvaultImages(vault.url, vault.api_key, folder_path);
      if (!images.length) return json({ error: 'لا توجد صور في هذا المجلد' }, cors, 400);

      const now = new Date().toISOString();
      const existing = await env.DB.prepare('SELECT id FROM chapters WHERE manga_id=? AND chapter_number=?').bind(manga_id, chapter_number).first();

      if (existing) {
        await env.DB.prepare('UPDATE chapters SET images=?, chapter_name=? WHERE id=?').bind(JSON.stringify(images), chapter_name||`الفصل ${chapter_number}`, existing.id).run();
      } else {
        await env.DB.prepare('INSERT INTO chapters(manga_id,chapter_number,chapter_name,images,created_at) VALUES(?,?,?,?,?)').bind(manga_id, chapter_number, chapter_name||`الفصل ${chapter_number}`, JSON.stringify(images), now).run();
      }

      await env.DB.prepare('UPDATE manga SET updated_at=? WHERE id=?').bind(now, manga_id).run();
      return json({ success: true, images_count: images.length }, cors);
    }

    // POST /api/admin/kvault/import-manga — استيراد مانجا كاملة مع معلومات
    if (path === '/admin/kvault/import-manga' && method === 'POST') {
      const { vault_id, manga_path, manga_title, existing_manga_id } = await request.json();
      const vault = await env.DB.prepare('SELECT * FROM kvaults WHERE id=?').bind(vault_id).first();
      if (!vault) return json({ error: 'Vault غير موجود' }, cors, 404);

      // جلب معلومات من MangaDex
      const info = await fetchMangaInfo(manga_title || manga_path.split('/').pop());
      const slug = slugify(manga_title || manga_path.split('/').pop());
      const now = new Date().toISOString();

      // إنشاء أو تحديث المانجا
      let manga_id;

      // إذا تم تحديد مانجا موجودة مباشرة — استخدمها مباشرة
      if (existing_manga_id) {
        const directMatch = await env.DB.prepare('SELECT id FROM manga WHERE id=?').bind(existing_manga_id).first();
        if (directMatch) {
          manga_id = directMatch.id;
          if (info.found) {
            await env.DB.prepare('UPDATE manga SET description=?,cover=?,genres=?,author=?,type=?,updated_at=? WHERE id=?')
              .bind(info.description, info.cover, info.genres, info.author, info.type, now, manga_id).run();
          }
        }
      }

      if (!manga_id) {
        const existing = await env.DB.prepare('SELECT id FROM manga WHERE slug=?').bind(slug).first();
        if (existing) {
          manga_id = existing.id;
          if (info.found) {
            await env.DB.prepare('UPDATE manga SET description=?,cover=?,genres=?,author=?,type=?,updated_at=? WHERE id=?')
              .bind(info.description, info.cover, info.genres, info.author, info.type, now, manga_id).run();
          }
        } else {
          await env.DB.prepare(`
            INSERT INTO manga(title,slug,description,cover,genres,status,author,type,is_new,kvault_id,kvault_path,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?)
          `).bind(
            manga_title || manga_path.split('/').pop(),
            slug,
            info.description || '',
            info.cover || '',
            info.genres || '',
            'ongoing',
            info.author || '',
            info.type || 'manhwa',
            vault_id,
            manga_path,
            now, now
          ).run();
          const newManga = await env.DB.prepare('SELECT id FROM manga WHERE slug=?').bind(slug).first();
          manga_id = newManga.id;
        }
      }

      // جلب الفصول
      const chapterFolders = await kvaultFolders(vault.url, vault.api_key, manga_path);
      const results = [];

      for (const folder of chapterFolders) {
        const chNum = extractChapterNumber(folder);
        if (!chNum) continue;

        const images = await kvaultImages(vault.url, vault.api_key, `${manga_path}/${folder}`);
        if (!images.length) continue;

        const existingCh = await env.DB.prepare('SELECT id FROM chapters WHERE manga_id=? AND chapter_number=?').bind(manga_id, chNum).first();
        if (!existingCh) {
          await env.DB.prepare('INSERT INTO chapters(manga_id,chapter_number,chapter_name,images,created_at) VALUES(?,?,?,?,?)')
            .bind(manga_id, chNum, `الفصل ${chNum}`, JSON.stringify(images), now).run();
          results.push({ folder, chapter: chNum, images: images.length });
        }
      }

      await env.DB.prepare('UPDATE manga SET updated_at=? WHERE id=?').bind(now, manga_id).run();
      return json({ success: true, manga_id, slug, chapters_imported: results.length, chapters: results, manga_info: info }, cors);
    }

    // POST /api/admin/kvault/auto-scan — مسح تلقائي لجميع Vaults
    if (path === '/admin/kvault/auto-scan' && method === 'POST') {
      const { results: vaults } = await env.DB.prepare('SELECT * FROM kvaults').all();
      const report = [];

      for (const vault of vaults) {
        const mangaFolders = await kvaultFolders(vault.url, vault.api_key, '');

        for (const mangaFolder of mangaFolders) {
          const slug = slugify(mangaFolder);
          let manga = await env.DB.prepare('SELECT id FROM manga WHERE slug=? OR kvault_path=?').bind(slug, mangaFolder).first();

          if (!manga) {
            const info = await fetchMangaInfo(mangaFolder);
            const now = new Date().toISOString();
            await env.DB.prepare(`
              INSERT INTO manga(title,slug,description,cover,genres,status,author,type,is_new,kvault_id,kvault_path,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?)
            `).bind(mangaFolder, slug, info.description||'', info.cover||'', info.genres||'', 'ongoing', info.author||'', info.type||'manhwa', vault.id, mangaFolder, now, now).run();
            manga = await env.DB.prepare('SELECT id FROM manga WHERE slug=?').bind(slug).first();
          }

          const chapterFolders = await kvaultFolders(vault.url, vault.api_key, mangaFolder);
          let newChapters = 0;

          for (const chFolder of chapterFolders) {
            const chNum = extractChapterNumber(chFolder);
            if (!chNum) continue;
            const exists = await env.DB.prepare('SELECT id FROM chapters WHERE manga_id=? AND chapter_number=?').bind(manga.id, chNum).first();
            if (!exists) {
              const images = await kvaultImages(vault.url, vault.api_key, `${mangaFolder}/${chFolder}`);
              if (images.length) {
                const now = new Date().toISOString();
                await env.DB.prepare('INSERT INTO chapters(manga_id,chapter_number,chapter_name,images,created_at) VALUES(?,?,?,?,?)')
                  .bind(manga.id, chNum, `الفصل ${chNum}`, JSON.stringify(images), now).run();
                newChapters++;
              }
            }
          }

          if (newChapters > 0) {
            await env.DB.prepare('UPDATE manga SET updated_at=? WHERE id=?').bind(new Date().toISOString(), manga.id).run();
            report.push({ vault: vault.name, manga: mangaFolder, new_chapters: newChapters });
          }
        }
      }

      return json({ success: true, report }, cors);
    }

    // POST /api/admin/kvault/fetch-info — جلب معلومات من MangaDex
    if (path === '/admin/kvault/fetch-info' && method === 'POST') {
      const { title } = await request.json();
      const info = await fetchMangaInfo(title);
      return json(info, cors);
    }

    return json({ error: 'المسار غير موجود' }, cors, 404);

  } catch (e) {
    console.error(e);
    return json({ error: e.message }, cors, 500);
  }
}

// ======== Helper Functions ========

function checkAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  const validToken = env?.ADMIN_TOKEN || 'manga2025';
  return token === validToken;
}

function json(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractChapterNumber(folderName) {
  const match = folderName.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

async function kvaultFolders(vaultUrl, apiKey, prefix) {
  const base = vaultUrl.replace(/\/$/, '');
  // Always fetch ALL files without folderPath filter — K-Vault filter is exact match only
  const params = new URLSearchParams({ limit: '1000' });

  const res = await fetch(`${base}/api/v1/files?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  if (!res.ok) {
    throw new Error(`K-Vault API error: ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  const files = body.files || [];

  if (!prefix) {
    // Top-level folders: first segment of folderPath
    const folderSet = new Set();
    for (const f of files) {
      const fp = (f.folderPath || '').trim();
      if (fp) {
        const topLevel = fp.split('/')[0];
        if (topLevel) folderSet.add(topLevel);
      }
    }
    return [...folderSet].sort();
  } else {
    // Sub-folders inside prefix: find files whose folderPath starts with "prefix/"
    const folderSet = new Set();
    const prefixSlash = prefix + '/';
    for (const f of files) {
      const fp = (f.folderPath || '').trim();
      if (fp.startsWith(prefixSlash)) {
        const rest = fp.slice(prefixSlash.length);
        const nextSegment = rest.split('/')[0];
        if (nextSegment) folderSet.add(nextSegment);
      }
    }
    return [...folderSet].sort();
  }
}

async function kvaultImages(vaultUrl, apiKey, folderPath) {
  try {
    const base = vaultUrl.replace(/\/$/, '');
    const params = new URLSearchParams({
      folderPath,
      limit: '500',
      sort: 'nameasc'
    });

    const res = await fetch(`${base}/api/v1/files?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const body = await res.json();
    const files = body.files || [];

    return files
      .filter(f => f.id && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name || ''))
      .map(f => `${base}/file/${f.id}`);
  } catch (e) {
    return [];
  }
}

async function fetchMangaInfo(title) {
  try {
    const query = encodeURIComponent(title.replace(/-/g, ' '));
    const res = await fetch(`https://api.mangadex.org/manga?title=${query}&limit=1&availableTranslatedLanguage[]=ar&availableTranslatedLanguage[]=en`);
    const data = await res.json();

    if (!data.data || !data.data.length) {
      return { found: false, title, description: '', cover: '', genres: '', author: '', type: 'manhwa' };
    }

    const manga = data.data[0];
    const attrs = manga.attributes;

    // الوصف
    const desc = attrs.description?.ar || attrs.description?.en || '';

    // الغلاف
    const coverId = manga.relationships?.find(r => r.type === 'cover_art')?.id;
    let cover = '';
    if (coverId) {
      const coverRes = await fetch(`https://api.mangadex.org/cover/${coverId}`);
      const coverData = await coverRes.json();
      const fileName = coverData.data?.attributes?.fileName;
      if (fileName) cover = `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`;
    }

    // التصنيفات
    const genres = attrs.tags
      ?.map(t => t.attributes?.name?.ar || t.attributes?.name?.en)
      .filter(Boolean).slice(0, 6).join(', ') || '';

    // المؤلف
    const authorId = manga.relationships?.find(r => r.type === 'author')?.id;
    let author = '';
    if (authorId) {
      const authRes = await fetch(`https://api.mangadex.org/author/${authorId}`);
      const authData = await authRes.json();
      author = authData.data?.attributes?.name || '';
    }

    // النوع
    const typeMap = { 'ja': 'manga', 'ko': 'manhwa', 'zh': 'manhua' };
    const type = typeMap[attrs.originalLanguage] || 'manhwa';

    return { found: true, title: attrs.title?.en || title, description: desc, cover, genres, author, type };
  } catch (e) {
    return { found: false, title, description: '', cover: '', genres: '', author: '', type: 'manhwa' };
  }
}

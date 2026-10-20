// Sinh bộ icon đầy đủ cho src/icon-data-lucide.js và src/icon-data-simple.js.
//   npm i -D lucide-static simple-icons
//   node scripts/build-icons.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const nm = (pkg) => join(process.cwd(), 'node_modules', pkg);

/* ---- Lucide: icons/*.svg + tags.json ---- */
{
  const dir = join(nm('lucide-static'), 'icons');
  if (!existsSync(dir)) throw new Error('Thiếu lucide-static: npm i -D lucide-static');
  const tagsFile = join(nm('lucide-static'), 'tags.json');
  const tags = existsSync(tagsFile) ? JSON.parse(readFileSync(tagsFile, 'utf8')) : {};
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
    const name = f.slice(0, -4);
    if (!/^[a-z0-9-]+$/.test(name)) continue;
    const inner = readFileSync(join(dir, f), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
      .replace(/\s*\n\s*/g, '').trim();
    out[name] = [(tags[name] || []).join(' '), inner];
  }
  writeFileSync('src/icon-data-lucide.js',
    `/* Sinh tự động bởi scripts/build-icons.mjs — Lucide (ISC). Đừng sửa tay. */\nexport const LUCIDE = ${JSON.stringify(out)};\n`);
  console.log('Lucide:', Object.keys(out).length, 'glyph');
}

/* ---- Simple Icons: icons/<slug>.svg (title + path d) ---- */
{
  const dir = join(nm('simple-icons'), 'icons');
  if (!existsSync(dir)) throw new Error('Thiếu simple-icons: npm i -D simple-icons');
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
    const slug = f.slice(0, -4);
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const svg = readFileSync(join(dir, f), 'utf8');
    const title = (/<title>([^<]*)<\/title>/.exec(svg) || [])[1] || slug;
    const d = (/<path[^>]*\sd="([^"]+)"/.exec(svg) || [])[1];
    if (d) out[slug] = [title.replace(/&amp;/g, '&'), d];
  }
  writeFileSync('src/icon-data-simple.js',
    `/* Sinh tự động bởi scripts/build-icons.mjs — Simple Icons (CC0). Đừng sửa tay. */\nexport const SIMPLE = ${JSON.stringify(out)};\n`);
  console.log('Simple Icons:', Object.keys(out).length, 'logo');
}

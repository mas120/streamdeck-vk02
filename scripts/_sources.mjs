/* Nguồn dùng chung cho các script kiểm tra: gộp mã module hiện hành để các
   script cũ (từng đọc src/main.js + src/deck.css nguyên khối) tìm được hàm/CSS. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, exts, skip = /\.test\.js$/) {
  return readdirSync(dir).sort().flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, exts, skip);
    return exts.includes(path.extname(name)) && !skip.test(name) ? [full] : [];
  });
}

const read = (files) => files.map((f) => readFileSync(f, 'utf8')).join('\n');

/* JS: entry + core + widgets + artwork SVG (bỏ *.test.js). */
export const jsFiles = [
  path.join(root, 'src', 'main.js'),
  ...walk(path.join(root, 'src', 'core'), ['.js']),
  ...walk(path.join(root, 'src', 'widgets'), ['.js']),
  path.join(root, 'src', 'forest-tree-svgs.js'),
];
export const jsSrc = read(jsFiles);

/* CSS: toàn bộ src/styles (tokens, khung deck, keycap, widget, overrides). */
export const cssFiles = walk(path.join(root, 'src', 'styles'), ['.css']);
export const cssSrc = read(cssFiles);

export const readSrc = (...parts) => readFileSync(path.join(root, ...parts), 'utf8');

/* Lấy nguyên một hàm (kể cả hàm lồng thụt đầu dòng trong setup widget) theo tên. */
export function extractFn(src, name) {
  const m = new RegExp('^([ \\t]*)(?:export\\s+)?function\\s+' + name + '\\s*\\(', 'm').exec(src);
  if (!m) return null;
  const end = src.indexOf('\n' + m[1] + '}', m.index);
  return end < 0 ? null : src.slice(m.index, end + 2 + m[1].length).replace(/^(\s*)export\s+/, '$1');
}

export const widgetSrc = (file) => readSrc('src', 'widgets', file);

#!/usr/bin/env node

/**
 * step3_prepare.js - Tạo cấu trúc song ngữ (Bilingual Preparation)
 *
 * Nhiệm vụ:
 * 1. Đọc HTML từ 02-clean/
 * 2. Nhân bản từng khối văn bản thành cặp:
 *    - Thẻ tiếng Anh gốc: class="eng hidden"
 *    - Thẻ tiếng Việt chờ dịch: class="vn visible" (ID có hậu tố -vn)
 * 3. Chèn style CSS kiểm soát hiển thị song ngữ
 * 4. Lưu kết quả vào 04-prep/
 *
 * Cách dùng:
 *   node pipeline/step3_prepare.js --book entrepreneurship --chapter 1
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

function parseArgs() {
  const args = process.argv.slice(2);
  const params = { chapter: '1' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--book' && args[i + 1]) params.book = args[++i];
    else if (args[i] === '--chapter' && args[i + 1]) params.chapter = args[++i];
    else if (args[i] === '--input' && args[i + 1]) params.input = args[++i];
    else if (args[i] === '--output' && args[i + 1]) params.output = args[++i];
  }
  return params;
}

function prepareHtml(inPath, outPath) {
  const html = fs.readFileSync(inPath, 'utf8');
  const $ = cheerio.load(html);

  // Đảm bảo có CSS điều khiển hiển thị song ngữ
  if ($('head style#bilingual-style').length === 0) {
    const css = `
<style id="bilingual-style">
  .eng.hidden { display: none !important; }
  .vn.visible { display: block !important; }
  li.vn.visible { display: list-item !important; }
  th.vn.visible, td.vn.visible { display: table-cell !important; }
  tr.vn.visible { display: table-row !important; }
  span.vn.visible, em.vn.visible, strong.vn.visible, a.vn.visible, sup.vn.visible, sub.vn.visible { display: inline !important; }
</style>
`;
    if ($('head').length > 0) {
      $('head').append(css);
    } else {
      $.root().prepend(`<head>${css}</head>`);
    }
  }

  const tagsToDuplicate = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'caption', 'figcaption',
    'th', 'td', 'dt', 'dd'
  ];

  tagsToDuplicate.forEach(tagName => {
    $(tagName).each(function() {
      const el = $(this);

      // Bỏ qua nếu khối này chứa các thẻ con khác cũng thuộc danh sách cần nhân bản
      let containsChildBlock = false;
      for (const childTag of tagsToDuplicate) {
        if (el.find(childTag).length > 0) {
          containsChildBlock = true;
          break;
        }
      }
      if (containsChildBlock) return;

      // Bỏ qua nếu đã được chuẩn bị trước đó
      if (el.hasClass('eng') && el.hasClass('hidden')) return;
      if (el.hasClass('vn') && el.hasClass('visible')) return;

      const text = el.text().trim();
      if (!text) return;

      const clone = el.clone();

      // Đánh dấu thẻ gốc là tiếng Anh ẩn
      el.addClass('eng hidden');

      // Đánh dấu thẻ dịch là tiếng Việt hiển thị
      clone.removeClass('eng hidden');
      clone.addClass('vn visible');

      // Cập nhật ID cho bản dịch để tránh trùng lặp
      const originalId = clone.attr('id');
      if (originalId) {
        clone.attr('id', `${originalId}-vn`);
      }

      el.after(clone);
    });
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, $.html(), 'utf8');
}

function main() {
  const params = parseArgs();
  const book = params.book || 'sample-book';
  const chapter = params.chapter;

  const baseDir = path.resolve(process.cwd(), book, `chapter-${chapter}`);
  const cleanDir = params.input || path.join(baseDir, '02-clean');
  const prepDir = params.output || path.join(baseDir, '04-prep');

  if (!fs.existsSync(cleanDir)) {
    console.error(`❌ Thư mục clean không tồn tại: ${cleanDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(cleanDir).filter(f => f.endsWith('.html'));
  if (files.length === 0) {
    console.warn(`⚠️ Không có file .html nào trong ${cleanDir}`);
    return;
  }

  console.log(`📑 [Bước 3: Prep] Chuẩn bị cấu trúc song ngữ cho ${files.length} file tại ${cleanDir}`);

  files.forEach((f, idx) => {
    console.log(`[${idx + 1}/${files.length}] Chuẩn bị: ${f}`);
    prepareHtml(path.join(cleanDir, f), path.join(prepDir, f));
  });

  console.log(`✅ Chuẩn bị song ngữ hoàn tất! Lưu tại: ${prepDir}`);
}

if (require.main === module) {
  main();
}

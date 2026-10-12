#!/usr/bin/env node

/**
 * step6_archive.js - Đóng gói sản phẩm cuối cùng (Archive & Web Reader Preview)
 *
 * Nhiệm vụ:
 * 1. Đọc từ 05-translated/
 * 2. Xuất bản song ngữ hoàn chỉnh vào: 07-archive/bilingual/
 * 3. Xuất bản tiếng Việt thuần (loại bỏ tiếng Anh ngầm) vào: 07-archive/vn-only/
 * 4. Xây dựng giao diện xem sách tương tác (Book Reader) trong .html/
 *
 * Cách dùng:
 *   node pipeline/step6_archive.js --book entrepreneurship --chapter 1
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { execSync } = require('child_process');

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

function processVnOnly(htmlContent) {
  const $ = cheerio.load(htmlContent);

  // Xóa toàn bộ phần tử tiếng Anh ẩn
  $('.eng.hidden').remove();

  // Loại bỏ các class đánh dấu tạm thời
  $('.vn.visible').each((_, el) => {
    const $el = $(el);
    $el.removeClass('vn visible');
  });

  // Xóa style điều khiển song ngữ
  $('style#bilingual-style').remove();

  return $.html();
}

function main() {
  const params = parseArgs();
  const book = params.book || 'sample-book';
  const chapter = params.chapter;

  const bookDir = path.resolve(process.cwd(), book);
  const chapDir = path.join(bookDir, `chapter-${chapter}`);
  const transDir = params.input || path.join(chapDir, '05-translated');
  const archiveDir = params.output || path.join(chapDir, '07-archive');

  const bilingualDir = path.join(archiveDir, 'bilingual');
  const vnOnlyDir = path.join(archiveDir, 'vn-only');

  if (!fs.existsSync(transDir)) {
    console.error(`❌ Không tìm thấy thư mục translated tại: ${transDir}`);
    process.exit(1);
  }

  fs.mkdirSync(bilingualDir, { recursive: true });
  fs.mkdirSync(vnOnlyDir, { recursive: true });

  const files = fs.readdirSync(transDir).filter(f => f.endsWith('.html'));
  if (files.length === 0) {
    console.warn(`⚠️ Không có file .html nào trong ${transDir}`);
    return;
  }

  console.log(`📦 [Bước 6: Archive] Đóng gói ${files.length} file cho chương ${chapter}...`);

  files.forEach((f, idx) => {
    const srcPath = path.join(transDir, f);
    const content = fs.readFileSync(srcPath, 'utf8');

    // 1. Lưu bản song ngữ
    fs.copyFileSync(srcPath, path.join(bilingualDir, f));

    // 2. Lưu bản tiếng Việt thuần
    const vnHtml = processVnOnly(content);
    fs.writeFileSync(path.join(vnOnlyDir, f), vnHtml, 'utf8');
  });

  console.log(`✅ Bản song ngữ đã lưu tại: ${bilingualDir}`);
  console.log(`✅ Bản tiếng Việt thuần đã lưu tại: ${vnOnlyDir}`);

  // 3. Xây dựng Book Reader Preview nếu có script build-preview.js
  const buildPreviewScript = path.resolve(__dirname, '../agents/agent-archive/scripts/build-preview.js');
  if (fs.existsSync(buildPreviewScript)) {
    console.log(`\n📚 Đang dựng giao diện Book Reader Preview...`);
    try {
      execSync(`node "${buildPreviewScript}" "${bookDir}"`, { stdio: 'inherit' });
    } catch (e) {
      console.warn(`⚠️ Không thể tự động build preview: ${e.message}`);
    }
  }
}

if (require.main === module) {
  main();
}

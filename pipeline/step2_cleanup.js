#!/usr/bin/env node

/**
 * step2_cleanup.js - Làm sạch file HTML raw từ OpenStax
 *
 * Nhiệm vụ:
 * 1. Loại bỏ các thẻ rác, thanh menu, navigation, footer, feedback, scripts
 * 2. Giữ nguyên nội dung cốt lõi của sách (cấu trúc section, figure, table, formula)
 * 3. Tải các hình ảnh nội tuyến về thư mục assets/ và đổi đường dẫn tương đối
 * 4. Lưu kết quả vào 02-clean/
 *
 * Cách dùng:
 *   node pipeline/step2_cleanup.js --book entrepreneurship --chapter 1
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const axios = require('axios');

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

async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) return;
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 15000
    });
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (err) {
    console.warn(`   ⚠️ Không tải được ảnh ${url}: ${err.message}`);
  }
}

async function cleanHtmlFile(inPath, outPath, assetsDir) {
  const rawHtml = fs.readFileSync(inPath, 'utf8');
  const $ = cheerio.load(rawHtml);

  // 1. Loại bỏ scripts, stylesheets, tracking, navs
  $('script, link[rel="stylesheet"], style, noscript, iframe').remove();
  $('nav, header, footer, .cookie-banner, .feedback-widget, .breadcrumb, [data-type="navigation"]').remove();
  $('.skip-to-content, .print-warning, [data-test-id="toc-sidebar"]').remove();

  // 2. Tìm container nội dung chính
  let mainContent = $('main');
  if (mainContent.length === 0) mainContent = $('[data-type="page"]');
  if (mainContent.length === 0) mainContent = $('article');
  if (mainContent.length === 0) mainContent = $('#main-content');
  if (mainContent.length === 0) mainContent = $('body');

  const contentHtml = mainContent.html() || rawHtml;
  const $clean = cheerio.load(`<div class="os-content-container">${contentHtml}</div>`, null, false);

  // 3. Xử lý ảnh: tải về assets và đổi src
  const imgPromises = [];
  $clean('img').each((_, el) => {
    const $img = $clean(el);
    let src = $img.attr('src');
    if (!src) return;

    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const parsedUrl = new URL(src);
      const fileName = path.basename(parsedUrl.pathname) || `img_${Date.now()}.png`;
      const localPath = path.join(assetsDir, fileName);

      imgPromises.push(downloadImage(src, localPath));
      $img.attr('src', `../assets/${fileName}`);
    }
  });

  await Promise.all(imgPromises);

  // 4. Xóa các thuộc tính rác
  $clean('*').each((_, el) => {
    const $el = $clean(el);
    $el.removeAttr('onclick');
    $el.removeAttr('tabindex');
    $el.removeAttr('role');
    $el.removeAttr('aria-live');
  });

  const finalHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Cleaned Section</title>
</head>
<body>
  ${$clean.html()}
</body>
</html>`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, finalHtml, 'utf8');
}

async function main() {
  const params = parseArgs();
  const book = params.book || 'sample-book';
  const chapter = params.chapter;

  const baseDir = path.resolve(process.cwd(), book, `chapter-${chapter}`);
  const rawDir = params.input || path.join(baseDir, '01-raw');
  const cleanDir = params.output || path.join(baseDir, '02-clean');
  const assetsDir = path.join(baseDir, 'assets');

  fs.mkdirSync(cleanDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  if (!fs.existsSync(rawDir)) {
    console.error(`❌ Thư mục raw không tồn tại: ${rawDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.html'));
  if (files.length === 0) {
    console.warn(`⚠️ Không có file .html nào trong ${rawDir}`);
    return;
  }

  console.log(`🧹 [Bước 2: Cleanup] Bắt đầu làm sạch ${files.length} file tại ${rawDir}`);

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`[${i + 1}/${files.length}] Làm sạch: ${f}`);
    await cleanHtmlFile(path.join(rawDir, f), path.join(cleanDir, f), assetsDir);
  }

  console.log(`✅ Làm sạch hoàn tất! Kết quả lưu tại: ${cleanDir}`);
}

if (require.main === module) {
  main();
}

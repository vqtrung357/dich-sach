#!/usr/bin/env node

/**
 * step1_scrape.js - Thu thập nội dung và hình ảnh từ OpenStax
 *
 * Cách dùng:
 *   node pipeline/step1_scrape.js --book entrepreneurship --url https://openstax.org/books/entrepreneurship/pages/1-introduction
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--book' && args[i + 1]) params.book = args[++i];
    else if (args[i] === '--url' && args[i + 1]) params.url = args[++i];
    else if (args[i] === '--output' && args[i + 1]) params.output = args[++i];
    else if (args[i] === '--chapter' && args[i + 1]) params.chapter = args[++i];
  }
  return params;
}

async function main() {
  const params = parseArgs();
  const book = params.book || 'sample-book';
  const startUrl = params.url;

  if (!startUrl) {
    console.error('❌ Thiếu tham số URL. Ví dụ:\n  node pipeline/step1_scrape.js --book entrepreneurship --url https://openstax.org/books/entrepreneurship/pages/1-introduction');
    process.exit(1);
  }

  const outBase = params.output || path.resolve(process.cwd(), book);
  const rawDir = path.join(outBase, params.chapter ? `chapter-${params.chapter}/01-raw` : '01-raw');
  fs.mkdirSync(rawDir, { recursive: true });

  console.log(`🚀 [Bước 1: Scrape] Bắt đầu thu thập sách "${book}" từ: ${startUrl}`);
  console.log(`📁 Thư mục lưu: ${rawDir}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`⏳ Đang tải trang mục lục/nội dung khởi điểm...`);
    await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    const links = await page.evaluate((bookName) => {
      const aTags = Array.from(document.querySelectorAll('a'));
      const chapterLinks = new Set();
      aTags.forEach(a => {
        const href = a.href;
        if (href && href.includes(`/books/${bookName}/pages/`) && !href.includes('#')) {
          chapterLinks.add(href.split('?')[0]);
        }
      });
      return Array.from(chapterLinks);
    }, book);

    const targetUrls = links.length > 0 ? links : [startUrl];
    console.log(`✅ Tìm thấy ${targetUrls.length} trang cần thu thập.`);

    for (let i = 0; i < targetUrls.length; i++) {
      const link = targetUrls[i];
      const slug = link.split('/').filter(Boolean).pop() || `page-${i + 1}`;
      const outFile = path.join(rawDir, `${slug}.html`);

      console.log(`[${i + 1}/${targetUrls.length}] 📥 Đang tải: ${slug}`);
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });
      const html = await page.content();
      fs.writeFileSync(outFile, html, 'utf8');
    }

    console.log(`🎉 Thu thập thành công ${targetUrls.length} file raw tại ${rawDir}`);
  } catch (err) {
    console.error(`❌ Lỗi khi scrape: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main();
}

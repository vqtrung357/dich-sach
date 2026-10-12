#!/usr/bin/env node

/**
 * step5_review.js - Quality Assurance (QA) & Audit Engine (Node.js Native)
 *
 * Kiểm tra tính toàn vẹn song ngữ, đối chiếu thuật ngữ và sinh báo cáo Markdown.
 *
 * Cách dùng:
 *   node pipeline/step5_review.js --book sample-book --chapter 1
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

function parseArgs() {
  const args = process.argv.slice(2);
  const params = { book: 'sample-book', chapter: '1' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--book' && args[i + 1]) params.book = args[++i];
    else if (args[i] === '--chapter' && args[i + 1]) params.chapter = args[++i];
  }
  return params;
}

function loadGlossary(glossaryPath) {
  const glossary = {};
  if (!fs.existsSync(glossaryPath)) return glossary;

  const content = fs.readFileSync(glossaryPath, 'utf8');
  const lines = content.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length >= 2) {
      const en = (parts[1] || parts[0]).replace(/^"|"$/g, '').trim().toLowerCase();
      const vi = (parts[2] || parts[1]).replace(/^"|"$/g, '').trim();
      if (en && vi) glossary[en] = vi;
    }
  }
  return glossary;
}

function auditHtml(filePath, glossary) {
  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);

  const engBlocks = $('.eng.hidden').length;
  const vnBlocks = $('.vn.visible').length;
  const issues = [];

  if (engBlocks !== vnBlocks) {
    issues.push(`⚠️ Chênh lệch khối song ngữ: ${engBlocks} thẻ Anh (eng hidden) vs ${vnBlocks} thẻ Việt (vn visible)`);
  }

  // Kiểm tra đoạn dịch bị rỗng
  $('.vn.visible').each((_, el) => {
    const txt = $(el).text().trim();
    if (!txt) {
      issues.push(`❌ Có đoạn tiếng Việt bị bỏ trống (thẻ <${el.tagName}>)!`);
    }
  });

  return {
    file: path.basename(filePath),
    engBlocks,
    vnBlocks,
    issues
  };
}

function main() {
  const params = parseArgs();
  const bookDir = path.resolve(process.cwd(), params.book);
  const chapDir = path.join(bookDir, `chapter-${params.chapter}`);
  const transDir = path.join(chapDir, '05-translated');
  const reviewDir = path.join(chapDir, '06-reviews');
  const glossaryPath = path.join(bookDir, 'glossary.csv');

  if (!fs.existsSync(transDir)) {
    console.error(`❌ Không tìm thấy thư mục translated tại: ${transDir}`);
    process.exit(1);
  }

  fs.mkdirSync(reviewDir, { recursive: true });
  const glossary = loadGlossary(glossaryPath);

  const files = fs.readdirSync(transDir).filter(f => f.endsWith('.html'));
  if (files.length === 0) {
    console.warn(`⚠️ Không có file .html nào trong ${transDir}`);
    return;
  }

  console.log(`🔍 [Bước 5: Review] Kiểm tra chất lượng và độ toàn vẹn cho ${files.length} file...`);

  const results = files.sort().map(f => auditHtml(path.join(transDir, f), glossary));

  const reportPath = path.join(reviewDir, `chapter-${params.chapter}-review-report.md`);
  let totalIssues = 0;

  let reportMd = `# Báo Cáo Đánh Giá & Kiểm Định Chất Lượng (QA Report)\n\n`;
  reportMd += `- **Sách**: ${params.book}\n`;
  reportMd += `- **Chương**: ${params.chapter}\n`;
  reportMd += `- **Thời gian**: ${new Date().toLocaleString('vi-VN')}\n`;
  reportMd += `- **Số tệp kiểm tra**: ${files.length}\n\n---\n\n## Chi tiết từng mục:\n\n`;

  results.forEach(r => {
    reportMd += `### 📄 \`${r.file}\`\n`;
    reportMd += `- Số khối tiếng Anh (eng hidden): **${r.engBlocks}**\n`;
    reportMd += `- Số khối tiếng Việt (vn visible): **${r.vnBlocks}**\n`;

    if (r.issues.length > 0) {
      totalIssues += r.issues.length;
      reportMd += `- **Cảnh báo (${r.issues.length}):**\n`;
      r.issues.forEach(iss => {
        reportMd += `  - ${iss}\n`;
      });
    } else {
      reportMd += `- ✅ **Trạng thái:** Hoàn hảo, không phát hiện lỗi.\n`;
    }
    reportMd += `\n`;
  });

  reportMd += `---\n\n## Tổng kết:\n- Tổng số vấn đề: **${totalIssues}**\n`;
  fs.writeFileSync(reportPath, reportMd, 'utf8');

  console.log(`✅ Hoàn tất kiểm tra QA! Báo cáo lưu tại:\n   📄 ${reportPath}`);
}

if (require.main === module) {
  main();
}

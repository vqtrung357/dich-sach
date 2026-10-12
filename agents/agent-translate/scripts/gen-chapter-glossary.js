#!/usr/bin/env node
/**
 * gen-chapter-glossary.js
 * Tạo chapter-scoped glossary từ glossary.csv — chỉ chứa terms liên quan đến chapter đó.
 * Dùng trước khi Antigravity dịch để tiết kiệm context window.
 *
 * Cách dùng:
 *   node agents/agent-translate/scripts/gen-chapter-glossary.js <bookName> <chapter-number>
 *
 * Ví dụ:
 *   node agents/agent-translate/scripts/gen-chapter-glossary.js introduction-business 16
 *   node agents/agent-translate/scripts/gen-chapter-glossary.js entrepreneurship 5
 *
 * Output:
 *   ../<bookName>/chapter-<N>/chapter-<N>-glossary.md
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// PARSE ARGS
// ─────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('❌ Cú pháp: node gen-chapter-glossary.js <bookName> <chapter-number>');
  console.error('   Ví dụ: node gen-chapter-glossary.js introduction-business 16');
  process.exit(1);
}

const bookName = args[0];
const chapterNum = parseInt(args[1]);
if (isNaN(chapterNum)) {
  console.error(`❌ chapter-number phải là số, nhận được: "${args[1]}"`);
  process.exit(1);
}

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../');
const bookDir = path.join(WORKSPACE_ROOT, bookName);
const glossaryPath = path.join(bookDir, 'glossary.csv');
const outputDir = path.join(bookDir, `chapter-${chapterNum}`);
const outputPath = path.join(outputDir, `chapter-${chapterNum}-glossary.md`);

if (!fs.existsSync(glossaryPath)) {
  console.error(`❌ Không tìm thấy glossary: ${glossaryPath}`);
  process.exit(1);
}

// ─────────────────────────────────────────────
// PARSE CSV
// ─────────────────────────────────────────────
function parseCSVLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { cells.push(current.trim()); current = ''; }
    else current += char;
  }
  cells.push(current.trim());
  return cells.map(c => c.replace(/^"|"$/g, '').trim());
}

const content = fs.readFileSync(glossaryPath, 'utf8');
// Handle BOM
const rawLines = content.replace(/^\uFEFF/, '').split(/\r?\n/);

// Parse header
const header = rawLines[0].split(',').map(h => h.trim());
const colKey = header.findIndex(h => {
  const l = h.toLowerCase();
  return l === 'key' || l.includes('tiếng anh') || l.includes('english');
});
const colTranslation = header.findIndex(h => {
  const l = h.toLowerCase();
  return l === 'translation' || l.includes('tiếng việt') || l.includes('vietnamese') || l.includes('dịch');
});
const colChapter = header.findIndex(h => {
  const l = h.toLowerCase();
  return l === 'chapter' || l.includes('chương');
});
const colDescEn = header.findIndex(h => {
  const l = h.toLowerCase();
  return l === 'desc_en' || l.includes('giải thích') || l.includes('description');
});
const colDescVi = header.findIndex(h => {
  const l = h.toLowerCase();
  return l === 'desc_vi' || l.includes('nghĩa tiếng việt');
});
const colStatus = header.findIndex(h => h.toLowerCase() === 'status');
const totalCols = header.length;

console.log(`   CSV columns (${totalCols}): ${header.join(' | ')}`);

if (colKey === -1 || colTranslation === -1) {
  console.error(`❌ Không tìm thấy cột English (key) hoặc Vietnamese (translation) trong CSV. Header: ${header.join(', ')}`);
  process.exit(1);
}

/**
 * Parse một dòng CSV thô thành đúng số cột theo header.
 * Strategy: tách thô bằng ',', rồi ghép lại từ phải sang trái
 * để đạt đúng totalCols cột (vì desc_en/desc_vi có thể không được quote).
 */
function parseCSVLineFixed(line, numCols) {
  // Thực hiện phân tách CSV thông thường trước
  const cells = [];
  let current = '', inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { cells.push(current); current = ''; }
    else current += char;
  }
  cells.push(current);
  const cleanCells = cells.map(c => c.replace(/^"|"$/g, '').trim());

  if (cleanCells.length === numCols) {
    return cleanCells;
  }

  // Fallback: logic ghép cột khi bị vỡ do thiếu quote
  const parts = line.split(',');
  if (parts.length <= numCols) {
    while (parts.length < numCols) parts.push('');
    return parts.map(p => p.replace(/^"|"$/g, '').trim());
  }

  const result = [];
  const fixedPrefix = colTranslation + 1; // key, translation
  for (let i = 0; i < fixedPrefix; i++) {
    result.push(parts[i] ? parts[i].replace(/^"|"$/g, '').trim() : '');
  }
  const fixedSuffix = Math.max(0, numCols - fixedPrefix - 1);
  const suffixParts = parts.slice(parts.length - fixedSuffix);
  const middleParts = parts.slice(fixedPrefix, parts.length - fixedSuffix);

  result.push(middleParts.join(',').replace(/^"|"$/g, '').trim()); // gộp tất cả phần giải thích/cột giữa
  for (const s of suffixParts) {
    result.push(s.replace(/^"|"$/g, '').trim());
  }
  
  while (result.length < numCols) result.push('');
  return result;
}

// ─────────────────────────────────────────────
// FILTER TERMS
// ─────────────────────────────────────────────
// Support multiple chapter tag formats used across books:
//   entrepreneurship: "Chương 16", "Chương 1, Chương 2"
//   introduction-business: "16", "chapter-16", "chapter_16"
const chapterTags = [
  `Chương ${chapterNum}`,       // entrepreneurship format
  `chapter-${chapterNum}`,      // intro-business format A
  `chapter_${chapterNum}`,      // possible variant
  `,${chapterNum},`,            // numeric in comma list
  ` ${chapterNum},`,            // numeric at start
  `,${chapterNum}`,             // numeric at end
];
// Also match bare number "16" when it's the whole field value
const bookLevelTags = ['_book-level', 'common', 'book-level'];

function isThisChapter(chapterField) {
  if (colChapter === -1) return false; // Không có cột chapter
  if (!chapterField) return false;
  const cf = chapterField.trim();
  // Exact match bare number
  if (cf === String(chapterNum)) return true;
  // Contains "Chương N" or "chapter-N"
  for (const tag of chapterTags) {
    if (cf.includes(tag)) return true;
  }
  return false;
}

function isBookLevel(chapterField) {
  if (colChapter === -1) return true; // Không có cột chapter -> tất cả là book-level
  if (!chapterField) return false;
  return bookLevelTags.some(tag => chapterField.toLowerCase().includes(tag));
}

const chapterTerms = [];
const bookLevelTerms = [];

for (let i = 1; i < rawLines.length; i++) {
  const line = rawLines[i].trim();
  if (!line) continue;

  const cells = parseCSVLineFixed(line, totalCols);
  const key = cells[colKey] || '';
  const translation = cells[colTranslation] || '';
  const chapter = colChapter >= 0 ? (cells[colChapter] || '') : '';
  const descEn = colDescEn >= 0 ? (cells[colDescEn] || '') : '';
  const descVi = colDescVi >= 0 ? (cells[colDescVi] || '') : '';
  const status = colStatus >= 0 ? (cells[colStatus] || '') : '';

  if (!key || !translation) continue;

  if (isBookLevel(chapter)) {
    bookLevelTerms.push({ key, translation, descEn, descVi, status, chapter });
  } else if (isThisChapter(chapter)) {
    chapterTerms.push({ key, translation, descEn, descVi, status, chapter });
  }
}

console.log(`📚 Tổng glossary: ${rawLines.length - 1} terms`);
console.log(`   → Chapter ${chapterNum} specific: ${chapterTerms.length} terms`);
console.log(`   → Book-level (dùng chung): ${bookLevelTerms.length} terms`);
console.log(`   → Tổng xuất ra: ${chapterTerms.length + bookLevelTerms.length} terms`);

// ─────────────────────────────────────────────
// BUILD MARKDOWN OUTPUT
// ─────────────────────────────────────────────
function termRow(t) {
  const desc = t.descVi || t.descEn || '';
  const descShort = desc.length > 120 ? desc.slice(0, 117) + '...' : desc;
  return `| ${t.key} | **${t.translation}** | ${descShort} |`;
}

const lines_out = [
  `# Glossary: Chương ${chapterNum} — ${bookName}`,
  ``,
  `> Tệp này được tạo tự động bởi \`gen-chapter-glossary.js\`.`,
  `> Chỉ chứa terms liên quan đến Chapter ${chapterNum} + book-level terms dùng chung.`,
  `> Dùng file này thay vì \`glossary.csv\` đầy đủ để tiết kiệm context window.`,
  ``,
  `---`,
  ``,
  `## Thuật ngữ riêng của Chương ${chapterNum} (${chapterTerms.length} terms)`,
  ``,
  `| English | Tiếng Việt | Mô tả |`,
  `|---------|-----------|-------|`,
  ...chapterTerms.map(termRow),
  ``,
  `---`,
  ``,
  `## Book-level Terms (dùng chung toàn bộ sách) (${bookLevelTerms.length} terms)`,
  ``,
  `| English | Tiếng Việt | Mô tả |`,
  `|---------|-----------|-------|`,
  ...bookLevelTerms.map(termRow),
  ``,
  `---`,
  ``,
  `*Tổng: ${chapterTerms.length + bookLevelTerms.length} terms | Cập nhật: ${new Date().toLocaleDateString('vi-VN')}*`,
];

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, lines_out.join('\n'), 'utf8');
console.log(`✅ Đã xuất: ${outputPath}`);
console.log(`   (${chapterTerms.length + bookLevelTerms.length} terms — tiết kiệm ${Math.max(0, (rawLines.length - 1) - chapterTerms.length - bookLevelTerms.length)} terms không liên quan)`);

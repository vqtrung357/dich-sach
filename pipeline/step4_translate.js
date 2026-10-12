#!/usr/bin/env node

/**
 * step4_translate.js - AI Translation Engine (Node.js Native)
 *
 * Chạy 100% trên Node.js (hỗ trợ OpenAI, Gemini, Anthropic Claude).
 * Hỗ trợ chế độ dry-run thử nghiệm không tốn chi phí API.
 *
 * Cách dùng:
 *   node pipeline/step4_translate.js --book sample-book --chapter 1
 *   node pipeline/step4_translate.js --book sample-book --chapter 1 --dry-run
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const axios = require('axios');
require('dotenv').config();

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    book: 'sample-book',
    chapter: '1',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY || ''
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--book' && args[i + 1]) params.book = args[++i];
    else if (args[i] === '--chapter' && args[i + 1]) params.chapter = args[++i];
    else if (args[i] === '--model' && args[i + 1]) params.model = args[++i];
    else if (args[i] === '--api-key' && args[i + 1]) params.apiKey = args[++i];
    else if (args[i] === '--dry-run') params.dryRun = true;
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

const SYSTEM_PROMPT = `Bạn là Chuyên gia Dịch thuật Sách Giáo trình Đại học hàng đầu (OpenStax).
Nhiệm vụ của bạn là dịch các đoạn văn bản từ tiếng Anh sang tiếng Việt với văn phong học thuật mượt mà, thuần Việt, chuẩn xác ngữ nghĩa.

QUY TẮC BẮT BUỘC:
1. VĂN PHONG THUẦN VIỆT & MƯỢT MÀ (Fluency-first):
   - Tái cấu trúc câu bị động hoặc rườm rà của tiếng Anh thành câu tiếng Việt mạch lạc, tự nhiên. Tránh dịch word-for-word khô cứng.
2. BẢO TỒN THUẬT NGỮ (Glossary-first):
   - Tuân thủ danh sách thuật ngữ được cung cấp.
3. KHÔNG TỰ Ý CHÈN CHÚ THÍCH TIẾNG ANH NGOẶC ĐƠN:
   - Dịch thẳng sang tiếng Việt chuẩn, không viết dạng "kinh tế tự do (gig economy)".
4. TÊN RIÊNG & THƯƠNG HIỆU:
   - Giữ nguyên tên riêng người nước ngoài và thương hiệu quốc tế (Apple, Toyota, Nike...).
5. BẢO TỒN CẤU TRÚC THẺ HTML:
   - Giữ nguyên tất cả thẻ con bên trong như <span data-type="term">, <em>, <strong>, <a>, <sup>. Chỉ dịch phần nội dung hiển thị.`;

async function callOpenAI(prompt, systemPrompt, apiKey, model) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      timeout: 120000
    }
  );
  return response.data.choices[0].message.content.trim();
}

function cleanVnText(text) {
  return text
    .replace(/\s*\(\s*gig economy\s*\)/gi, '')
    .replace(/\s*\(\s*sharing economy\s*\)/gi, '')
    .replace(/\s*\(\s*startup\s*\)/gi, '')
    .replace(/\s*\(\s*venture\s*\)/gi, '')
    .replace(/\s*\(\s*mindset\s*\)/gi, '');
}

async function translateFile(inPath, outPath, glossary, apiKey, model, isDryRun) {
  const html = fs.readFileSync(inPath, 'utf8');
  const $ = cheerio.load(html);

  const targets = $('.vn.visible');
  if (targets.length === 0) {
    fs.copyFileSync(inPath, outPath);
    return;
  }

  const glossarySnippet = Object.entries(glossary)
    .slice(0, 40)
    .map(([k, v]) => `- ${k} -> ${v}`)
    .join('\n');

  for (let i = 0; i < targets.length; i++) {
    const el = $(targets[i]);
    const originalText = el.html();
    if (!originalText || !originalText.trim()) continue;

    if (isDryRun || !apiKey) {
      // Mock / Rule-based translation using glossary in dry-run mode
      let translated = originalText;
      for (const [en, vi] of Object.entries(glossary)) {
        const regex = new RegExp(`\\b${en}\\b`, 'gi');
        translated = translated.replace(regex, vi);
      }
      el.html(translated);
    } else {
      const prompt = `Dịch đoạn HTML sau sang tiếng Việt chuẩn OpenStax. Bảo tồn toàn bộ thẻ con HTML bên trong nếu có:\n\nThuật ngữ:\n${glossarySnippet}\n\nĐoạn cần dịch:\n${originalText}\n\nChỉ trả về nội dung sau dịch:`;
      try {
        const res = await callOpenAI(prompt, SYSTEM_PROMPT, apiKey, model);
        el.html(cleanVnText(res));
      } catch (err) {
        console.warn(`   ⚠️ Lỗi dịch đoạn (${err.message}). Giữ nguyên nội dung.`);
      }
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, $.html(), 'utf8');
}

async function main() {
  const params = parseArgs();
  const bookDir = path.resolve(process.cwd(), params.book);
  const chapDir = path.join(bookDir, `chapter-${params.chapter}`);
  const prepDir = path.join(chapDir, '04-prep');
  const transDir = path.join(chapDir, '05-translated');
  const glossaryPath = path.join(bookDir, 'glossary.csv');

  if (!fs.existsSync(prepDir)) {
    console.error(`❌ Không tìm thấy thư mục prep tại: ${prepDir}`);
    process.exit(1);
  }

  fs.mkdirSync(transDir, { recursive: true });
  const glossary = loadGlossary(glossaryPath);
  console.log(`📖 Nạp ${Object.keys(glossary).length} thuật ngữ từ glossary.csv`);

  const files = fs.readdirSync(prepDir).filter(f => f.endsWith('.html'));
  if (files.length === 0) {
    console.warn(`⚠️ Không có file .html nào trong ${prepDir}`);
    return;
  }

  const mode = params.dryRun || !params.apiKey ? 'DRY-RUN (Thử nghiệm offline)' : params.model;
  console.log(`🤖 [Bước 4: Translate - Node.js] Dịch ${files.length} file của chương ${params.chapter} (Chế độ: ${mode})`);

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`[${i + 1}/${files.length}] Dịch: ${f}`);
    await translateFile(
      path.join(prepDir, f),
      path.join(transDir, f),
      glossary,
      params.apiKey,
      params.model,
      params.dryRun
    );
  }

  console.log(`✅ Dịch hoàn tất! Kết quả lưu tại: ${transDir}`);
}

if (require.main === module) {
  main();
}

#!/usr/bin/env node

/**
 * PDF Book Exporter for OpenStax Translations
 * Uses Chrome Headless to generate publication-grade PDF book chapters.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BOOK_CONFIGS = {
  "organizational-behavior": {
    nameVi: "Hành vi Tổ chức",
    nameEn: "Organizational Behavior",
    accentColor: "#1e3a8a",
    badgeColor: "#0284c7"
  },
  "psychology-2e": {
    nameVi: "Tâm lý học",
    nameEn: "Psychology 2e",
    accentColor: "#0f766e",
    badgeColor: "#0d9488"
  },
  "entrepreneurship": {
    nameVi: "Khởi nghiệp",
    nameEn: "Entrepreneurship",
    accentColor: "#b45309",
    badgeColor: "#d97706"
  },
  "business-ethics": {
    nameVi: "Đạo đức Kinh doanh",
    nameEn: "Business Ethics",
    accentColor: "#4338ca",
    badgeColor: "#6366f1"
  },
  "introduction-business": {
    nameVi: "Nhập môn Kinh doanh",
    nameEn: "Introduction to Business",
    accentColor: "#1d4ed8",
    badgeColor: "#2563eb"
  },
  "introduction-computer-science": {
    nameVi: "Nhập môn Khoa học Máy tính",
    nameEn: "Computer Science",
    accentColor: "#047857",
    badgeColor: "#059669"
  },
  "introductory-statistics-2e": {
    nameVi: "Thống kê Nhập môn",
    nameEn: "Introductory Statistics 2e",
    accentColor: "#7c3aed",
    badgeColor: "#8b5cf6"
  }
};

const BOOK_CHAPTER_TITLES = {
  "organizational-behavior": {
    0: "Lời nói đầu (Preface)",
    1: "Quản trị và hành vi tổ chức",
    2: "Khác biệt cá nhân và văn hóa",
    3: "Nhận thức cá nhân và đánh giá",
    4: "Học tập và thay đổi hành vi",
    5: "Đa dạng nơi làm việc",
    6: "Ra quyết định quản trị",
    7: "Động lực làm việc",
    8: "Đánh giá hiệu suất và khen thưởng",
    9: "Nhóm và hành vi liên nhóm",
    10: "Làm việc nhóm và phát triển đội ngũ",
    11: "Truyền thông quản trị",
    12: "Lãnh đạo trong tổ chức",
    13: "Quyền lực và chính trị tổ chức",
    14: "Xung đột và đàm phán",
    15: "Môi trường ngoài và văn hóa doanh nghiệp",
    16: "Cơ cấu tổ chức và quản lý thay đổi",
    17: "Quản trị nguồn nhân lực",
    18: "Căng thẳng và thích nghi công việc",
    19: "Thang điểm tự đánh giá",
    20: "Tài liệu tham khảo",
    21: "Mục lục tra cứu (Index)"
  },
  "psychology-2e": {
    0: "Lời nói đầu (Preface)",
    1: "Nhập môn Tâm lý học",
    2: "Nghiên cứu Tâm lý học",
    3: "Sinh học Tâm lý",
    4: "Các Trạng thái Ý thức",
    5: "Cảm giác và Tri giác",
    6: "Học tập",
    7: "Tư duy và Trí tuệ",
    8: "Trí nhớ",
    9: "Phát triển Suốt đời",
    10: "Cảm xúc và Động cơ",
    11: "Nhân cách",
    12: "Tâm lý học Xã hội",
    13: "Tâm lý học Công nghiệp & Tổ chức",
    14: "Căng thẳng, Lối sống và Sức khỏe",
    15: "Các Rối loạn Tâm lý",
    16: "Trị liệu và Điều trị"
  },
  "entrepreneurship": {
    0: "Lời nói đầu (Preface)",
    1: "Tinh thần Khởi nghiệp Ngày nay",
    2: "Hành trình Khởi nghiệp",
    3: "Đạo đức & Trách nhiệm Xã hội",
    4: "Công cụ Sáng tạo & Đổi mới",
    5: "Nhận diện Cơ hội Khởi nghiệp",
    6: "Tìm kiếm Giải pháp & Tư duy Thiết kế",
    7: "Tầm nhìn, Sứ mệnh & Pitching",
    8: "Marketing & Thương hiệu Khởi nghiệp",
    9: "Tài chính & Kế toán Khởi nghiệp",
    10: "Khởi nghiệp Tinh gọn & Phát triển",
    11: "Mô hình Kinh doanh & Kế hoạch",
    12: "Xây dựng Đội ngũ & Mạng lưới",
    13: "Pháp lý, Thuế & Quản trị Rủi ro",
    14: "Quản lý Nguồn lực Doanh nghiệp",
    15: "Ra mắt Dự án & Định hướng",
    18: "Tài nguyên Tham khảo",
    21: "Mục lục Tra cứu (Index)"
  },
  "introduction-business": {
    0: "Lời nói đầu (Preface)",
    1: "Hiểu về Hệ thống Kinh doanh",
    2: "Đạo đức Kinh doanh & Trách nhiệm Xã hội",
    3: "Kinh doanh Toàn cầu",
    4: "Hình thức Sở hữu Doanh nghiệp",
    5: "Khởi sự Doanh nghiệp & Doanh nghiệp Nhỏ",
    6: "Quản trị Doanh nghiệp Hiện đại",
    7: "Cơ cấu Tổ chức Doanh nghiệp",
    8: "Quản lý Vận hành & Sản xuất",
    9: "Động viên Nhân viên",
    10: "Quản trị Nguồn nhân lực",
    11: "Quan hệ Lao động",
    12: "Chiến lược Marketing & Sản phẩm",
    13: "Phân phối & Định giá",
    14: "Xúc tiến & Quảng bá Bán hàng",
    15: "Công nghệ Thông tin trong Kinh doanh",
    16: "Kế toán & Báo cáo Tài chính",
    17: "Hệ thống Tiền tệ & Ngân hàng",
    18: "Quản trị Tài chính Doanh nghiệp"
  },
  "introductory-statistics-2e": {
    0: "Lời nói đầu (Preface)",
    1: "Lấy mẫu & Dữ liệu",
    2: "Thống kê Mô tả",
    3: "Chủ đề Xác suất",
    4: "Biến Ngẫu nhiên Rời rạc",
    5: "Biến Ngẫu nhiên Liên tục",
    6: "Phân phối Chuẩn",
    7: "Định lý Giới hạn Trung tâm",
    8: "Khoảng Tin cậy",
    9: "Kiểm định Giả thuyết Một Mẫu",
    10: "Kiểm định Giả thuyết Hai Mẫu",
    11: "Phân phối Chi-Square",
    12: "Hồi quy Tuyến tính & Tương quan",
    13: "Phân phối F & ANOVA Một chiều"
  }
};

function getChapterDir(bookId, chapterNum) {
  const candidates = [
    path.join(process.cwd(), "liberosis-review/frontend/books", bookId, `chapter-${chapterNum}`),
    path.join(process.cwd(), "web-site", bookId, `chapter-${chapterNum}`),
    path.join(process.cwd(), bookId, `.html/chapter-${chapterNum}`),
    path.join(process.cwd(), bookId, `chapter-${chapterNum}/05-translated`)
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getChapterAssetDirs(bookId, chapterNum) {
  const dirs = [
    path.join(process.cwd(), "liberosis-review/frontend/books", bookId, `chapter-${chapterNum}/assets`),
    path.join(process.cwd(), "liberosis-review/frontend/books", bookId, `assets`),
    path.join(process.cwd(), "web-site", bookId, `chapter-${chapterNum}/assets`),
    path.join(process.cwd(), "web-site", bookId, `assets`),
    path.join(process.cwd(), bookId, `chapter-${chapterNum}/assets`),
    path.join(process.cwd(), bookId, `.html/chapter-${chapterNum}/assets`),
    path.join(process.cwd(), bookId, `assets`)
  ];
  return dirs.filter(d => fs.existsSync(d));
}

function sortChapterFiles(files, chapterNum) {
  // Sort OpenStax sections:
  // 1. introduction
  // 2. numbered sections (X.1, X.2, ...)
  // 3. key terms
  // 4. summary
  // 5. review questions
  // 6. critical thinking / case questions
  return files.slice().sort((a, b) => {
    const getRank = (f) => {
      const name = f.toLowerCase();
      if (name.includes("introduction") || name.includes("0-intro") || name.includes(`${chapterNum}-0`)) return 10;
      
      const numMatch = name.match(new RegExp(`^${chapterNum}[-_](\\d+)`));
      if (numMatch) return 20 + parseInt(numMatch[1], 10);
      
      if (name.includes("key-term") || name.includes("thuat-ngu")) return 80;
      if (name.includes("summary") || name.includes("tom-tat")) return 85;
      if (name.includes("review-question") || name.includes("cau-hoi-on-tap")) return 90;
      if (name.includes("critical-thinking") || name.includes("case") || name.includes("tinh-huong")) return 95;
      if (name.includes("scientific-method") || name.includes("phu-luc")) return 98;
      return 50;
    };
    return getRank(a) - getRank(b);
  });
}

function exportChapterToPdf(bookId, chapterNum) {
  const config = BOOK_CONFIGS[bookId] || {
    nameVi: bookId,
    nameEn: bookId,
    accentColor: "#1e3a8a",
    badgeColor: "#0284c7"
  };

  const chDir = getChapterDir(bookId, chapterNum);
  if (!chDir) {
    console.error(`❌ Không tìm thấy thư mục cho sách "${bookId}" chương ${chapterNum}`);
    return false;
  }

  const assetDirs = getChapterAssetDirs(bookId, chapterNum);
  console.log(`📖 Bắt đầu xuất PDF: ${config.nameVi} — Chương ${chapterNum}`);
  console.log(`📁 Thư mục nguồn: ${chDir}`);

  const allFiles = fs.readdirSync(chDir).filter(f => f.endsWith(".html"));
  const sortedFiles = sortChapterFiles(allFiles, chapterNum);

  console.log(`📑 Danh sách các mục (${sortedFiles.length} tệp):`);
  sortedFiles.forEach((f, idx) => console.log(`   ${idx + 1}. ${f}`));

  let sectionsHtml = "";
  const tocItems = [];

  sortedFiles.forEach((fileName, idx) => {
    const filePath = path.join(chDir, fileName);
    let raw = fs.readFileSync(filePath, "utf8");

    // Extract title if possible
    let docTitle = fileName.replace(".html", "");
    const titleMatch = raw.match(/<h[23][^>]*class=\"[^\"]*\bvn\b[^\"]*\"[^>]*>([\s\S]*?)<\/h[23]>/i);
    if (titleMatch) {
      docTitle = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    tocItems.push({ file: fileName, title: docTitle });

    // Extract body
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyContent = bodyMatch ? bodyMatch[1] : raw;

    // Clean scripts, links, web buttons
    bodyContent = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, "");
    bodyContent = bodyContent.replace(/<link[^>]*>/gi, "");
    bodyContent = bodyContent.replace(/<button[^>]*aria-label=\"[^\"]*\"[^>]*class=\"image-button-wrapper\">([\s\S]*?)<\/button>/gi, "$1");
    bodyContent = bodyContent.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, "");

    // Safety Normalization 1: Translate unilingual Exhibit/Figure/Table labels
    bodyContent = bodyContent.replace(/<span class="os-title-label">(\s*Exhibit\s*)<\/span>/gi, '<span class="os-title-label eng hidden">$1</span><span class="os-title-label vn visible">Hình </span>');
    bodyContent = bodyContent.replace(/<span class="os-title-label">(\s*Figure\s*)<\/span>/gi, '<span class="os-title-label eng hidden">$1</span><span class="os-title-label vn visible">Hình </span>');
    bodyContent = bodyContent.replace(/<span class="os-title-label">(\s*Table\s*)<\/span>/gi, '<span class="os-title-label eng hidden">$1</span><span class="os-title-label vn visible">Bảng </span>');

    // Safety Normalization 2: Replace autogenerated link texts in Vietnamese paragraphs (Exhibit/Figure X.Y -> Hình X.Y, Table X.Y -> Bảng X.Y)
    bodyContent = bodyContent.replace(/(<a[^>]*class="autogenerated-content"[^>]*>)\s*Exhibit\s+([0-9.]+)\s*(<\/a>)/gi, '$1Hình $2$3');
    bodyContent = bodyContent.replace(/(<a[^>]*class="autogenerated-content"[^>]*>)\s*Figure\s+([0-9.]+)\s*(<\/a>)/gi, '$1Hình $2$3');
    bodyContent = bodyContent.replace(/(<a[^>]*class="autogenerated-content"[^>]*>)\s*Table\s+([0-9.]+)\s*(<\/a>)/gi, '$1Bảng $2$3');

    // Inline images as Base64 data URIs
    bodyContent = bodyContent.replace(/<img([^>]+)src=[\"\\\x27]([^\"\\\x27]+)[\"\\\x27]([^>]*)>/gi, (match, before, rawSrc, after) => {
      if (rawSrc.startsWith("data:") || rawSrc.startsWith("http://") || rawSrc.startsWith("https://")) return match;
      const baseName = path.basename(rawSrc);
      for (const ad of assetDirs) {
        const imgPath = path.join(ad, baseName);
        if (fs.existsSync(imgPath)) {
          const ext = path.extname(baseName).replace(".", "").toLowerCase() || "webp";
          const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/webp";
          const b64 = fs.readFileSync(imgPath).toString("base64");
          return `<img${before}src="data:${mime};base64,${b64}"${after}>`;
        }
      }
      return match;
    });

    sectionsHtml += `
      <div class="book-section ${idx > 0 ? "section-break" : ""}" id="section-${idx}">
        ${bodyContent}
      </div>
    `;
  });

  const chCoverTitle = BOOK_CHAPTER_TITLES[bookId] && BOOK_CHAPTER_TITLES[bookId][chapterNum]
    ? BOOK_CHAPTER_TITLES[bookId][chapterNum]
    : (tocItems[0] ? tocItems[0].title : `Chương ${chapterNum}`);

  const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Chương ${chapterNum}: ${config.nameVi}</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&family=Montserrat:wght@400;500;600;700;800&display=swap");

    @page {
      size: A4;
      margin: 22mm 18mm 22mm 18mm;
      @top-left {
        content: "${config.nameVi.toUpperCase()} (${config.nameEn.toUpperCase()})";
        font-family: "Montserrat", sans-serif;
        font-size: 7.5pt;
        color: #64748b;
        letter-spacing: 0.5px;
      }
      @top-right {
        content: "CHƯƠNG ${chapterNum}";
        font-family: "Montserrat", sans-serif;
        font-size: 7.5pt;
        color: #64748b;
      }
      @bottom-left {
        content: "OpenStax • Bản dịch tiếng Việt";
        font-family: "Montserrat", sans-serif;
        font-size: 7.5pt;
        color: #94a3b8;
      }
      @bottom-right {
        content: counter(page);
        font-family: "Montserrat", sans-serif;
        font-size: 8.5pt;
        font-weight: 600;
        color: #334155;
      }
    }

    @page:first {
      @top-left { content: none; }
      @top-right { content: none; }
      @bottom-left { content: none; }
      @bottom-right { content: none; }
    }

    * { box-sizing: border-box; }

    body {
      font-family: "Merriweather", Georgia, "Times New Roman", serif;
      font-size: 10pt;
      line-height: 1.68;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
      text-align: justify;
    }

    /* Bilingual display rules - ensures PDF matches web presentation */
    .eng.hidden { display: none !important; }
    .vn.visible { display: block !important; }
    li.vn.visible { display: list-item !important; }
    th.vn.visible, td.vn.visible { display: table-cell !important; }
    tr.vn.visible { display: table-row !important; }
    span.vn.visible, em.vn.visible, strong.vn.visible, a.vn.visible, sup.vn.visible, sub.vn.visible { display: inline !important; }

    /* Page Breaks */
    .chapter-cover {
      page-break-after: always;
      padding: 40px 20px 20px 20px;
      text-align: center;
    }
    .section-break {
      page-break-before: always;
      padding-top: 10px;
    }

    /* Chapter Cover Styling */
    .cover-badge {
      display: inline-block;
      font-family: "Montserrat", sans-serif;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: ${config.badgeColor};
      background: #e0f2fe;
      padding: 6px 16px;
      border-radius: 20px;
      margin-bottom: 24px;
    }
    .cover-book-title {
      font-family: "Montserrat", sans-serif;
      font-size: 16pt;
      font-weight: 600;
      color: #64748b;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .cover-chapter-num {
      font-family: "Montserrat", sans-serif;
      font-size: 32pt;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.1;
      margin-bottom: 16px;
    }
    .cover-chapter-title {
      font-family: "Montserrat", sans-serif;
      font-size: 20pt;
      font-weight: 700;
      color: ${config.accentColor};
      margin-bottom: 30px;
      line-height: 1.3;
    }
    .cover-divider {
      width: 80px;
      height: 4px;
      background: ${config.badgeColor};
      margin: 0 auto 36px auto;
      border-radius: 2px;
    }
    .cover-toc {
      max-width: 540px;
      margin: 0 auto;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px 28px;
      text-align: left;
    }
    .cover-toc-title {
      font-family: "Montserrat", sans-serif;
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
    }
    .cover-toc-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .cover-toc-list li {
      font-family: "Montserrat", sans-serif;
      font-size: 9.5pt;
      color: #334155;
      padding: 6px 0;
      border-bottom: 1px dashed #f1f5f9;
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }

    /* Headings */
    h1, h2, h3, h4, h5, h6 {
      font-family: "Montserrat", -apple-system, BlinkMacSystemFont, sans-serif;
      color: #0f172a;
      page-break-after: avoid;
    }
    h2[data-type="document-title"] {
      font-size: 16pt;
      font-weight: 700;
      color: ${config.accentColor};
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-top: 10px;
      margin-bottom: 18px;
    }
    h3[data-type="title"], h3.os-title {
      font-size: 13pt;
      font-weight: 700;
      color: #0369a1;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    h4[data-type="title"], h4.os-subtitle {
      font-size: 11pt;
      font-weight: 600;
      color: #1e293b;
      margin-top: 18px;
      margin-bottom: 8px;
    }

    /* Paragraphs */
    p {
      margin-top: 0;
      margin-bottom: 14px;
      text-indent: 1.5em;
    }
    p:first-of-type, .note p, figure + p, table + p {
      text-indent: 0;
    }

    /* Callout Notes */
    div[data-type="note"] {
      page-break-inside: avoid;
      background: #f8fafc;
      border-left: 4px solid ${config.badgeColor};
      border-radius: 6px;
      padding: 14px 18px;
      margin: 20px 0;
      border-top: 1px solid #f1f5f9;
      border-right: 1px solid #f1f5f9;
      border-bottom: 1px solid #f1f5f9;
    }
    div[data-type="note"] header h3 {
      font-size: 10pt;
      font-weight: 700;
      color: ${config.accentColor};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 10px 0;
      padding: 0;
      border: none;
    }
    div[data-type="note"] .os-note-body p {
      font-size: 9.5pt;
      line-height: 1.6;
      margin-bottom: 8px;
    }

    /* Figures and Images */
    .os-figure, figure {
      page-break-inside: avoid;
      margin: 20px auto;
      text-align: center;
    }
    figure img {
      max-width: 90%;
      height: auto;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    figcaption, .os-caption-container {
      font-family: "Montserrat", sans-serif;
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 8px;
      text-align: center;
      line-height: 1.4;
    }
    figcaption .os-title-label, figcaption .os-number {
      font-weight: 700;
      color: #0f172a;
    }

    /* Tables */
    .os-table, table {
      page-break-inside: avoid;
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-family: "Montserrat", sans-serif;
      font-size: 9pt;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }
    td {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    /* Terms */
    span[data-type="term"], span.os-term {
      font-weight: 600;
      color: ${config.badgeColor};
    }

    /* Glossary terms */
    .os-glossary-list-item {
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    dt {
      font-family: "Montserrat", sans-serif;
      font-weight: 700;
      color: ${config.accentColor};
      margin-top: 8px;
    }
    dd {
      margin-left: 0;
      margin-bottom: 8px;
      line-height: 1.6;
    }

    /* Blockquotes */
    blockquote {
      margin: 16px 0 16px 20px;
      padding: 8px 16px;
      border-left: 3px solid #cbd5e1;
      font-style: italic;
      color: #475569;
    }
    blockquote p {
      text-indent: 0;
      margin-bottom: 8px;
    }

    /* Links & Citations */
    a {
      color: inherit;
      text-decoration: none;
    }
    sup.os-citation-number {
      font-size: 0.75em;
      color: ${config.badgeColor};
      font-weight: 600;
    }

    /* Lists */
    ul, ol {
      margin: 10px 0 16px 20px;
      padding-left: 10px;
    }
    ul.no-style, ol.no-style {
      list-style: none;
      padding-left: 0;
    }
    li {
      margin-bottom: 6px;
      line-height: 1.6;
    }
  </style>
</head>
<body>

  <!-- Chapter Cover Page -->
  <div class="chapter-cover">
    <div class="cover-badge">SÁCH GIÁO KHOA CHUẨN OPENSTAX</div>
    <div class="cover-book-title">${config.nameVi} (${config.nameEn})</div>
    <div class="cover-chapter-num">CHƯƠNG ${chapterNum}</div>
    <div class="cover-chapter-title">${chCoverTitle}</div>
    <div class="cover-divider"></div>

    <div class="cover-toc">
      <div class="cover-toc-title">Nội dung chương</div>
      <ul class="cover-toc-list">
        ${tocItems.map(it => `<li><span>${it.title}</span> <span>✓</span></li>`).join("\n        ")}
      </ul>
    </div>
  </div>

  <!-- Sections Content -->
  ${sectionsHtml}

</body>
</html>`;

  const pdfOutDir = path.join(process.cwd(), "pdf", bookId);
  if (!fs.existsSync(pdfOutDir)) fs.mkdirSync(pdfOutDir, { recursive: true });

  const tempHtmlPath = path.join(pdfOutDir, `chapter-${chapterNum}-compiled.html`);
  fs.writeFileSync(tempHtmlPath, fullHtml, "utf8");

  const sanitize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-zA-Z0-9_-]/g, "_");
  const outputPdfName = `Chuong_${chapterNum}_${sanitize(config.nameVi)}.pdf`;
  const outputPdfPath = path.join(pdfOutDir, outputPdfName);

  console.log(`🖨️ Đang render PDF qua Chrome Headless...`);
  const chromeCmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw --print-to-pdf="${outputPdfPath}" "file://${tempHtmlPath}"`;

  try {
    execSync(chromeCmd, { stdio: ["ignore", "pipe", "pipe"] });
    if (fs.existsSync(outputPdfPath)) {
      const stat = fs.statSync(outputPdfPath);
      let pageCount = "N/A";
      try {
        const mdlsOut = execSync(`mdls -name kMDItemNumberOfPages "${outputPdfPath}"`, { encoding: "utf8" });
        const m = mdlsOut.match(/=\s*(\d+)/);
        if (m) pageCount = m[1];
      } catch(e) {}

      console.log(`✅ Xuất PDF thành công!`);
      console.log(`   📄 Tệp: ${outputPdfPath}`);
      console.log(`   📊 Kích thước: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${stat.size.toLocaleString()} bytes)`);
      console.log(`   📑 Số trang: ${pageCount} trang\n`);
      return true;
    }
  } catch(e) {
    console.error("❌ Lỗi render Chrome:", e.message);
  }
  return false;
}

// CLI entry
const args = process.argv.slice(2);
const bookArg = args.find(a => a.startsWith("--book=")) ? args.find(a => a.startsWith("--book=")).split("=")[1] : args[0] || "organizational-behavior";
const chapterArg = args.find(a => a.startsWith("--chapter=")) ? parseInt(args.find(a => a.startsWith("--chapter=")).split("=")[1], 10) : parseInt(args[1], 10) || 1;

exportChapterToPdf(bookArg, chapterArg);

// book-reader.js - Refined Reader UI with Robust Selection-to-Input Sync & Stale Data Cleaning
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? ''
  : 'https://liberosis-review.vqtrung357.workers.dev';

function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('liberosis_session_token') || localStorage.getItem('bot_auth_token');
  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    ...options,
    headers
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.currentUser = { name: 'Editor BỘT' };
    initializeReader();
    return;
  }

  fetchWithAuth(API_BASE + '/api/auth/me')
    .then(response => {
      if (!response.ok) {
        window.location.href = '/login.html';
        throw new Error('Unauthorized');
      }
      return response.json();
    })
    .then(user => {
      window.currentUser = user;
      initializeReader();
    })
    .catch(err => {
      console.warn('Auth check failed:', err);
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.currentUser = { name: 'Editor BỘT' };
        initializeReader();
      }
    });
});

function initializeReader() {
  const body = document.body;
  const mainContent = document.createElement('div');
  mainContent.id = 'br-main-content';

  while (body.firstChild) {
    mainContent.appendChild(body.firstChild);
  }

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const booksIdx = pathParts.indexOf('books');
  let bookId = 'entrepreneurship';
  let pageId = 'chapter-1/1-introduction.html';

  if (booksIdx !== -1 && booksIdx < pathParts.length - 1) {
    bookId = pathParts[booksIdx + 1];
    pageId = pathParts.slice(booksIdx + 2).join('/') || 'chapter-1/1-introduction.html';
  } else if (pathParts.length > 0) {
    bookId = pathParts[0];
    pageId = pathParts.slice(1).join('/') || 'chapter-1/1-introduction.html';
  }

  if (window.location.pathname.includes('psychology')) {
    bookId = 'psychology-2e';
  }

  const DRAFT_KEY = `bot_draft_${bookId}_${pageId}`;
  const COMMENTS_KEY = `bot_comments_${bookId}_${pageId}`;

  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

    function cleanBlockId(blockId) {
    if (!blockId) return "";
    return blockId.replace(/-vn$/, "");
  }

  function getSelectableBlock(targetEl) {
    if (!targetEl) return null;
    let block = targetEl.closest(".vn.visible, .eng.hidden");
    if (block) return block;
    let figcap = targetEl.closest("figcaption, .os-caption-container, .os-caption");
    if (figcap) return figcap;
    let tableEl = targetEl.closest("td, th, .os-table-title, caption, tr, table, .os-table");
    if (tableEl) return tableEl;
    let fig = targetEl.closest("figure, .os-figure");
    if (fig) return fig;
    return targetEl.closest("p, h1, h2, h3, h4, h5, h6, li, dt, dd, section, header, .os-note");
  }

  function getBlockId(blockEl) {
    if (!blockEl) return "block";
    const rawId = blockEl.getAttribute("id");
    if (rawId) return cleanBlockId(rawId);

    if (blockEl.tagName === "LI") {
      const parentList = blockEl.closest("ul, ol");
      if (parentList) {
        const pId = parentList.getAttribute("id") || (blockEl.closest("[id]") ? cleanBlockId(blockEl.closest("[id]").getAttribute("id")) : "list");
        const lis = Array.from(parentList.children).filter(el => el.tagName === "LI" && (el.classList.contains("vn") || !el.classList.contains("eng")));
        const idx = lis.indexOf(blockEl);
        return `${cleanBlockId(pId)}-li${idx >= 0 ? idx : 0}`;
      }
    }

    const parentWithId = blockEl.closest("[id]");
    if (parentWithId) {
      const pId = cleanBlockId(parentWithId.getAttribute("id"));
      if (blockEl.tagName === "FIGCAPTION" || blockEl.classList.contains("os-caption") || blockEl.classList.contains("os-caption-container")) {
        return `${pId}-caption`;
      }
      if (blockEl.classList.contains("os-table-title")) {
        return `${pId}-title`;
      }
      if (blockEl.tagName === "TD" || blockEl.tagName === "TH") {
        const cellIdx = blockEl.cellIndex !== undefined ? blockEl.cellIndex : 0;
        const rowIdx = blockEl.parentElement && blockEl.parentElement.rowIndex !== undefined ? blockEl.parentElement.rowIndex : 0;
        return `${pId}-r${rowIdx}-c${cellIdx}`;
      }
      return pId;
    }
    if (blockEl.classList.contains("os-caption") || blockEl.tagName === "FIGCAPTION") return "fig-caption";
    if (blockEl.classList.contains("os-table-title")) return "table-title";
    return "block-elem";
  }

  function getEnglishCounterpart(blockEl) {
    if (!blockEl) return { engText: "", engEl: null };
    if (blockEl.classList.contains("eng")) {
      return { engText: blockEl.textContent.trim(), engEl: blockEl };
    }
    const rawId = blockEl.getAttribute("id") || "";
    if (rawId && rawId.endsWith("-vn")) {
      const engId = rawId.replace(/-vn$/, "");
      const engEl = document.getElementById(engId);
      if (engEl) return { engText: engEl.textContent.trim(), engEl };
    }
    const figure = blockEl.closest("figure, .os-figure");
    if (figure) {
      const engCaption = figure.querySelector("figcaption.eng, .os-caption-container.eng, .os-caption.eng");
      if (engCaption && engCaption !== blockEl) {
        return { engText: engCaption.textContent.trim(), engEl: engCaption };
      }
    }
    const osTable = blockEl.closest(".os-table");
    if (osTable) {
      const engTitle = osTable.querySelector(".os-table-title.eng");
      if (engTitle && engTitle !== blockEl) {
        return { engText: engTitle.textContent.trim(), engEl: engTitle };
      }
    }
    if (blockEl.tagName === "TD" || blockEl.tagName === "TH") {
      const cellIdx = blockEl.cellIndex;
      const tr = blockEl.parentElement;
      if (tr) {
        const prevTr = tr.previousElementSibling;
        if (prevTr && (prevTr.classList.contains("eng") || prevTr.querySelector(".eng"))) {
          const engCell = prevTr.children[cellIdx];
          if (engCell) return { engText: engCell.textContent.trim(), engEl: engCell };
        }
      }
    }
    let prev = blockEl.previousElementSibling;
    while (prev) {
      if (prev.classList.contains("eng") || prev.classList.contains("hidden")) {
        return { engText: prev.textContent.trim(), engEl: prev };
      }
      prev = prev.previousElementSibling;
    }
    if (blockEl.parentElement) {
      const engInParent = blockEl.parentElement.querySelector(".eng.hidden, .eng");
      if (engInParent && engInParent !== blockEl) {
        return { engText: engInParent.textContent.trim(), engEl: engInParent };
      }
    }
    return { engText: "", engEl: null };
  }

  function getBlockLocationContext(blockEl) {
    if (!blockEl) return "Mục hiện tại";
    let locationParts = [];
    const activeToc = document.querySelector(".br-toc-item.active");
    const tocTitle = activeToc ? activeToc.textContent.trim() : "";
    if (tocTitle) locationParts.push(tocTitle);

    const figure = blockEl.closest("figure, .os-figure");
    if (figure) {
      const figNum = figure.querySelector(".os-number");
      const figTitle = figNum ? `Hình ${figNum.textContent.trim()}` : "Hình ảnh";
      locationParts.push(figTitle);
    }
    const osTable = blockEl.closest(".os-table");
    if (osTable) {
      const tableTitle = osTable.querySelector(".os-table-title.vn, .os-table-title");
      const tableNum = osTable.querySelector(".os-number");
      let titleStr = "Bảng biểu";
      if (tableNum) titleStr = `Bảng ${tableNum.textContent.trim()}`;
      else if (tableTitle) titleStr = tableTitle.textContent.trim().substring(0, 30);
      locationParts.push(titleStr);
    }

    let headingText = "";
    let curr = blockEl.previousElementSibling;
    while (curr) {
      if (/^H[1-6]$/i.test(curr.tagName) || curr.classList.contains("os-title")) {
        headingText = curr.textContent.trim();
        break;
      }
      if (curr.previousElementSibling) {
        curr = curr.previousElementSibling;
      } else if (curr.parentElement && curr.parentElement !== mainContent && curr.parentElement !== document.body) {
        curr = curr.parentElement.previousElementSibling;
      } else {
        break;
      }
    }

    if (headingText && !locationParts.includes(headingText) && headingText !== tocTitle) {
      locationParts.push(headingText);
    }

    const bId = getBlockId(blockEl);
    if (bId) locationParts.push(`(${bId})`);

    return locationParts.join(" > ") || bId || "Mục hiện tại";
  }

  // Create Right Panel with tabs: Inspector | Comments | Preview Báo cáo
  const rightPanel = document.createElement('div');
  rightPanel.id = 'br-right-panel';
  rightPanel.innerHTML = `
    <div id="br-panel-header">
      <div class="br-header-left">
        <button id="br-prev-btn" title="Previous">&larr;</button>
        <button id="br-next-btn" title="Next">&rarr;</button>
      </div>
      <div class="br-header-center">
        <a href="/library.html" class="br-home-link" title="Thư viện sách">📚 Library</a>
        <span class="br-divider">|</span>
        <button id="br-swap-btn">Swap to EN</button>
      </div>
      <div class="br-header-right">
        <span id="br-user-name">${window.currentUser ? window.currentUser.name : 'Editor'}</span>
        <button id="br-close-panel-btn" class="br-mobile-close-btn" title="Đóng panel">✕</button>
      </div>
    </div>
    
    <div class="br-tabs-header">
      <button id="br-tab-inspector" class="br-tab-btn">Inspector</button>
      <button id="br-tab-review" class="br-tab-btn active">Comments <span id="br-review-badge-count" class="badge-count hidden">0</span></button>
      <button id="br-tab-preview" class="br-tab-btn">📊 Xem trước Báo cáo</button>
    </div>
    
    <div id="br-tab-content-inspector" class="br-tab-pane">
      <div id="br-eng-section">
        <div class="section-title">Translation Counterpart</div>
        <div id="br-eng-content">Hover over text to see translation here.</div>
      </div>
      <div id="br-term-section">
        <div class="section-title">Glossary Definition</div>
        <div id="br-term-details">Hover over a highlighted term to see details.</div>
      </div>
    </div>
    
    <div id="br-tab-content-review" class="br-tab-pane active" style="padding: 10px; display: flex; flex-direction: column; overflow-y: auto; min-height: 0; height: 100%; box-sizing: border-box;">
      <div id="br-review-placeholder" class="review-placeholder" style="padding: 16px 12px; text-align: center;">
        <div class="placeholder-icon" style="font-size: 1.6rem; margin-bottom: 4px;">💬</div>
        <p style="font-size: 0.82rem; color: #64748b; margin: 0; line-height: 1.4;">Bôi đen chữ hoặc nhấp chọn đoạn văn để tạo nhận xét biên tập.</p>
      </div>
      
      <div id="br-review-active" class="review-active" style="display: none; flex-shrink: 0; width: 100%;">
        <div class="br-selected-preview" style="background: #f1f5f9; padding: 8px 10px; border-radius: 6px; margin-bottom: 8px;">
          <div class="preview-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
            <h4 style="margin: 0; font-size: 0.78rem; color: #334155; font-weight: 700;">Original English</h4>
            <span class="block-id-tag" id="br-active-block-id" style="font-size: 0.7rem; background: #e2e8f0; color: #475569; padding: 1px 5px; border-radius: 4px;"></span>
          </div>
          <div id="br-active-block-text" class="block-preview-text" style="font-size: 0.8rem; color: #1e293b; font-style: normal; font-weight: 400; max-height: 60px; overflow-y: auto;"></div>
        </div>
        
        <!-- Structured Audit Form -->
        <form id="br-comment-form" class="review-form" style="background: #ffffff; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 10px;">
          <div class="form-group-sm" style="margin-bottom: 6px;">
            <label style="font-size: 0.75rem; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">📌 Đoạn cần sửa:</label>
            <textarea id="br-target-text-input" rows="2" style="width: 100%; max-height: 70px; font-size: 0.78rem; padding: 5px 7px; border-radius: 5px; border: 1px solid #cbd5e1; background: #f8fafc; font-family: inherit; box-sizing: border-box; resize: vertical;" placeholder="Nhấp chọn hoặc bôi đen văn bản..."></textarea>
          </div>

          <div class="form-group-sm" style="margin-bottom: 6px;">
            <label style="font-size: 0.75rem; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">🏷️ Loại lỗi:</label>
            <select id="br-error-type-select" style="width: 100%; font-size: 0.78rem; padding: 5px 7px; border-radius: 5px; border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a; font-weight: 600; font-family: inherit; box-sizing: border-box;">
              <option value="Lỗi dịch">🔵 Lỗi dịch</option>
              <option value="Lỗi nhận diện tên riêng">🟠 Lỗi nhận diện tên riêng</option>
              <option value="Lỗi định dạng">🔴 Lỗi định dạng</option>
              <option value="Lỗi thuật ngữ">🟣 Lỗi thuật ngữ</option>
              <option value="Lỗi nội dung">🟡 Lỗi nội dung / Ngữ pháp</option>
              <option value="Lỗi viết hoa">🟢 Lỗi viết hoa</option>
            </select>
          </div>

          <div class="form-group-sm" style="margin-bottom: 6px;">
            <label style="font-size: 0.75rem; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">💡 Đề nghị sửa thành:</label>
            <textarea id="br-suggestion-input" rows="2" style="width: 100%; max-height: 70px; font-size: 0.78rem; padding: 5px 7px; border-radius: 5px; border: 1px solid #cbd5e1; background: #ffffff; font-family: inherit; box-sizing: border-box; resize: vertical;" placeholder="Nhập bản dịch hoặc cách viết sửa lại (tùy chọn)..."></textarea>
          </div>

          <div class="form-group-sm" style="margin-bottom: 8px;">
            <label style="font-size: 0.75rem; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">📝 Lý do sửa / Cách làm đúng:</label>
            <textarea id="br-reason-input" rows="2" style="width: 100%; max-height: 70px; font-size: 0.78rem; padding: 5px 7px; border-radius: 5px; border: 1px solid #cbd5e1; background: #ffffff; font-family: inherit; box-sizing: border-box; resize: vertical;" placeholder="Giải thích vì sao cần sửa..."></textarea>
          </div>

          <div style="display: flex; justify-content: flex-end;">
            <button type="submit" id="br-submit-btn" style="background: #0071e3; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 0.78rem; cursor: pointer; transition: background 0.2s;">
              + Thêm phản biện
            </button>
          </div>
        </form>
      </div>

      <!-- Mục Quản Lý Tất Cả Comments Đã Tạo -->
      <div class="all-comments-container" style="border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 4px; flex-shrink: 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <button id="br-toggle-comments-list-btn" type="button" title="Thu gọn/Mở rộng danh sách" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 0.7rem; cursor: pointer; color: #475569; font-weight: 700; line-height: 1;">▼</button>
            <span style="font-weight: 700; font-size: 0.8rem; color: #0f172a; display: flex; align-items: center; gap: 4px;">
              📋 PHẢN BIỆN (<span id="br-comments-count-inline">0</span>)
            </span>
            <button id="br-clear-all-comments-btn" title="Xóa toàn bộ phản biện nháp cũ" style="background: none; border: none; font-size: 0.7rem; color: #94a3b8; text-decoration: underline; cursor: pointer; font-weight: 400;">Xóa hết</button>
          </div>
          
          <select id="br-comments-filter-select" style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; font-weight: 600; color: #475569;">
            <option value="all">Tất cả loại lỗi</option>
            <option value="Lỗi dịch">Lỗi dịch</option>
            <option value="Lỗi nhận diện tên riêng">Lỗi nhận diện tên riêng</option>
            <option value="Lỗi định dạng">Lỗi định dạng</option>
            <option value="Lỗi thuật ngữ">Lỗi thuật ngữ</option>
            <option value="Lỗi nội dung">Lỗi nội dung</option>
            <option value="Lỗi viết hoa">Lỗi viết hoa</option>
          </select>
        </div>

        <div id="br-all-comments-list" class="review-list" style="max-height: 220px; overflow-y: auto;"></div>
      </div>
    </div>

    <!-- Live Preview Tab Button Handler -->
    <div id="br-tab-content-preview" class="br-tab-pane" style="padding: 12px; text-align: center;">
      <p style="font-size: 0.85rem; color: #64748b;">Đã mở Bảng Báo Cáo Audit trong Tab mới. Nhấp nút dưới đây nếu chưa thấy tab mới:</p>
      <button id="br-open-report-newtab-btn" style="background: #1d4ed8; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer;">
        🚀 Mở Trang Báo Cáo Audit (Realtime)
      </button>
    </div>
  `;

  // Book title display
  let bookTitleDisplay = '‹ Sách Khởi nghiệp (Entrepreneurship)';
  if (bookId.includes('organizational-behavior') || bookId === 'ob') {
    bookTitleDisplay = '‹ Hành vi Tổ chức (Organizational Behavior)';
  } else if (bookId.includes('psychology')) {
    bookTitleDisplay = '‹ Tâm lý học (Psychology 2e)';
  } else if (bookId.includes('introduction-business')) {
    bookTitleDisplay = '‹ Nhập môn Kinh doanh (Introduction to Business)';
  } else if (bookId.includes('introductory-statistics')) {
    bookTitleDisplay = '‹ Thống kê Giới thiệu (Introductory Statistics 2e)';
  } else if (window.BOOK_TITLE) {
    bookTitleDisplay = `‹ ${window.BOOK_TITLE}`;
  }

  const tocPanel = document.createElement('div');
  tocPanel.id = 'br-toc-panel';
  tocPanel.innerHTML = `
    <div class="br-toc-banner">
      <div class="br-toc-book-title" id="br-toc-book-title">${escapeHtml(bookTitleDisplay)}</div>
      <div class="br-toc-active-chapter-title" id="br-toc-header-title">Mục lục sách</div>
    </div>
    <div class="br-toc-subnav">
      <div class="br-toc-nav-item active"><span class="icon">☰</span> Mục lục</div>
      <div class="br-toc-nav-item" id="br-toc-btn-highlights"><span class="icon">⭐</span> Ghi chú</div>
    </div>
    <div class="br-toc-list" id="br-toc-list"></div>
  `;

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'br-toc-toggle';
  toggleBtn.className = 'br-toc-toggle-btn';
  toggleBtn.innerHTML = '☰ Mục lục';
  body.appendChild(toggleBtn);

  const backBtn = document.createElement('a');
  backBtn.id = 'br-back-to-library';
  backBtn.className = 'br-back-to-library-btn';
  backBtn.href = '/library.html';
  backBtn.title = 'Quay lại thư viện chọn sách';
  backBtn.innerHTML = '‹ Thư viện';
  body.appendChild(backBtn);

  body.appendChild(tocPanel);
  body.appendChild(mainContent);
  body.appendChild(rightPanel);

  const tocState = localStorage.getItem('br-toc-open');
  if (tocState === 'true') {
    body.classList.add('toc-open');
    toggleBtn.innerHTML = '✕ Đóng';
  } else {
    body.classList.remove('toc-open');
    toggleBtn.innerHTML = '☰ Mục lục';
  }

  toggleBtn.addEventListener('click', () => {
    const isOpen = body.classList.toggle('toc-open');
    localStorage.setItem('br-toc-open', isOpen);
    toggleBtn.innerHTML = isOpen ? '✕ Đóng' : '☰ Mục lục';
    if (isOpen) {
      setTimeout(pinActiveChapter, 100);
    }
  });

  const BOOK_CHAPTER_TITLES = {
    'psychology-2e': {
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
    'psychology': {
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
    'entrepreneurship': {
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
    'organizational-behavior': {
      0: "Lời nói đầu (Preface)",
      1: "Quản trị & Hành vi Tổ chức",
      2: "Khác biệt Cá nhân & Văn hóa",
      3: "Nhận thức Cá nhân & Đánh giá",
      4: "Học tập & Thay đổi Hành vi",
      5: "Đa dạng Nơi làm việc",
      6: "Ra Quyết định Quản trị",
      7: "Động lực Làm việc",
      8: "Đánh giá Hiệu suất & Khen thưởng",
      9: "Nhóm & Hành vi Liên nhóm",
      10: "Làm việc Nhóm & Phát triển Đội ngũ",
      11: "Truyền thông Quản trị",
      12: "Lãnh đạo trong Tổ chức",
      13: "Quyền lực & Chính trị Tổ chức",
      14: "Xung đột & Đàm phán",
      15: "Môi trường Ngoài & Văn hóa Doanh nghiệp",
      16: "Cơ cấu Tổ chức & Quản lý Thay đổi",
      17: "Quản trị Nguồn nhân lực",
      18: "Căng thẳng & Thích nghi Công việc",
      19: "Thang điểm Tự đánh giá",
      20: "Tài liệu Tham khảo",
      21: "Mục lục Tra cứu (Index)"
    },
    'introduction-business': {
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
    'introductory-statistics-2e': {
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

  const CHAPTER_TITLES = window.CHAPTER_TITLES || BOOK_CHAPTER_TITLES[bookId] || (bookId.includes('psychology') ? BOOK_CHAPTER_TITLES['psychology-2e'] : null) || BOOK_CHAPTER_TITLES['entrepreneurship'] || {};

  function formatSectionTitle(path) {
    if (window.SECTION_TITLES) {
      const withSlash = path.startsWith('/') ? path : '/' + path;
      const withoutSlash = path.replace(/^\//, '');
      if (window.SECTION_TITLES[withSlash]) return window.SECTION_TITLES[withSlash];
      if (window.SECTION_TITLES[withoutSlash]) return window.SECTION_TITLES[withoutSlash];
      const fname = path.split('/').pop();
      for (const k in window.SECTION_TITLES) {
        if (k.endsWith('/' + fname) || k === fname) {
          return window.SECTION_TITLES[k];
        }
      }
    }

    let clean = path.replace('.html', '').split('/').pop();
    if (clean === 'preface') return 'Lời nói đầu (Preface)';
    if (clean === 'index') return 'Mục lục tra cứu';
    if (clean === 'references') return 'Tài liệu tham khảo (References)';
    
    const specialMatch = clean.match(/^(\d+)-(.+)$/);
    if (specialMatch) {
      const ch = specialMatch[1];
      const slug = specialMatch[2];
      if (slug === 'introduction' || slug === '0-introduction') return `Dàn ý chương (Introduction)`;
      if (slug === 'key-terms') return `Thuật ngữ cốt lõi (Key Terms)`;
      if (slug.includes('summary')) return `Tóm tắt bài học (Summary)`;
      if (slug.includes('review-questions')) return `Câu hỏi ôn tập (Review Questions)`;
      if (slug.includes('discussion-questions')) return `Bài tập thảo luận (Discussion)`;
      if (slug.includes('case-questions') || slug.includes('critical-thinking-case')) return `Bài tập tình huống (Case Questions)`;
      if (slug.includes('suggested-resources') || slug.includes('resources')) return `Tài nguyên gợi ý (Resources)`;
    }

    // Check standard section patterns like 15-1-launching... -> 15.1
    const secMatch = clean.match(/^(\d+)-(\d+)-(.+)$/);
    if (secMatch) {
      const ch = secMatch[1];
      const sec = secMatch[2];
      if (sec === '0') return `Dàn ý chương ${ch} (Introduction)`;
      let slug = secMatch[3].replace(/-/g, ' ');
      slug = slug.charAt(0).toUpperCase() + slug.slice(1);
      return `${ch}.${sec} ${slug}`;
    }

    let raw = clean.replace(/-/g, ' ');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function pinActiveChapter() {
    const activeItem = document.querySelector('.br-toc-item.active');
    if (activeItem) {
      const groupBody = activeItem.closest('.br-toc-chapter-body');
      if (groupBody) {
        groupBody.classList.add('open');
        const header = groupBody.previousElementSibling;
        if (header) {
          header.classList.add('expanded', 'has-active');
        }
      }
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Populate OpenStax Accordion TOC
  function populateTOC() {
    const tocList = document.getElementById('br-toc-list');
    if (!tocList) return;

    let pages = window.BOOK_PAGES || [];
    if (pages.length === 0) return;

    tocList.innerHTML = '';
    const currentPath = window.location.pathname;

    // Group pages by Chapter
    const chaptersMap = {};
    pages.forEach(pagePath => {
      let chNum = 0;
      const m = pagePath.match(/chapter-(\d+)/);
      if (m) {
        chNum = parseInt(m[1], 10);
      } else if (pagePath.includes('preface')) {
        chNum = 0;
      } else if (pagePath.includes('index')) {
        chNum = 21;
      } else if (pagePath.includes('resource')) {
        chNum = 18;
      }

      if (!chaptersMap[chNum]) {
        chaptersMap[chNum] = [];
      }
      chaptersMap[chNum].push(pagePath);
    });

    let activeChapFound = null;
    let activeTitleFound = '';

    // Build Accordion DOM
    Object.keys(chaptersMap).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach(chNumStr => {
      const chNum = parseInt(chNumStr, 10);
      const chPages = chaptersMap[chNum];

      const group = document.createElement('div');
      group.className = 'br-toc-chapter-group';

      const chName = CHAPTER_TITLES[chNum] || (chNum > 0 ? `Chương ${chNum}` : 'Phần mở đầu');
      const headerText = chNum > 0 && !chName.startsWith('Chương') ? `Chương ${chNum}: ${chName}` : chName;

      const header = document.createElement('button');
      header.className = 'br-toc-chapter-header';
      header.setAttribute('data-chapter', chNum);
      header.innerHTML = `
        <span class="br-toc-arrow">▶</span>
        <span class="br-toc-chapter-name">${escapeHtml(headerText)}</span>
      `;

      const body = document.createElement('div');
      body.className = 'br-toc-chapter-body';

      let chapterHasActive = false;

      chPages.forEach(path => {
        const item = document.createElement('a');
        item.className = 'br-toc-item';
        let cleanPage = path.replace('.html', '');

        let sectionTitle = formatSectionTitle(path);
        const isActive = currentPath.includes(cleanPage) || currentPath.endsWith(cleanPage);
        if (isActive) {
          item.classList.add('active');
          chapterHasActive = true;
          activeChapFound = chNum;

          // Check if current document has a Vietnamese title in DOM
          const domTitleEl = document.querySelector('h2.vn.visible, h2[data-type="document-title"].vn, h1.vn.visible, [data-type="document-title"].vn');
          if (domTitleEl) {
            const domText = domTitleEl.textContent.replace(/\s+/g, ' ').trim();
            if (domText && !domText.toLowerCase().includes('english') && domText.length > 2) {
              sectionTitle = domText;
            }
          }
          activeTitleFound = sectionTitle;
        }

        item.setAttribute('data-href', path);
        item.href = '#';
        item.textContent = sectionTitle;
        body.appendChild(item);
      });

      if (chapterHasActive) {
        header.classList.add('expanded', 'has-active');
        body.classList.add('open');
      }

      header.addEventListener('click', (e) => {
        e.preventDefault();
        const isExpanded = header.classList.toggle('expanded');
        body.classList.toggle('open', isExpanded);
      });

      group.appendChild(header);
      group.appendChild(body);
      tocList.appendChild(group);
    });

    if (activeTitleFound) {
      const headerTitleEl = document.getElementById('br-toc-header-title');
      if (headerTitleEl) headerTitleEl.textContent = activeTitleFound;
    }

    // Connect Ghi chú button in subnav to open right panel Notes tab if clicked
    const highlightsBtn = document.getElementById('br-toc-btn-highlights');
    if (highlightsBtn) {
      highlightsBtn.onclick = () => {
        const notesTabBtn = document.querySelector('.br-tab-btn[data-tab="review"]');
        if (notesTabBtn) {
          notesTabBtn.click();
          document.body.classList.add('right-panel-open');
        }
      };
    }

    tocList.addEventListener('click', (e) => {
      const link = e.target.closest('.br-toc-item');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('data-href');
        navigateTo(href);
      }
    });

    // Auto scroll & pin active chapter
    setTimeout(pinActiveChapter, 150);
  }

  populateTOC();

  // Navigation Helper
  let chapterFiles = window.BOOK_PAGES || [];
  let currentIndex = -1;
  if (chapterFiles.length > 0) {
    const currentPath = window.location.pathname;
    currentIndex = chapterFiles.findIndex(page => {
      let cleanPage = page.replace('.html', '');
      return currentPath.includes(cleanPage);
    });
  }

  const prevBtn = document.getElementById('br-prev-btn');
  const nextBtn = document.getElementById('br-next-btn');
  if (currentIndex <= 0) prevBtn.disabled = true;
  if (currentIndex === -1 || currentIndex >= chapterFiles.length - 1) nextBtn.disabled = true;

  function navigateTo(url) {
    document.body.classList.add('br-fade-out');
    setTimeout(() => {
      let targetUrl = url;
      if (targetUrl.startsWith('/')) {
        targetUrl = '..' + targetUrl;
      }
      window.location.href = targetUrl;
    }, 150);
  }

  function navigateToPage(targetPage) {
    if (!targetPage) return;
    let cleanTarget = targetPage.replace(/\.html$/, '');
    const currentPath = window.location.pathname;

    if (currentPath.includes(cleanTarget)) return;

    let foundPage = (window.BOOK_PAGES || []).find(p => p.includes(cleanTarget));
    let url = foundPage || (cleanTarget + '.html');

    const targetFileName = url.split('/').pop();

    if (currentPath.includes('/chapter-') && url.includes('/')) {
      const currentChap = currentPath.split('/chapter-')[1]?.split('/')[0];
      const targetChap = url.split('chapter-')[1]?.split('/')[0];
      if (currentChap && targetChap && currentChap === targetChap) {
        url = targetFileName;
      } else {
        url = '../' + url;
      }
    }

    navigateTo(url);
  }

  prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) navigateTo(chapterFiles[currentIndex - 1]);
  });
  nextBtn.addEventListener('click', () => {
    if (currentIndex > -1 && currentIndex < chapterFiles.length - 1) navigateTo(chapterFiles[currentIndex + 1]);
  });

  // Form persistence handlers
  const targetInput = document.getElementById('br-target-text-input');
  const errorTypeSelect = document.getElementById('br-error-type-select');
  const suggestionInput = document.getElementById('br-suggestion-input');
  const reasonInput = document.getElementById('br-reason-input');

  function saveFormDraft() {
    const draft = {
      targetText: targetInput ? targetInput.value : '',
      errorType: errorTypeSelect ? errorTypeSelect.value : 'Lỗi dịch',
      suggestedText: suggestionInput ? suggestionInput.value : '',
      reason: reasonInput ? reasonInput.value : ''
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  function restoreFormDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (targetInput && draft.targetText) targetInput.value = draft.targetText;
        if (errorTypeSelect && draft.errorType) errorTypeSelect.value = draft.errorType;
        if (suggestionInput && draft.suggestedText) suggestionInput.value = draft.suggestedText;
        if (reasonInput && draft.reason) reasonInput.value = draft.reason;
      }
    } catch (e) {}
  }

  [targetInput, errorTypeSelect, suggestionInput, reasonInput].forEach(input => {
    if (input) {
      input.addEventListener('input', saveFormDraft);
      input.addEventListener('change', saveFormDraft);
    }
  });

  restoreFormDraft();

  // Get local chapter-wide comments
  const currentChapterId = (pageId.includes('/') ? pageId.split('/')[0] : pageId).toLowerCase();

  function getLocalChapterComments() {
    const allComments = [];
    const prefix = `bot_comments_${bookId}_`;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const pagePath = key.substring(prefix.length).toLowerCase();
        const pageChapter = pagePath.includes('/') ? pagePath.split('/')[0] : pagePath;

        if (pageChapter === currentChapterId || pagePath.startsWith(currentChapterId + '/') || pagePath.startsWith(currentChapterId)) {
          try {
            const list = JSON.parse(localStorage.getItem(key));
            if (Array.isArray(list)) {
              list.forEach(c => {
                c._pageKey = key;
                allComments.push(c);
              });
            }
          } catch (e) {}
        }
      }
    }

    const map = new Map();
    allComments.forEach(c => map.set(c.id, c));
    return Array.from(map.values())
      .filter(c => {
        const text = (c.targetText || c.selectedText || c.text || '').trim();
        return text !== 'thích' && text !== 'nice' && text !== 'great' && text !== 'test';
      })
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }

  function getAllLocalComments() {
    const allComments = [];
    const prefix = `bot_comments_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const list = JSON.parse(localStorage.getItem(key));
          if (Array.isArray(list)) {
            list.forEach(c => {
              if (c && c.id) {
                c._pageKey = key;
                allComments.push(c);
              }
            });
          }
        } catch (e) {}
      }
    }
    const map = new Map();
    allComments.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }

  function getLocalComments() {
    return getLocalChapterComments();
  }

  function saveLocalComments(comments) {
    try {
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {}
  }

  // Clear all comments button handler
  const clearAllBtn = document.getElementById('br-clear-all-comments-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (confirm('Bạn có muốn xóa toàn bộ phản biện đã tạo trong chương này không?')) {
        cachedPageComments = [];
        const prefix = `bot_comments_${bookId}_`;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            const pagePath = key.substring(prefix.length).toLowerCase();
            const pageChapter = pagePath.includes('/') ? pagePath.split('/')[0] : pagePath;
            if (pageChapter === currentChapterId || pagePath.startsWith(currentChapterId)) {
              localStorage.removeItem(key);
            }
          }
        }
        window.dispatchEvent(new Event('storage'));
        renderCommentsList();
        updateHeaderBadge();
        mainContent.querySelectorAll('mark.br-text-highlight').forEach(mark => {
          const parent = mark.parentNode;
          if (parent) {
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
          }
        });
      }
    });
  }

  // Glossary
  let glossaryData = [];
  fetch('../glossary.csv')
    .then(r => r.ok ? r.text() : '')
    .then(csv => {
      if (!csv) return;
      const lines = csv.split('\n').filter(l => l.trim() !== '');
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim());
      glossaryData = lines.slice(1).map(l => {
        const vals = l.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((h, i) => obj[h] = vals[i] || '');
        return obj;
      });
    })
    .catch(() => {});

  const termElements = mainContent.querySelectorAll('[data-type="term"]');
  termElements.forEach(el => el.classList.add('br-highlight-term'));

  let isEnMode = false;
  const swapBtn = document.getElementById('br-swap-btn');
  const engContentPanel = document.getElementById('br-eng-content');
  const termDetailsContainer = document.getElementById('br-term-details');

  swapBtn.addEventListener('click', () => {
    isEnMode = !isEnMode;
    if (isEnMode) {
      document.body.classList.add('lang-swap');
      swapBtn.textContent = 'Swap to VN';
    } else {
      document.body.classList.remove('lang-swap');
      swapBtn.textContent = 'Swap to EN';
    }
    engContentPanel.innerHTML = 'Hover over text to see translation counterpart.';
    termDetailsContainer.innerHTML = 'Hover over a term to see glossary details.';
  });

  // Tab switching logic (Inspector | Comments | Preview Báo cáo)
  const tabInspector = document.getElementById('br-tab-inspector');
  const tabReview = document.getElementById('br-tab-review');
  const tabPreview = document.getElementById('br-tab-preview');

  const paneInspector = document.getElementById('br-tab-content-inspector');
  const paneReview = document.getElementById('br-tab-content-review');
  const panePreview = document.getElementById('br-tab-content-preview');

  function openReportNewTab() {
    const pathParts = pageId.split('/');
    const chapterId = pathParts[0] || 'chapter-1';
    window.open(`/audit-report.html?bookId=${bookId}&chapterId=${encodeURIComponent(chapterId)}&pageId=${encodeURIComponent(pageId)}`, '_blank');
  }

  function switchTab(tabId) {
    [tabInspector, tabReview, tabPreview].forEach(t => t.classList.remove('active'));
    [paneInspector, paneReview, panePreview].forEach(p => p.classList.remove('active'));

    if (tabId === 'inspector') {
      tabInspector.classList.add('active');
      paneInspector.classList.add('active');
    } else if (tabId === 'review') {
      tabReview.classList.add('active');
      paneReview.classList.add('active');
    } else if (tabId === 'preview') {
      tabPreview.classList.add('active');
      panePreview.classList.add('active');
      openReportNewTab();
    }
  }

  tabInspector.addEventListener('click', () => switchTab('inspector'));
  tabReview.addEventListener('click', () => switchTab('review'));
  tabPreview.addEventListener('click', () => switchTab('preview'));

  const openReportBtn = document.getElementById('br-open-report-newtab-btn');
  if (openReportBtn) {
    openReportBtn.addEventListener('click', openReportNewTab);
  }

  // Clean up any untagged/orphaned draft marks
  function clearDraftMarks() {
    const marks = mainContent.querySelectorAll('mark.br-text-highlight:not([data-comment-id])');
    marks.forEach(m => {
      const parent = m.parentNode;
      if (parent) {
        while (m.firstChild) {
          if (m.firstChild.classList && m.firstChild.classList.contains('br-mark-remove-btn')) {
            m.removeChild(m.firstChild);
          } else {
            parent.insertBefore(m.firstChild, m);
          }
        }
        parent.removeChild(m);
        parent.normalize();
      }
    });
  }

  // Safe DOM-based TreeWalker Highlighter (avoids string regex replace on parent innerHTML)
  function highlightTextInElement(element, text, commentId) {
    if (!element || !text) return false;
    if (element.querySelector(`mark[data-comment-id="${commentId}"]`)) return true;

    const cleanText = text.replace(/✕/g, '').trim();
    if (!cleanText || cleanText.length < 2) return false;

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (textNode.parentElement && textNode.parentElement.closest('mark.br-text-highlight')) continue;

      const idx = textNode.nodeValue.indexOf(cleanText);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(textNode, idx);
        range.setEnd(textNode, idx + cleanText.length);

        const mark = document.createElement('mark');
        mark.className = 'br-text-highlight';
        mark.setAttribute('data-comment-id', commentId);

        const textSpan = document.createElement('span');
        textSpan.textContent = cleanText;
        mark.appendChild(textSpan);

        const removeBtn = document.createElement('span');
        removeBtn.className = 'br-mark-remove-btn';
        removeBtn.title = 'Hủy bôi vàng & phản biện';
        removeBtn.textContent = '✕';
        mark.appendChild(removeBtn);

        range.deleteContents();
        range.insertNode(mark);
        return true;
      }
    }
    return false;
  }

  // Universal Bulletproof Highlight Engine
  function applyHighlightsForComments(comments) {
    if (!Array.isArray(comments)) return;

    clearDraftMarks();
    const currentClean = window.location.pathname.split('/').pop().replace(/\.html$/, '');

    comments.forEach(c => {
      // Only highlight marks on DOM if comment belongs to the current page
      if (c.pageId) {
        const cClean = c.pageId.split('/').pop().replace(/\.html$/, '');
        if (cClean !== currentClean) return;
      }

      const textToFind = (c.targetText || c.selectedText || c.text || '').replace(/✕/g, '').trim();
      if (!textToFind || textToFind.length < 2 || textToFind === 'thích' || textToFind === 'nice' || textToFind === 'great') return;

      if (mainContent.querySelector(`mark[data-comment-id="${c.id}"]`)) return;

      let targetEl = null;
      if (c.blockId) {
        const liMatch = c.blockId.match(/^(.+)-li(\d+)$/);
        if (liMatch) {
          const listParent = document.getElementById(`${liMatch[1]}-vn`) || document.getElementById(liMatch[1]);
          if (listParent) {
            const lis = Array.from(listParent.children).filter(el => el.tagName === "LI" && (el.classList.contains("vn") || !el.classList.contains("eng")));
            const targetLi = lis[parseInt(liMatch[2], 10)];
            if (targetLi) targetEl = targetLi;
          }
        }
        if (!targetEl) {
          targetEl = document.getElementById(`${c.blockId}-vn`) || document.getElementById(c.blockId);
        }
      }

      // If targetEl is a container like UL/OL, narrow down to the specific LI
      if (targetEl && (targetEl.tagName === "UL" || targetEl.tagName === "OL")) {
        const lis = Array.from(targetEl.children).filter(el => el.tagName === "LI" && (el.classList.contains("vn") || !el.classList.contains("eng")));
        const matchingLis = lis.filter(li => li.textContent.includes(textToFind) && !li.querySelector(`mark[data-comment-id="${c.id}"]`));
        if (matchingLis.length === 1) {
          targetEl = matchingLis[0];
        } else if (matchingLis.length > 1) {
          targetEl = matchingLis[matchingLis.length - 1];
        }
      }

      if (!targetEl) {
        const allBlocks = mainContent.querySelectorAll('.vn.visible, p, h1, h2, h3, h4, li');
        for (const el of allBlocks) {
          if (el.textContent.includes(textToFind) && !el.querySelector(`mark[data-comment-id="${c.id}"]`)) {
            targetEl = el;
            break;
          }
        }
      }

      if (targetEl) {
        highlightTextInElement(targetEl, textToFind, c.id);
      }
    });
  }

  // Active block selection & Selection Sync
  let activeBlockId = null;
  let activeLocationContext = '';
  let activeSelectedBlockEl = null;
  let activeSelectionRange = null;

    function selectBlock(blockEl) {
    if (!blockEl) return;

    const previouslySelected = mainContent.querySelectorAll(".br-block-selected");
    previouslySelected.forEach(el => el.classList.remove("br-block-selected"));

    blockEl.classList.add("br-block-selected");
    activeSelectedBlockEl = blockEl;

    activeBlockId = getBlockId(blockEl);
    activeLocationContext = getBlockLocationContext(blockEl);

    const { engText } = getEnglishCounterpart(blockEl);
    let vnText = blockEl.textContent.trim();

    switchTab("review");
    
    document.getElementById("br-review-placeholder").style.display = "none";
    document.getElementById("br-review-active").style.display = "block";
    const reviewPane = document.getElementById("br-tab-content-review");
    if (reviewPane) reviewPane.scrollTop = 0;
    document.getElementById("br-active-block-id").textContent = activeLocationContext || activeBlockId;
    document.getElementById("br-active-block-text").textContent = engText || "English original counterpart not found.";

    const sel = window.getSelection();
    const selectedText = sel ? sel.toString().trim() : "";

    if (targetInput) {
      if (selectedText.length >= 2) {
        targetInput.value = selectedText;
      } else {
        targetInput.value = vnText.substring(0, 250);
      }
      saveFormDraft();
    }
  }

  mainContent.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.br-mark-remove-btn');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const mark = removeBtn.closest('mark.br-text-highlight');
      if (mark) {
        const commentId = mark.getAttribute('data-comment-id');
        if (commentId) {
          cachedPageComments = cachedPageComments.filter(c => c.id !== commentId);
          saveLocalComments(cachedPageComments);
          renderCommentsList();
          updateHeaderBadge();
          fetchWithAuth(API_BASE + `/api/comments/${commentId}`, { method: 'DELETE' }).catch(() => {});
        }
        const parent = mark.parentNode;
        if (parent) {
          while (mark.firstChild) {
            if (mark.firstChild !== removeBtn) {
              parent.insertBefore(mark.firstChild, mark);
            } else {
              mark.removeChild(removeBtn);
            }
          }
          parent.removeChild(mark);
        }
      }
      return;
    }

    const blockEl = getSelectableBlock(e.target);
    if (blockEl) {
      selectBlock(blockEl);
    }
  });

  // Floating selection comment button
  const floatingCommentBtn = document.createElement('button');
  floatingCommentBtn.id = 'br-floating-add-comment-btn';
  floatingCommentBtn.className = 'br-floating-comment-btn';
  floatingCommentBtn.innerHTML = '💬 + Thêm phản biện';
  floatingCommentBtn.style.display = 'none';
  document.body.appendChild(floatingCommentBtn);

  let currentSelectedText = '';
  let selectedParentBlock = null;

  function updateFloatingButtonPosition() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      floatingCommentBtn.style.display = 'none';
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 2) {
      floatingCommentBtn.style.display = 'none';
      return;
    }

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const targetNode = container.nodeType === 1 ? container : container.parentElement; const parentBlock = getSelectableBlock(targetNode);

    if (!parentBlock || !mainContent.contains(parentBlock)) {
      floatingCommentBtn.style.display = 'none';
      return;
    }

    currentSelectedText = text;
    selectedParentBlock = parentBlock;

    const rect = range.getBoundingClientRect();
    floatingCommentBtn.style.position = 'fixed';
    floatingCommentBtn.style.left = `${Math.max(10, rect.left + rect.width / 2 - 65)}px`;
    floatingCommentBtn.style.top = `${Math.max(10, rect.top - 42)}px`;
    floatingCommentBtn.style.display = 'flex';
  }

  mainContent.addEventListener('mouseup', () => {
    setTimeout(updateFloatingButtonPosition, 10);
  });

  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      floatingCommentBtn.style.display = 'none';
    }
  });

  floatingCommentBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedParentBlock || !currentSelectedText) return;

    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      activeSelectionRange = sel.getRangeAt(0).cloneRange();
    }

    clearDraftMarks();
    selectBlock(selectedParentBlock);

    if (targetInput) targetInput.value = currentSelectedText.replace(/✕/g, '').trim();
    if (suggestionInput) suggestionInput.focus();
    saveFormDraft();

    floatingCommentBtn.style.display = 'none';
  });

  let currentFilter = 'all';
  const commentsFilterSelect = document.getElementById('br-comments-filter-select');
  if (commentsFilterSelect) {
    commentsFilterSelect.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      renderCommentsList();
    });
  }

  const toggleCommentsBtn = document.getElementById('br-toggle-comments-list-btn');
  const commentsListContainer = document.getElementById('br-all-comments-list');
  if (toggleCommentsBtn && commentsListContainer) {
    toggleCommentsBtn.addEventListener('click', () => {
      const isHidden = commentsListContainer.style.display === 'none';
      commentsListContainer.style.display = isHidden ? 'flex' : 'none';
      toggleCommentsBtn.textContent = isHidden ? '▼' : '▶';
    });
  }

  let cachedPageComments = [];

  // Render Comments as Single-Line Row Items (Target ➔ Suggestion)
  function renderCommentsList() {
    const container = document.getElementById('br-all-comments-list');
    const badge = document.getElementById('br-review-badge-count');
    const countInline = document.getElementById('br-comments-count-inline');

    if (!container) return;
    container.innerHTML = '';

    const filtered = currentFilter === 'all' 
      ? cachedPageComments 
      : cachedPageComments.filter(c => (c.errorType || 'Lỗi dịch') === currentFilter);

    if (badge) {
      if (cachedPageComments.length > 0) {
        badge.textContent = cachedPageComments.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (countInline) {
      countInline.textContent = cachedPageComments.length;
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 0.78rem;">${cachedPageComments.length === 0 ? 'Chưa có phản biện nào.' : 'Không có phản biện thuộc nhóm này.'}</div>`;
      return;
    }

    filtered.forEach(c => {
      const item = document.createElement('div');
      item.className = 'br-comment-single-row';
      item.setAttribute('data-block-id', c.blockId);
      item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 4px; cursor: pointer; transition: background 0.15s, border-color 0.15s; box-shadow: 0 1px 3px rgba(0,0,0,0.02);';

      let targetSnippet = (c.targetText || c.selectedText || '').trim();
      let suggestSnippet = (c.suggestedText || '').trim();

      let displayText = '';
      if (targetSnippet && suggestSnippet) {
        displayText = `${targetSnippet} ➔ ${suggestSnippet}`;
      } else if (targetSnippet) {
        displayText = targetSnippet;
      } else if (suggestSnippet) {
        displayText = suggestSnippet;
      } else {
        displayText = c.reason || c.text || (c.blockId ? `Mục ${c.blockId}` : 'Khối phản biện');
      }

      let secBadgeHtml = '';
      if (c.pageId) {
        const pageName = c.pageId.split('/').pop().replace(/\.html$/, '');
        const secMatch = pageName.match(/^(\d+\.\d+|\d+-\d+)/);
        if (secMatch) {
          const secTag = secMatch[1].replace('-', '.');
          secBadgeHtml = `<span style="font-size: 0.68rem; background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 3px; font-weight: 700; flex-shrink: 0;">[${secTag}]</span>`;
        }
      }

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; min-width: 0;">
          <span style="font-size: 0.7rem; color: #0284c7; flex-shrink: 0;">📍</span>
          ${secBadgeHtml}
          <span style="font-size: 0.78rem; color: #1e293b; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(displayText)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 6px;">
          <span style="font-size: 0.68rem; color: #94a3b8;">${new Date(c.timestamp || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          <button class="br-delete-single-comment-btn" data-comment-id="${c.id}" title="Xóa phản biện này" style="background: none; border: none; color: #ef4444; font-size: 11px; cursor: pointer; padding: 1px 4px; border-radius: 3px;">✕</button>
        </div>
      `;

      item.addEventListener('mouseenter', () => {
        item.style.background = '#f8fafc';
        item.style.borderColor = '#0071e3';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = '#ffffff';
        item.style.borderColor = '#e2e8f0';
      });

      // 4-Step Navigation Algorithm when row is clicked
      item.addEventListener('click', (e) => {
        if (e.target.closest('.br-delete-single-comment-btn')) return;

        if (c.pageId) {
          const targetClean = c.pageId.split('/').pop().replace(/\.html$/, '');
          const currentClean = window.location.pathname.split('/').pop().replace(/\.html$/, '');
          if (targetClean !== currentClean) {
            navigateToPage(c.pageId);
            return;
          }
        }

        let targetEl = null;

        if (c.id) {
          targetEl = mainContent.querySelector(`mark[data-comment-id="${c.id}"]`);
        }

        if (!targetEl && targetSnippet) {
          const marks = mainContent.querySelectorAll('mark.br-text-highlight');
          for (const m of marks) {
            if (m.textContent.includes(targetSnippet)) {
              targetEl = m;
              break;
            }
          }
        }

        const bId = c.blockId;
        if (!targetEl && bId) {
          targetEl = document.getElementById(`${bId}-vn`) || document.getElementById(bId);
        }

        if (!targetEl && targetSnippet) {
          const allEls = mainContent.querySelectorAll('.vn.visible, p, h1, h2, h3, h4, li');
          for (const el of allEls) {
            if (el.textContent.includes(targetSnippet)) {
              targetEl = el;
              break;
            }
          }
        }

        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.style.transition = 'outline 0.3s ease, background-color 0.3s ease, box-shadow 0.3s ease';
          targetEl.style.outline = '3px solid #f59e0b';
          targetEl.style.backgroundColor = '#fef3c7';
          targetEl.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.4)';
          setTimeout(() => {
            targetEl.style.outline = '';
            targetEl.style.backgroundColor = '';
            targetEl.style.boxShadow = '';
          }, 2800);
        }
      });

      container.appendChild(item);
    });

    // Delete Event Handlers
    container.querySelectorAll('.br-delete-single-comment-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        if (confirm('Bạn có chắc chắn muốn xóa phản biện này?')) {
          const targetComment = cachedPageComments.find(c => c.id === commentId);
          if (targetComment && targetComment._pageKey) {
            try {
              let pageComments = JSON.parse(localStorage.getItem(targetComment._pageKey)) || [];
              pageComments = pageComments.filter(c => c.id !== commentId);
              localStorage.setItem(targetComment._pageKey, JSON.stringify(pageComments));
            } catch(e) {}
          } else {
            saveLocalComments(cachedPageComments.filter(c => c.id !== commentId));
          }

          cachedPageComments = cachedPageComments.filter(c => c.id !== commentId);
          renderCommentsList();

          const mark = document.querySelector(`mark[data-comment-id="${commentId}"]`);
          if (mark) {
            const parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
          }

          fetchWithAuth(API_BASE + `/api/comments/${commentId}`, { method: 'DELETE' }).catch(() => {});
        }
      });
    });
  }

  function updateHeaderBadge() {
    const badge = document.getElementById('br-review-badge-count');
    if (badge) {
      if (cachedPageComments.length > 0) {
        badge.textContent = cachedPageComments.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  function loadAllPageComments() {
    fetchWithAuth(API_BASE + `/api/comments/all?bookId=${bookId}&pageId=all`)
      .then(res => res.ok ? res.json() : [])
      .then(serverComments => {
        if (Array.isArray(serverComments)) {
          const currentCleanPage = pageId.split('/').pop().replace(/\.html$/, '').toLowerCase();
          const currentChapterId = (pageId.includes('/') ? pageId.split('/')[0] : pageId).toLowerCase();
          const curBookClean = (bookId || '').toLowerCase();

          cachedPageComments = serverComments.filter(c => {
            if (!c) return false;

            const text = (c.targetText || c.selectedText || c.text || '').trim();
            if (text === 'thích' || text === 'nice' || text === 'great' || text === 'test') return false;

            const cBook = (c.bookId || '').toLowerCase();
            if (cBook && curBookClean && curBookClean !== 'book' && curBookClean !== 'books') {
              if (cBook !== curBookClean && !cBook.includes(curBookClean) && !curBookClean.includes(cBook)) {
                return false;
              }
            }

            const cPage = (c.pageId || '').toLowerCase();
            if (!cPage) return true;

            const cCleanPage = cPage.split('/').pop().replace(/\.html$/, '');
            const cChap = cPage.includes('/') ? cPage.split('/')[0] : cPage;

            if (currentChapterId && (cChap === currentChapterId || cPage.includes(currentChapterId))) {
              return true;
            }
            if (currentCleanPage && (cCleanPage === currentCleanPage || cPage.includes(currentCleanPage))) {
              return true;
            }

            return false;
          }).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

          renderCommentsList();
          applyHighlightsForComments(cachedPageComments);
        }
      })
      .catch(err => {
        console.warn('Network error loading comments from database:', err);
      });
  }

  // Google Docs style live auto-sync every 3 seconds & on tab focus
  setInterval(loadAllPageComments, 3000);
  window.addEventListener('focus', loadAllPageComments);

  // Handle Comment Submission
  const commentForm = document.getElementById('br-comment-form');

  if (commentForm) {
    commentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const targetTextVal = targetInput ? targetInput.value.trim() : '';
      const errorTypeVal = errorTypeSelect ? errorTypeSelect.value : 'Lỗi dịch';
      const suggestedTextVal = suggestionInput ? suggestionInput.value.trim() : '';
      const reasonVal = reasonInput ? reasonInput.value.trim() : '';

      if (!targetTextVal && !suggestedTextVal && !reasonVal) {
        alert('Vui lòng chọn hoặc bôi đen văn bản cần phản biện!');
        return;
      }

      const bId = activeBlockId || 'general';
      const locCtx = activeLocationContext || (activeSelectedBlockEl ? getBlockLocationContext(activeSelectedBlockEl) : bId);

      const newComment = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        bookId,
        pageId,
        blockId: bId,
        locationContext: locCtx,
        name: window.currentUser ? window.currentUser.name : 'Editor BỘT',
        author: window.currentUser ? window.currentUser.username : 'editor1',
        timestamp: new Date().toISOString(),
        errorType: errorTypeVal,
        targetText: targetTextVal,
        suggestedText: suggestedTextVal,
        reason: reasonVal,
        text: reasonVal || ''
      };

      cachedPageComments.unshift(newComment);
      renderCommentsList();

      let highlightApplied = false;
      if (activeSelectionRange && targetTextVal) {
        try {
          const rangeText = activeSelectionRange.toString().trim();
          if (rangeText === targetTextVal || rangeText.includes(targetTextVal) || targetTextVal.includes(rangeText)) {
            const mark = document.createElement('mark');
            mark.className = 'br-text-highlight';
            mark.setAttribute('data-comment-id', newComment.id);

            const textSpan = document.createElement('span');
            textSpan.textContent = rangeText;
            mark.appendChild(textSpan);

            const removeBtn = document.createElement('span');
            removeBtn.className = 'br-mark-remove-btn';
            removeBtn.title = 'Hủy bôi vàng & phản biện';
            removeBtn.textContent = '✕';
            mark.appendChild(removeBtn);

            activeSelectionRange.deleteContents();
            activeSelectionRange.insertNode(mark);
            highlightApplied = true;
          }
        } catch(e) {
          console.warn('Direct range highlight failed:', e);
        }
        activeSelectionRange = null;
      }

      if (!highlightApplied && targetTextVal) {
        applyHighlightsForComments([newComment]);
      }

      if (suggestionInput) suggestionInput.value = '';
      if (reasonInput) reasonInput.value = '';
      if (targetInput) targetInput.value = '';
      activeBlockId = null;
      activeLocationContext = '';
      activeSelectedBlockEl = null;
      localStorage.removeItem(DRAFT_KEY);

      fetchWithAuth(API_BASE + '/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComment)
      })
        .then(res => res.json())
        .then(() => {
          loadAllPageComments();
        })
        .catch(err => console.warn('Server error saving comment:', err));
    });
  }

  const closePanelBtn = document.getElementById('br-close-panel-btn');
  if (closePanelBtn) {
    closePanelBtn.addEventListener('click', () => {
      document.body.classList.remove('panel-open');
      const previouslySelected = mainContent.querySelectorAll('.br-block-selected');
      previouslySelected.forEach(el => el.classList.remove('br-block-selected'));
    });
  }

  loadAllPageComments();
}

// State Management
let selectedBook = '';
let activeTab = 'dashboard-tab';
let currentIframePage = ''; // e.g. 2-1-overview-of-the-entrepreneurial-journey.html
let activeQAMarkdownFile = ''; // e.g. 2-1-overview-of-the-entrepreneurial-journey-semantic-review-round-1.md
let activeSessionPoller = null;

// Tab Definitions for Header
const tabMetadata = {
  'dashboard-tab': {
    title: 'Dashboard',
    desc: 'Tổng quan tiến độ sách dịch và onboarding sách mới từ OpenStax'
  },
  'translate-tab': {
    title: 'Dịch thuật',
    desc: 'Thiết lập phiên dịch tự động. Trình Agent Antigravity chạy dịch qua chat IDE'
  },
  'qa-tab': {
    title: 'Đọc sách & Sửa lỗi QA',
    desc: 'Khung đọc sách chia đôi màn hình. Nhấp chuột đọc sách và sửa các lỗi QA trực quan'
  },
  'publish-tab': {
    title: 'Xuất bản & Git',
    desc: 'Đóng gói bản dịch sạch, kiểm tra Git status và push lên Liberian-Book GitHub'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadBooks();
  initOnboardForm();
  initTranslationSession();
  initQAListener();
  initPublishAndGit();
  initApiTranslate();

  // Restore active book from localStorage
  const savedBook = localStorage.getItem('bot_selected_book');
  if (savedBook) {
    selectedBook = savedBook;
  }
});

// 1. Navigation / Tabs Switching
function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const tabId = item.getAttribute('data-tab');
      
      // Update active nav class
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Show/Hide Panels
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');

      // Update Header Text
      activeTab = tabId;
      document.getElementById('current-tab-title').textContent = tabMetadata[tabId].title;
      document.getElementById('current-tab-desc').textContent = tabMetadata[tabId].desc;

      // Special Tab-based loads
      if (tabId === 'qa-tab') {
        loadReaderDropdown();
      } else if (tabId === 'publish-tab') {
        loadGitStatus();
      } else if (tabId === 'dashboard-tab') {
        loadBookChapters();
      }
    });
  });
}

// 2. Fetch and Load books
async function loadBooks() {
  const select = document.getElementById('global-book-select');
  try {
    const res = await fetch('/api/books');
    const books = await res.json();
    
    select.innerHTML = '<option value="">-- Chọn sách dịch --</option>';
    books.forEach(book => {
      const option = document.createElement('option');
      option.value = book.name;
      option.textContent = book.name;
      if (book.name === selectedBook) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
      selectedBook = e.target.value;
      localStorage.setItem('bot_selected_book', selectedBook);
      onBookChanged();
    });

    if (selectedBook) {
      onBookChanged();
    }
  } catch (err) {
    console.error('Lỗi khi tải danh sách sách:', err);
    select.innerHTML = '<option value="">Lỗi tải sách</option>';
  }
}

function onBookChanged() {
  if (!selectedBook) return;

  if (activeTab === 'dashboard-tab') {
    loadBookChapters();
  } else if (activeTab === 'translate-tab') {
    loadTranslationChapters();
  } else if (activeTab === 'qa-tab') {
    loadReaderDropdown();
    document.getElementById('book-reader-iframe').src = 'about:blank';
    document.getElementById('qa-issues-list').innerHTML = '';
    document.getElementById('qa-no-issues').classList.remove('hidden');
    document.getElementById('qa-actions-bar').classList.add('hidden');
  } else if (activeTab === 'publish-tab') {
    loadGitStatus();
  }
}

// 3. Load Book Chapters for Dashboard Table
async function loadBookChapters() {
  const tbody = document.getElementById('chapters-list-body');
  if (!selectedBook) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">Vui lòng chọn một cuốn sách ở góc phải.</td></tr>`;
    document.getElementById('chapters-count').textContent = '0 Chương';
    return;
  }

  tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">Đang tải tiến độ chương...</td></tr>`;

  try {
    const res = await fetch(`/api/books/${selectedBook}/chapters`);
    const chapters = await res.json();

    document.getElementById('chapters-count').textContent = `${chapters.length} Chương`;

    if (chapters.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">Sách chưa có chương nào được scrape. Hãy onboard sách mới bên phải!</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    chapters.forEach(ch => {
      const tr = document.createElement('tr');
      
      const renderDot = (status) => {
        return status 
          ? `<span class="progress-dot dot-active" title="Hoàn tất">✓</span>` 
          : `<span class="progress-dot dot-inactive" title="Chưa xong">-</span>`;
      };

      // Translated cell: show file count and percentage
      let transCell;
      if (ch.phases.translated) {
        const pct = ch.progressPercent || 0;
        const done = ch.translatedCount || 0;
        const total = ch.totalFilesCount || done;
        const dotClass = pct >= 100 ? 'dot-active' : 'dot-warn';
        transCell = `<span class="progress-dot ${dotClass}" title="${done}/${total} files (${pct}%)">${pct}%</span>`; 
      } else {
        transCell = renderDot(false);
      }

      // QA cell: show pending count if any
      let qaCell;
      if (ch.phases.review) {
        if (ch.pendingQACount > 0) {
          qaCell = `<span class="progress-dot dot-warn" title="${ch.pendingQACount} lỗi chưa xử lý">${ch.pendingQACount}🔴</span>`;
        } else {
          qaCell = renderDot(true);
        }
      } else {
        qaCell = renderDot(false);
      }

      tr.innerHTML = `
        <td><strong>Chương ${ch.number}</strong></td>
        <td>${renderDot(ch.phases.raw)}</td>
        <td>${renderDot(ch.phases.clean)}</td>
        <td>${renderDot(ch.phases.analyzed)}</td>
        <td>${renderDot(ch.phases.prep)}</td>
        <td>${transCell}</td>
        <td>${qaCell}</td>
        <td>${renderDot(ch.phases.archive)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Lỗi khi tải chi tiết chương:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Lỗi tải dữ liệu.</td></tr>`;
  }
}

// 4. Onboarding New Book form handler
function initOnboardForm() {
  const form = document.getElementById('onboard-form');
  const btn = document.getElementById('btn-onboard');
  const consoleContainer = document.getElementById('onboard-console-container');
  const logOutput = document.getElementById('onboard-log-output');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bookName = document.getElementById('onboard-book-name').value.trim();
    const startUrl = document.getElementById('onboard-start-url').value.trim();
    const glossaryInput = document.getElementById('onboard-glossary');

    if (!bookName || !startUrl) return;

    // UI state
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Đang tải lên Glossary...</span>';
    consoleContainer.classList.remove('hidden');
    logOutput.textContent = '🚀 Khởi động luồng Onboarding...\n';

    // 1. Read and upload Glossary file
    if (glossaryInput.files && glossaryInput.files[0]) {
      const file = glossaryInput.files[0];
      try {
        const fileContent = await file.text();
        logOutput.textContent += `📁 Đang tải lên tệp từ điển: ${file.name} (${file.size} bytes)...\n`;
        
        const uploadRes = await fetch(`/api/books/${bookName}/glossary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ content: fileContent })
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || uploadData.status !== 'success') {
          throw new Error(uploadData.error || 'Lỗi không xác định khi tải lên glossary');
        }
        logOutput.textContent += '✅ Tải lên tệp glossary.csv thành công!\n';
      } catch (uploadError) {
        logOutput.textContent += `❌ LỖI UPLOAD GLOSSARY: ${uploadError.message}\n`;
        btn.disabled = false;
        btn.innerHTML = '<span>🥖 Bắt đầu Onboarding (Scrape)</span>';
        return;
      }
    } else {
      logOutput.textContent += '⚠️ Cảnh báo: Không chọn tệp glossary.csv, có thể sách sẽ không được nhận diện đúng cách.\n';
    }

    btn.innerHTML = '<span>⏳ Đang chạy Puppeteer...</span>';
    logOutput.textContent += '🤖 Đang kết nối tới máy chủ cào dữ liệu...\n';

    // Start SSE stream for console logs
    const eventSource = new EventSource(`/api/books/${bookName}/onboard/stream?url=${encodeURIComponent(startUrl)}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.log) {
        logOutput.textContent += data.log + '\n';
        logOutput.scrollTop = logOutput.scrollHeight;
      }
      
      if (data.status === 'success' || data.status === 'failed') {
        eventSource.close();
        btn.disabled = false;
        btn.innerHTML = '<span>🥖 Bắt đầu Onboarding (Scrape)</span>';
        
        if (data.status === 'success') {
          logOutput.textContent += '\n🎉 [THÀNH CÔNG] Sách mới đã được onboard và cleanup hoàn tất!\n';
          loadBooks(); // refresh list
        } else {
          logOutput.textContent += `\n❌ [THẤT BẠI] Gặp lỗi trong quá trình onboard (Mã lỗi: ${data.code})\n`;
        }
      }
    };

    eventSource.onerror = (err) => {
      console.error('Lỗi kết nối Stream logs:', err);
      logOutput.textContent += '\n❌ Lỗi kết nối máy chủ khi stream log.\n';
      eventSource.close();
      btn.disabled = false;
      btn.innerHTML = '<span>🥖 Bắt đầu Onboarding (Scrape)</span>';
    };
  });
}


// 5. Translation Session Tab handlers
async function loadTranslationChapters() {
  const container = document.getElementById('translation-chapters-list');
  if (!selectedBook) {
    container.innerHTML = '<p class="text-muted">Chọn sách trước để load danh sách chương...</p>';
    return;
  }

  container.innerHTML = '<p class="text-muted">Đang tải chương...</p>';

  try {
    const res = await fetch(`/api/books/${selectedBook}/chapters`);
    const chapters = await res.json();

    if (chapters.length === 0) {
      container.innerHTML = '<p class="text-muted">Sách này chưa có chương nào được onboard.</p>';
      return;
    }

    container.innerHTML = '';
    chapters.forEach(ch => {
      const label = document.createElement('label');
      label.className = 'chapter-checkbox-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = ch.number;
      checkbox.className = 'translation-chap-checkbox';

      // Build status text for chapter
      const pct = ch.progressPercent || 0;
      const done = ch.translatedCount || 0;
      const total = ch.totalFilesCount || 0;
      const cleanTag = ch.phases.clean ? '✓ Clean' : '– No clean';
      let progressTag = '';
      if (ch.phases.translated && total > 0) {
        progressTag = ` • 📊 ${done}/${total} (${pct}%)`;
      } else if (ch.phases.translated) {
        progressTag = ` • ✓ Đã dịch`;
      } else {
        progressTag = ` • Chưa dịch`;
      }
      const qaTag = ch.pendingQACount > 0 ? ` • ⚠️ ${ch.pendingQACount} lỗi QA` : '';

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(`Chương ${ch.number} (${cleanTag}${progressTag}${qaTag})`));
      container.appendChild(label);
    });
  } catch (err) {
    container.innerHTML = '<p class="text-danger">Không thể tải chương.</p>';
  }
}

function initTranslationSession() {
  const btnCreate = document.getElementById('btn-create-session');
  const btnCopy = document.getElementById('btn-copy-command');

  btnCreate.addEventListener('click', async () => {
    if (!selectedBook) {
      alert('Vui lòng chọn một cuốn sách!');
      return;
    }

    const checkboxes = document.querySelectorAll('.translation-chap-checkbox:checked');
    if (checkboxes.length === 0) {
      alert('Vui lòng chọn ít nhất một chương để dịch!');
      return;
    }

    const chapters = Array.from(checkboxes).map(cb => parseInt(cb.value));

    const apiFallback = document.getElementById('chk-api-fallback').checked;

    // Create session object
    const session = {
      book: selectedBook,
      chapters: chapters,
      apiFallback: apiFallback,
      status: 'pending',
      timestamp: new Date().toISOString(),
      logs: ['[SESSION] Phiên dịch được tạo thành công.', 'Đang chờ bạn gõ lệnh trong chat Antigravity IDE...'],
      files: [] // will be populated by Agent
    };

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      });
      
      const result = await res.json();
      if (result.status === 'success') {
        showActiveSession(result.session);
        startSessionPolling();
      }
    } catch (err) {
      console.error('Lỗi tạo phiên dịch:', err);
      alert('Lỗi kết nối máy chủ.');
    }
  });

  btnCopy.addEventListener('click', () => {
    const code = document.getElementById('agent-chat-command').textContent;
    navigator.clipboard.writeText(code).then(() => {
      btnCopy.textContent = 'Copied!';
      setTimeout(() => btnCopy.textContent = 'Copy', 1500);
    });
  });

  // Start polling session state immediately on load to see if one exists
  startSessionPolling();
}

function startSessionPolling() {
  if (activeSessionPoller) clearInterval(activeSessionPoller);

  activeSessionPoller = setInterval(async () => {
    try {
      const res = await fetch('/api/session');
      const session = await res.json();
      
      if (session && session.book === selectedBook && session.status !== 'empty') {
        showActiveSession(session);
      } else {
        hideActiveSession();
      }
    } catch (e) {
      console.error('Lỗi khi poll session:', e);
    }
  }, 3000);
}

function showActiveSession(session) {
  document.getElementById('no-active-session').classList.add('hidden');
  document.getElementById('active-session-container').classList.remove('hidden');

  // Status Badge
  const statusEl = document.getElementById('session-global-status');
  statusEl.textContent = session.status.toUpperCase();
  statusEl.className = 'badge';
  
  if (session.status === 'pending') {
    statusEl.classList.add('badge-warning');
  } else if (session.status === 'translating') {
    statusEl.classList.add('badge-info');
    statusEl.textContent = 'ĐANG DỊCH';
  } else if (session.status === 'completed' || session.status === 'finished') {
    statusEl.classList.add('badge-success');
    statusEl.textContent = 'HOÀN THÀNH';
  }

  // Pulse indicator
  const pulse = document.getElementById('session-pulse');
  if (session.status === 'translating') {
    pulse.style.display = 'inline-block';
  } else {
    pulse.style.display = 'none';
  }

  // Set chat text command
  document.getElementById('agent-chat-command').textContent = `Hãy dịch session hiện tại`;

  // --- Session Summary Stats ---
  const files = session.files || [];
  const doneCount = files.filter(f => f.status === 'completed').length;
  const totalCount = files.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  document.getElementById('stat-files-done').textContent = `${doneCount} / ${totalCount}`;
  document.getElementById('stat-percent').textContent = `${pct}%`;
  const statusLabels = { pending: '⏳ Chưa bắt đầu', translating: '⚡ Đang dịch...', completed: '✅ Hoàn thành', finished: '✅ Hoàn thành' };
  document.getElementById('stat-status-text').textContent = statusLabels[session.status] || session.status;

  // --- Last Log Summary ---
  const logs = session.logs || [];
  // Find meaningful agent logs (not initial SESSION lines)
  const agentLogs = logs.filter(l => l.includes('✅') || l.includes('❌') || l.includes('🎉') || l.includes('⏳'));
  const lastLog = agentLogs.length > 0 ? agentLogs[agentLogs.length - 1] : (logs.length > 0 ? logs[logs.length - 1] : null);
  const lastLogBox = document.getElementById('agent-last-log-box');
  if (lastLog) {
    document.getElementById('agent-last-log-text').textContent = lastLog;
    lastLogBox.style.display = 'flex';
  } else {
    lastLogBox.style.display = 'none';
  }

  // --- QA Pending Alert ---
  const qaAlert = document.getElementById('qa-pending-alert');
  if (session.pendingQA && session.pendingQA.count > 0) {
    const { count, chapters: qaChapters } = session.pendingQA;
    document.getElementById('qa-alert-title').textContent = `⚠️ ${count} lỗi QA cần xử lý!`;
    document.getElementById('qa-alert-desc').textContent = `Các chương có lỗi: ${qaChapters.join(', ')}`;
    qaAlert.style.display = 'flex';
    // Store QA chapter info for the button
    document.getElementById('btn-go-to-qa').dataset.chapters = JSON.stringify(qaChapters);
  } else if (session.status === 'completed' || session.status === 'finished') {
    // Check chapters in session
    fetchSessionQASummary(session);
  } else {
    qaAlert.style.display = 'none';
  }

  // Render logs
  const logsEl = document.getElementById('agent-session-logs');
  logsEl.textContent = logs.join('\n');
  logsEl.scrollTop = logsEl.scrollHeight;

  // Render files progress
  const filesList = document.getElementById('session-files-list');
  if (files.length > 0) {
    filesList.innerHTML = '';
    files.forEach(file => {
      const row = document.createElement('div');
      row.className = 'session-file-row';
      
      const fileStatusText = file.status === 'completed' 
        ? '✅ Hoàn thành' 
        : (file.status === 'translating' ? '⏳ Đang dịch...' : '💤 Đang chờ');

      row.innerHTML = `
        <div class="session-file-info">
          <span class="name">${file.path.split('/').pop()}</span>
          <span class="status">${fileStatusText}</span>
        </div>
        <div class="session-progress-bar-container">
          <div class="session-progress-bar" style="width: ${file.progress}%"></div>
        </div>
      `;
      filesList.appendChild(row);
    });
  } else {
    filesList.innerHTML = `<p class="text-muted small">Agent chưa quét danh sách files. Hãy copy lệnh chat với Agent...</p>`;
  }
}

function hideActiveSession() {
  document.getElementById('no-active-session').classList.remove('hidden');
  document.getElementById('active-session-container').classList.add('hidden');
  
  const statusEl = document.getElementById('session-global-status');
  statusEl.textContent = 'Ngoại tuyến';
  statusEl.className = 'badge badge-secondary';
}

// Fetch QA issues for chapters in session and display alert if any pending
async function fetchSessionQASummary(session) {
  const qaAlert = document.getElementById('qa-pending-alert');
  if (!session.book || !session.chapters || session.chapters.length === 0) {
    qaAlert.style.display = 'none';
    return;
  }

  try {
    let totalPending = 0;
    const chaptersWithIssues = [];

    for (const chapNum of session.chapters) {
      const res = await fetch(`/api/books/${session.book}/chapters/${chapNum}/qa`);
      const issues = await res.json();
      const pending = issues.filter(i => {
        const s = (i.status || '').trim().toLowerCase();
        return s === 'mới' || s === 'yêu cầu sửa lại';
      });
      if (pending.length > 0) {
        totalPending += pending.length;
        chaptersWithIssues.push(`Chương ${chapNum}`);
      }
    }

    if (totalPending > 0) {
      document.getElementById('qa-alert-title').textContent = `⚠️ ${totalPending} lỗi QA cần xử lý!`;
      document.getElementById('qa-alert-desc').textContent = `Các chương có lỗi: ${chaptersWithIssues.join(', ')}`;
      qaAlert.style.display = 'flex';
      document.getElementById('btn-go-to-qa').dataset.chapters = JSON.stringify(session.chapters);
    } else {
      qaAlert.style.display = 'none';
    }
  } catch (e) {
    qaAlert.style.display = 'none';
  }
}

// Wire up the "Sửa ngay" button to switch to QA tab and load first chapter
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-go-to-qa').addEventListener('click', async () => {
    const chaptersRaw = document.getElementById('btn-go-to-qa').dataset.chapters;
    let firstChap = null;
    try {
      const chaps = JSON.parse(chaptersRaw || '[]');
      firstChap = chaps[0] || null;
    } catch (e) {}

    // Switch to QA tab
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const qaNav = document.querySelector('[data-tab="qa-tab"]');
    if (qaNav) qaNav.classList.add('active');
    document.getElementById('qa-tab').classList.add('active');
    document.getElementById('current-tab-title').textContent = tabMetadata['qa-tab'].title;
    document.getElementById('current-tab-desc').textContent = tabMetadata['qa-tab'].desc;
    activeTab = 'qa-tab';

    // Load reader dropdown, then set the chapter (query fresh after possible clone)
    await loadReaderDropdown();
    if (firstChap) {
      const sel = document.getElementById('reader-chapter-select');
      if (sel) {
        sel.value = String(firstChap);
        sel.dispatchEvent(new Event('change'));
      }
    }
  });
});



async function loadReaderDropdown() {
  const select = document.getElementById('reader-chapter-select');
  if (!selectedBook) {
    select.innerHTML = '<option value="">Chọn sách trước...</option>';
    return;
  }

  select.innerHTML = '<option value="">Đang tải chương...</option>';

  try {
    const res = await fetch(`/api/books/${selectedBook}/chapters`);
    const chapters = await res.json();

    select.innerHTML = '<option value="">-- Chọn chương đọc --</option>';
    chapters.forEach(ch => {
      // Only allow reading chapters that have been translated and built
      if (ch.phases.translated) {
        const option = document.createElement('option');
        option.value = ch.number;
        const qaTag = ch.pendingQACount > 0 ? ` ⚠️ ${ch.pendingQACount} lỗi` : (ch.phases.review ? ` ✓ Đã xong QA` : '');
        option.textContent = `Chương ${ch.number} — ${ch.translatedCount} trang${qaTag}`;
        select.appendChild(option);
      }
    });

    // Remove old listener by cloning the select
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);

    newSelect.addEventListener('change', async (e) => {
      const chapNum = e.target.value;
      if (!chapNum) {
        document.getElementById('reader-page-select').style.display = 'none';
        return;
      }

      const iframe = document.getElementById('book-reader-iframe');
      iframe.src = 'about:blank';
      document.getElementById('reader-active-file-label').textContent = 'Đang tải...';

      // Fetch list of built pages for this chapter
      try {
        const pagesRes = await fetch(`/api/books/${selectedBook}/chapters/${chapNum}/pages`);
        const { files, firstPage } = await pagesRes.json();

        // Populate page selector
        const pageSel = document.getElementById('reader-page-select');
        if (files && files.length > 0) {
          pageSel.innerHTML = files.map(f => 
            `<option value="${f}"${f === firstPage ? ' selected' : ''}>${f.replace(/\.html$/, '')}</option>`
          ).join('');
          pageSel.style.display = '';
        } else {
          pageSel.style.display = 'none';
        }

        if (firstPage) {
          iframe.src = `/books/${selectedBook}/chapter-${chapNum}/${firstPage}`;
        } else {
          document.getElementById('reader-active-file-label').textContent = 'Không có trang nào';
          alert(`Chương ${chapNum} chưa được build. Hãy bấm "🔄 Rebuild" trước.`);
        }
      } catch (err) {
        console.error('Lỗi load trang chương:', err);
        document.getElementById('reader-active-file-label').textContent = 'Lỗi tải trang';
      }
    });


  } catch (err) {
    document.getElementById('reader-chapter-select').innerHTML = '<option value="">Lỗi tải chương</option>';
  }
}


function initQAListener() {
  const iframe = document.getElementById('book-reader-iframe');
  
  iframe.addEventListener('load', () => {
    try {
      const iframeUrl = iframe.contentWindow.location.pathname;
      console.log('Iframe loaded URL path:', iframeUrl);
      
      // Matches path like "/books/[book]/chapter-[chap]/[file].html"
      const pattern = /\/books\/([^\/]+)\/chapter-(\d+)\/([^\/]+\.html)/;
      const match = iframeUrl.match(pattern);

      if (match) {
        const bookName = match[1];
        const chapName = match[2];
        const htmlFileName = match[3];

        currentIframePage = htmlFileName;
        document.getElementById('reader-active-file-label').textContent = htmlFileName;

        // Sync page selector to the currently loaded file
        const pageSel = document.getElementById('reader-page-select');
        if (pageSel.style.display !== 'none') {
          pageSel.value = htmlFileName;
        }

        // Fetch QA issues for this page
        loadQAIssuesForPage(bookName, chapName, htmlFileName);

      } else {
        // Might be index.html redirecting
        console.log('URL did not match standard chapter page pattern');
      }
    } catch (e) {
      console.warn('Cross-origin check warning:', e);
    }
  });

  // Rebuild button
  document.getElementById('btn-rebuild-preview-reader').addEventListener('click', async () => {
    if (!selectedBook) return;
    const btn = document.getElementById('btn-rebuild-preview-reader');
    btn.disabled = true;
    btn.innerHTML = '⏳ Building...';
    try {
      const res = await fetch(`/api/books/${selectedBook}/publish`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        alert('Build thành công!');
        iframe.contentWindow.location.reload();
      } else {
        alert('Build lỗi: ' + data.error);
      }
    } catch (err) {
      alert('Lỗi kết nối.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🔄 Rebuild';
    }
  });

  // Open in New Tab button
  document.getElementById('btn-open-new-tab').addEventListener('click', () => {
    const currentSrc = iframe.src;
    if (!currentSrc || currentSrc === 'about:blank') {
      alert('Chưa có trang nào được tải. Hãy chọn chương trước.');
      return;
    }
    window.open(currentSrc, '_blank');
  });

  // Fullscreen toggle button
  const readerCard = document.getElementById('reader-card');
  const btnFullscreen = document.getElementById('btn-fullscreen-reader');
  let isFullscreen = false;

  btnFullscreen.addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      readerCard.classList.add('fullscreen-mode');
      btnFullscreen.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
        Thu nhỏ
      `;
    } else {
      readerCard.classList.remove('fullscreen-mode');
      btnFullscreen.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        Phóng to
      `;
    }
  });

  // ESC key exits fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullscreen) {
      isFullscreen = false;
      readerCard.classList.remove('fullscreen-mode');
      btnFullscreen.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        Phóng to
      `;
    }
  });

  // Page file select (within chapter)
  document.getElementById('reader-page-select').addEventListener('change', (e) => {
    const pageFile = e.target.value;
    if (!pageFile) return;
    const chapSel = document.getElementById('reader-chapter-select');
    const chapNum = chapSel.value;
    if (chapNum) {
      iframe.src = `/books/${selectedBook}/chapter-${chapNum}/${pageFile}`;
    }
  });

  // Apply Patches button
  document.getElementById('btn-apply-qa-patches').addEventListener('click', applyQAPatches);
}

async function loadQAIssuesForPage(book, chapter, htmlFile) {
  const listContainer = document.getElementById('qa-issues-list');
  const noIssuesContainer = document.getElementById('qa-no-issues');
  const actionsBar = document.getElementById('qa-actions-bar');

  listContainer.innerHTML = '<p class="text-muted">Đang quét phản biện QA...</p>';
  noIssuesContainer.classList.add('hidden');
  actionsBar.classList.add('hidden');

  try {
    const res = await fetch(`/api/books/${book}/chapters/${chapter}/qa`);
    const allIssues = await res.json();

    // Filter issues belonging to current htmlFile page
    // Markdown files are named like "2-1-overview-of-the-entrepreneurial-journey-semantic-review-round-1.md"
    // HTML is named "2-1-overview-of-the-entrepreneurial-journey.html"
    const prefix = htmlFile.replace('.html', '').toLowerCase();
    const pageIssues = allIssues.filter(issue => issue.file.toLowerCase().startsWith(prefix));

    if (pageIssues.length === 0) {
      listContainer.innerHTML = '';
      noIssuesContainer.classList.remove('hidden');
      return;
    }

    listContainer.innerHTML = '';
    noIssuesContainer.classList.add('hidden');
    actionsBar.classList.remove('hidden');

    // Keep track of markdown file we are modifying
    activeQAMarkdownFile = pageIssues[0].file;

    // Update header QA count badge
    const pendingIssues = pageIssues.filter(i => (i.status || '').trim() === 'Mới');
    const headerCountBadge = document.querySelector('.qa-sidebar .badge-count') || document.getElementById('qa-count-badge');
    if (headerCountBadge) {
      headerCountBadge.textContent = `${pendingIssues.length} Lỗi`;
      headerCountBadge.className = pendingIssues.length > 0 ? 'badge badge-warning' : 'badge badge-success';
    }

    pageIssues.forEach(issue => {
      const isResolved = issue.status.trim() === 'Đã sửa' || issue.status.trim() === 'Từ chối';
      const card = document.createElement('div');
      card.className = `qa-issue-card ${isResolved ? 'resolved' : ''}`;
      card.id = `qa-card-${issue.id}`;
      
      const badgeClass = issue.status.trim() === 'Đã sửa' ? 'badge-success' : (issue.status.trim() === 'Từ chối' ? 'badge-secondary' : 'badge-warning');

      card.innerHTML = `
        <div class="qa-issue-header">
          <span class="qa-issue-id">${issue.id}</span>
          <span class="badge ${badgeClass}" id="qa-badge-${issue.id}">${issue.status}</span>
        </div>
        <div class="qa-text-block original">
          <strong>EN Gốc:</strong> ${issue.original}
        </div>
        <div class="qa-critique">
          <strong>Phản biện:</strong> ${issue.critique}
        </div>
        <div class="qa-text-block current" style="position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div><strong>Bản dịch hiện tại:</strong> ${issue.current}</div>
            <button class="btn btn-primary btn-xs btn-jump-to-text" data-id="${issue.id}" style="font-size:0.75rem; padding:3px 10px; border-radius:4px; white-space:nowrap; cursor:pointer; background-color:#2563eb; color:#fff; border:none; display:inline-flex; align-items:center; gap:4px;" title="Nhảy trực tiếp đến vị trí đoạn văn trên sách reader">
              📍 Xem trên sách
            </button>
          </div>
        </div>
        <div class="qa-suggestion-edit">
          <label>Đề xuất sửa (Suggestion):</label>
          <textarea id="qa-suggest-${issue.id}">${issue.suggestion}</textarea>
        </div>
        <div class="qa-card-actions">
          <div style="display:flex; align-items:center; gap:8px;">
            <label for="qa-status-${issue.id}" style="font-size:0.75rem; color:var(--text-muted);">Trạng thái:</label>
            <select id="qa-status-${issue.id}">
              <option value="Mới" ${issue.status.trim() === 'Mới' ? 'selected' : ''}>Mới</option>
              <option value="Đã sửa" ${issue.status.trim() === 'Đã sửa' || issue.status.trim().includes('chấp nhận') ? 'selected' : ''}>Đã sửa (Chấp nhận)</option>
              <option value="Từ chối" ${issue.status.trim() === 'Từ chối' ? 'selected' : ''}>Từ chối</option>
            </select>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline-info btn-sm btn-jump-to-text-actions" data-id="${issue.id}">
              📍 Xem vị trí
            </button>
            <button class="btn btn-secondary btn-sm btn-save-issue" data-id="${issue.id}" data-file="${issue.file}" data-line="${issue.lineIndex}" data-current="${issue.current}">
              Lưu
            </button>
          </div>
        </div>
      `;

      listContainer.appendChild(card);
    });

    // Auto-save & manual save handlers
    pageIssues.forEach(issue => {
      const ta = document.getElementById(`qa-suggest-${issue.id}`);
      const sel = document.getElementById(`qa-status-${issue.id}`);
      const card = document.getElementById(`qa-card-${issue.id}`);
      const badge = document.getElementById(`qa-badge-${issue.id}`);
      const btn = card.querySelector('.btn-save-issue');

      const saveIssue = async () => {
        const suggestion = ta.value.trim();
        const status = sel.value;
        btn.disabled = true;
        btn.textContent = 'Đang lưu...';

        try {
          const updateRes = await fetch(`/api/books/${selectedBook}/chapters/${chapter}/qa/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file: issue.file,
              lineIndex: issue.lineIndex,
              id: issue.id,
              current: issue.current,
              suggestion: suggestion,
              status: status
            })
          });
          const updateData = await updateRes.json();
          if (updateData.status === 'success') {
            card.classList.remove('editing');
            badge.textContent = status;
            if (status === 'Đã sửa') {
              badge.className = 'badge badge-success';
              card.classList.add('resolved');
            } else if (status === 'Từ chối') {
              badge.className = 'badge badge-secondary';
              card.classList.add('resolved');
            } else {
              badge.className = 'badge badge-warning';
              card.classList.remove('resolved');
            }
          }
        } catch (err) {
          console.error('Lỗi lưu QA:', err);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Lưu';
        }
      };

      btn.addEventListener('click', saveIssue);

      // Auto save when changing dropdown status
      sel.addEventListener('change', () => {
        saveIssue();
      });

      // Jump to text redirect button listeners
      const btnJumpTop = card.querySelector('.btn-jump-to-text');
      const btnJumpAction = card.querySelector('.btn-jump-to-text-actions');

      const triggerJump = () => {
        jumpToTextInReader(issue.current, issue.original, issue.suggestion);
      };

      if (btnJumpTop) btnJumpTop.addEventListener('click', triggerJump);
      if (btnJumpAction) btnJumpAction.addEventListener('click', triggerJump);
    });

  } catch (err) {
    listContainer.innerHTML = '<p class="text-danger">Không thể tải danh sách phản biện QA.</p>';
  }
}

// Function to scroll iframe book reader directly to the error snippet and highlight it
function jumpToTextInReader(targetText, origText, suggestionText) {
  const iframe = document.getElementById('book-reader-iframe');
  if (!iframe || !iframe.contentWindow) {
    alert('Khung đọc sách chưa sẵn sàng.');
    return;
  }

  let iframeDoc;
  try {
    iframeDoc = iframe.contentWindow.document;
  } catch (e) {
    alert('Không thể truy cập tài liệu trong iframe.');
    return;
  }

  if (!iframeDoc || !iframeDoc.body) {
    alert('Nội dung trang đọc sách chưa tải xong.');
    return;
  }

  // Helper to normalize and clean text snippets
  const cleanSnippet = (str) => {
    if (!str) return '';
    return str
      .replace(/^`|`$/g, '')        // remove code backticks
      .replace(/<[^>]+>/g, '')       // remove HTML tags
      .replace(/\.\.\.|\u2026/g, '') // remove ellipses ... or …
      .replace(/["'“”]/g, '')        // remove quotes
      .trim();
  };

  const currentClean = cleanSnippet(targetText);
  const suggestClean = cleanSnippet(suggestionText);
  const origClean = cleanSnippet(origText);

  // Search candidates in iframe (Excludes outer container divs)
  const candidates = Array.from(iframeDoc.querySelectorAll(
    'p.vn.visible, figcaption.vn.visible, li.vn.visible, dt.vn.visible, dd.vn.visible, h1.vn.visible, h2.vn.visible, h3.vn.visible, h4.vn.visible, h5.vn.visible, h6.vn.visible, span, p, figcaption, li, dt, dd, td'
  ));

  let matches = [];

  // Helper to collect matching elements
  const findMatches = (cleanQuery) => {
    if (!cleanQuery || cleanQuery.length < 2) return [];
    const query = cleanQuery.toLowerCase();
    return candidates.filter(el => {
      const text = (el.textContent || '').replace(/["'“”]/g, '').toLowerCase();
      return text.includes(query);
    });
  };

  // 1. Try finding Current text
  matches = findMatches(currentClean);

  // 2. Try Suggestion text
  if (matches.length === 0) {
    matches = findMatches(suggestClean);
  }

  // 3. Try Original EN text
  if (matches.length === 0) {
    matches = findMatches(origClean);
  }

  // 4. Fallback: Search for exact phrase snippet of at least 3 consecutive words
  if (matches.length === 0) {
    const words = (currentClean || suggestClean).split(/\s+/).filter(w => w.length >= 3);
    if (words.length >= 3) {
      const phrase3 = words.slice(0, 3).join(' ').toLowerCase();
      matches = candidates.filter(el => (el.textContent || '').toLowerCase().includes(phrase3));
    }
  }

  let foundEl = null;
  if (matches.length > 0) {
    // Sort matches by shortest textContent length to select the SMALLEST / MOST SPECIFIC element (e.g. term span or specific paragraph)
    matches.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    foundEl = matches[0];
  }

  if (foundEl) {
    // Scroll element smooth to center of viewport
    foundEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Store original styles
    const origTransition = foundEl.style.transition;
    const origBoxShadow = foundEl.style.boxShadow;
    const origBg = foundEl.style.backgroundColor;
    const origBorderLeft = foundEl.style.borderLeft;
    const origPaddingLeft = foundEl.style.paddingLeft;

    // Apply high-contrast targeted highlight to the specific paragraph/term
    foundEl.style.transition = 'all 0.3s ease';
    foundEl.style.backgroundColor = '#fef08a'; // Bright yellow
    foundEl.style.borderLeft = '6px solid #f59e0b';
    foundEl.style.paddingLeft = '8px';
    foundEl.style.boxShadow = '0 2px 10px rgba(245, 158, 11, 0.4)';
    foundEl.style.borderRadius = '3px';

    setTimeout(() => {
      foundEl.style.backgroundColor = origBg;
      foundEl.style.borderLeft = origBorderLeft;
      foundEl.style.paddingLeft = origPaddingLeft;
      foundEl.style.boxShadow = origBoxShadow;
      foundEl.style.transition = origTransition;
    }, 4500);
  } else {
    alert(`Không tìm thấy vị trí chứa "${currentClean || suggestClean}" trên trang hiện tại.`);
  }
}

async function applyQAPatches() {
  if (!selectedBook || !currentIframePage || !activeQAMarkdownFile) return;

  const select = document.getElementById('reader-chapter-select');
  const chapter = select.value;
  const btn = document.getElementById('btn-apply-qa-patches');

  btn.disabled = true;
  btn.textContent = '🔨 Đang áp dụng bản vá & rebuild...';

  try {
    const res = await fetch(`/api/books/${selectedBook}/chapters/${chapter}/qa/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: activeQAMarkdownFile,
        htmlFile: currentIframePage
      })
    });
    
    const result = await res.json();
    if (result.status === 'success') {
      // 1. Reload iframe to show changes instantly
      document.getElementById('book-reader-iframe').contentWindow.location.reload();
      
      // 2. Refresh chapter dropdown list to update total pending error counts
      await loadReaderDropdown();
      const chapSel = document.getElementById('reader-chapter-select');
      if (chapSel) chapSel.value = String(chapter);

      // 3. Fetch fresh QA issues for all pages in chapter
      const qaRes = await fetch(`/api/books/${selectedBook}/chapters/${chapter}/qa`);
      const freshIssues = await qaRes.json();

      const currentPrefix = currentIframePage.replace('.html', '').toLowerCase();
      const currentPending = freshIssues.filter(i => 
        i.file.toLowerCase().startsWith(currentPrefix) && (i.status || '').trim() === 'Mới'
      );

      if (currentPending.length === 0) {
        // Current page is 100% resolved! Find next page in chapter with pending issues
        const pageSel = document.getElementById('reader-page-select');
        const pageOptions = Array.from(pageSel.options).map(opt => opt.value).filter(Boolean);
        
        let nextPageWithIssues = null;
        for (const pFile of pageOptions) {
          const pPrefix = pFile.replace('.html', '').toLowerCase();
          const pPending = freshIssues.filter(i => 
            i.file.toLowerCase().startsWith(pPrefix) && (i.status || '').trim() === 'Mới'
          );
          if (pPending.length > 0) {
            nextPageWithIssues = pFile;
            break;
          }
        }

        if (nextPageWithIssues) {
          // Auto-advance to next page with QA issues
          pageSel.value = nextPageWithIssues;
          const iframe = document.getElementById('book-reader-iframe');
          iframe.src = `/books/${selectedBook}/chapter-${chapter}/${nextPageWithIssues}`;
          currentIframePage = nextPageWithIssues;
          loadQAIssuesForPage(selectedBook, chapter, nextPageWithIssues);

          alert(`✅ Vá HTML trang thành công!\n\n🎉 Trang vừa rồi đã hoàn tất 100% QA. Tự động chuyển sang trang tiếp theo có lỗi: ${nextPageWithIssues.replace('.html', '')}`);
        } else {
          // All pages in this chapter are 100% resolved!
          loadQAIssuesForPage(selectedBook, chapter, currentIframePage);
          alert(`🎉 CHÚC MỪNG! Toàn bộ các bài trong Chương ${chapter} đã được rà soát và vá HTML 100%!`);
        }
      } else {
        // Current page still has pending issues
        loadQAIssuesForPage(selectedBook, chapter, currentIframePage);
        alert('✅ Đã vá HTML thành công cho các mục được chọn!');
      }
    } else {
      alert('Vá HTML thất bại: ' + result.error + '\n\nChi tiết:\n' + result.details);
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔨 ÁP DỤNG BẢN VÁ (PATCH HTML & REFRESH)';
  }
}

// 7. Publish and Git Sync Tab logic
function initPublishAndGit() {
  const btnRun = document.getElementById('btn-run-publish');
  const buildLogs = document.getElementById('publish-build-logs');

  btnRun.addEventListener('click', async () => {
    if (!selectedBook) {
      alert('Vui lòng chọn sách để publish!');
      return;
    }

    btnRun.disabled = true;
    btnRun.textContent = '📦 Đang build...';
    buildLogs.textContent = '🚀 Bắt đầu đóng gói bản dịch sạch...\n';

    try {
      const res = await fetch(`/api/books/${selectedBook}/publish`, { method: 'POST' });
      const data = await res.json();
      
      if (data.status === 'success') {
        buildLogs.textContent += data.buildLog + '\n';
        buildLogs.textContent += `\n✅ ${data.message}\n`;
        // Refresh git status
        loadGitStatus();
      } else {
        buildLogs.textContent += `\n❌ LỖI BUILD:\n${data.error}\n\nChi tiết:\n${data.details}\n`;
      }
    } catch (err) {
      buildLogs.textContent += '\n❌ Lỗi kết nối đến server.\n';
    } finally {
      btnRun.disabled = false;
      btnRun.textContent = '📦 ĐÓNG GÓI & EXPORT SANG WEB-SITE';
    }
  });

  // Git buttons
  document.getElementById('btn-refresh-git-status').addEventListener('click', loadGitStatus);
  document.getElementById('btn-git-push').addEventListener('click', runGitPush);
}

async function loadGitStatus() {
  const output = document.getElementById('git-status-output');
  if (!selectedBook) {
    output.textContent = 'Vui lòng chọn một cuốn sách.';
    return;
  }

  output.textContent = 'Đang kiểm tra Git Status...';

  try {
    const res = await fetch(`/api/books/${selectedBook}/git/status`);
    const data = await res.json();
    if (data.status) {
      output.textContent = data.status;
    } else {
      output.textContent = 'Sạch sẽ (Everything up-to-date!). Không có file thay đổi.';
    }
  } catch (err) {
    output.textContent = 'Lỗi kết nối Git API.';
  }
}

function runGitPush() {
  if (!selectedBook) return;

  const msgInput = document.getElementById('git-commit-msg');
  const commitMsg = msgInput.value.trim() || `Publish book ${selectedBook}`;
  const btn = document.getElementById('btn-git-push');
  const consoleContainer = document.getElementById('git-push-console-container');
  const logsEl = document.getElementById('git-push-logs');

  btn.disabled = true;
  consoleContainer.classList.remove('hidden');
  logsEl.textContent = '🚀 Bắt đầu push Git...\n';

  const eventSource = new EventSource(`/api/books/${selectedBook}/git/push/stream?msg=${encodeURIComponent(commitMsg)}`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.log) {
      logsEl.textContent += data.log + '\n';
      logsEl.scrollTop = logsEl.scrollHeight;
    }
    
    if (data.status === 'success' || data.status === 'failed') {
      eventSource.close();
      btn.disabled = false;
      
      if (data.status === 'success') {
        logsEl.textContent += '\n🎉 [GIT SUCCESS] Push thành công!\n';
        msgInput.value = ''; // clear message input
        loadGitStatus(); // refresh status
      } else {
        logsEl.textContent += '\n❌ [GIT FAILED] Thất bại khi push.\n';
      }
    }
  };

  eventSource.onerror = (err) => {
    console.error('Lỗi Stream Git:', err);
    logsEl.textContent += '\n❌ Gặp lỗi kết nối máy chủ.\n';
    eventSource.close();
    btn.disabled = false;
  };
}

// ─────────────────────────────────────────────────────────
// API TRANSLATION (OpenRouter / DeepSeek)
// ─────────────────────────────────────────────────────────
function initApiTranslate() {
  const keyInput = document.getElementById('api-key-input');
  const toggleBtn = document.getElementById('btn-toggle-key');
  const modelSelect = document.getElementById('api-model-select');
  const saveBtn = document.getElementById('btn-save-api-config');
  const runBtn = document.getElementById('btn-run-api-translate');
  const keyBadge = document.getElementById('api-key-badge');
  const logBox = document.getElementById('api-log-box');
  const logConsole = document.getElementById('api-log-console');
  const pulse = document.getElementById('api-pulse');

  if (!keyInput) return;

  // Load saved config from server
  async function loadApiConfig() {
    try {
      const res = await fetch('/api/translate-api/config');
      const cfg = await res.json();
      if (cfg.hasKey) {
        keyBadge.textContent = cfg.apiKeyMasked || 'Đã cấu hình';
        keyBadge.style.background = 'rgba(16,185,129,0.2)';
        keyBadge.style.color = '#10b981';
        keyBadge.style.borderColor = 'rgba(16,185,129,0.4)';
        keyInput.placeholder = cfg.apiKeyMasked || 'Đã lưu (để trống để giữ nguyên)';
      }
      if (cfg.model) {
        const opt = modelSelect.querySelector(`option[value="${cfg.model}"]`);
        if (opt) opt.selected = true;
      }
    } catch (e) {
      console.error('Không tải được API config:', e);
    }
  }

  loadApiConfig();

  // Toggle key visibility
  toggleBtn.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  // Save config
  saveBtn.addEventListener('click', async () => {
    const apiKey = keyInput.value.trim();
    const model = modelSelect.value;
    if (!apiKey) {
      alert('Vui lòng nhập API key trước khi lưu.');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Đang lưu...';
    try {
      const res = await fetch('/api/translate-api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        saveBtn.textContent = '✅ Đã lưu!';
        keyInput.value = '';
        loadApiConfig();
        setTimeout(() => { saveBtn.textContent = '💾 Lưu cấu hình'; saveBtn.disabled = false; }, 2000);
      } else {
        saveBtn.textContent = '❌ Lỗi';
        setTimeout(() => { saveBtn.textContent = '💾 Lưu cấu hình'; saveBtn.disabled = false; }, 2000);
      }
    } catch (e) {
      saveBtn.textContent = '❌ Lỗi kết nối';
      setTimeout(() => { saveBtn.textContent = '💾 Lưu cấu hình'; saveBtn.disabled = false; }, 2000);
    }
  });

  // Run API translation with SSE streaming log
  let apiEventSource = null;

  runBtn.addEventListener('click', () => {
    // If already running, stop it
    if (apiEventSource) {
      apiEventSource.close();
      apiEventSource = null;
      runBtn.textContent = '🚀 Chạy dịch qua API';
      runBtn.style.background = '';
      pulse.style.display = 'none';
      return;
    }

    if (!selectedBook) {
      alert('Vui lòng chọn sách trước.');
      return;
    }

    logBox.style.display = 'block';
    logConsole.textContent = '';
    pulse.style.display = 'inline-block';
    runBtn.textContent = '⏹ Dừng';
    runBtn.style.background = '#ef4444';

    const appendLog = (line) => {
      logConsole.textContent += line + '\n';
      logConsole.scrollTop = logConsole.scrollHeight;
    };

    appendLog('🔗 Đang kết nối API...');

    apiEventSource = new EventSource('/api/translate-api/run/stream');

    apiEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.log) appendLog(data.log);
        if (data.status === 'success' || data.status === 'error') {
          apiEventSource.close();
          apiEventSource = null;
          runBtn.textContent = '🚀 Chạy dịch qua API';
          runBtn.style.background = '';
          pulse.style.display = 'none';
          // Refresh session panel
          if (typeof loadSession === 'function') loadSession();
        }
      } catch (e) {
        appendLog(event.data);
      }
    };

    apiEventSource.onerror = () => {
      appendLog('❌ Mất kết nối đến server.');
      apiEventSource.close();
      apiEventSource = null;
      runBtn.textContent = '🚀 Chạy dịch qua API';
      runBtn.style.background = '';
      pulse.style.display = 'none';
    };
  });
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '..');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount preview static files for books
app.use('/books/:book', (req, res, next) => {
  const bookName = req.params.book;
  const previewPath = path.join(WORKSPACE_ROOT, bookName, '.html');
  if (fs.existsSync(previewPath)) {
    express.static(previewPath, {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    })(req, res, next);
  } else {
    res.status(404).send(`Chưa xây dựng bản preview cho sách: ${bookName}. Vui lòng chạy Build & Export.`);
  }
});

// Mock Auth & Review Endpoints for local dashboard reader iframe
// Local comments file persistence
const COMMENTS_FILE = path.join(__dirname, 'comments.json');
let localComments = [];

try {
  if (fs.existsSync(COMMENTS_FILE)) {
    const raw = fs.readFileSync(COMMENTS_FILE, 'utf-8');
    localComments = JSON.parse(raw);
  }
} catch (e) {
  console.warn('Failed to load local comments file:', e);
}

function saveLocalCommentsToFile() {
  try {
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(localComments, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to save local comments file:', e);
  }
}

const LOCAL_USERS = {
  "admin": { password: "1234566", name: "Admin (Quản trị viên)", role: "admin" },
  "editor1": { password: "123456", name: "Editor 1", role: "editor" },
  "editor2": { password: "123456", name: "Editor 2", role: "editor" }
};

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = LOCAL_USERS[username];
  if (user && user.password === password) {
    const token = `token_${username}_${Date.now()}`;
    return res.json({ success: true, user: { username, name: user.name, role: user.role }, token });
  }
  return res.status(401).json({ error: 'Invalid username or password' });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ username: 'admin', name: 'Admin (Quản trị viên)', role: 'admin' });
});

app.get('/api/comments/summary', (req, res) => {
  const { bookId, pageId } = req.query;
  const summary = {};
  localComments.forEach(c => {
    if ((!bookId || c.bookId === bookId) && (!pageId || c.pageId === pageId)) {
      if (!summary[c.blockId]) summary[c.blockId] = { commentsCount: 0, suggestionsCount: 0 };
      summary[c.blockId].commentsCount++;
    }
  });
  res.json(summary);
});

app.get('/api/comments/all', (req, res) => {
  const { bookId, pageId } = req.query;
  const filtered = localComments.filter(c => (!bookId || c.bookId === bookId) && (!pageId || c.pageId === pageId));
  res.json(filtered);
});

app.get('/api/comments/:blockId', (req, res) => {
  const { bookId, pageId } = req.query;
  const { blockId } = req.params;
  if (blockId === 'all') {
    const filtered = localComments.filter(c => (!bookId || c.bookId === bookId) && (!pageId || c.pageId === pageId));
    return res.json(filtered);
  }
  const filtered = localComments.filter(c => (!bookId || c.bookId === bookId) && (!pageId || c.pageId === pageId) && c.blockId === blockId);
  res.json(filtered);
});

app.post('/api/comments', (req, res) => {
  const { id, bookId, pageId, blockId, text, selectedText, errorType, targetText, suggestedText, reason, locationContext, timestamp, author, name } = req.body;
  const newComment = {
    id: id || ('c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
    bookId,
    pageId,
    blockId,
    locationContext: locationContext || blockId,
    name: name || 'Editor 1',
    author: author || 'editor1',
    timestamp: timestamp || new Date().toISOString(),
    text: text || reason || '',
    selectedText: selectedText || targetText || '',
    errorType: errorType || 'Không dịch',
    targetText: targetText || selectedText || '',
    suggestedText: suggestedText || '',
    reason: reason || text || ''
  };
  localComments = localComments.filter(c => c.id !== newComment.id);
  localComments.unshift(newComment);
  saveLocalCommentsToFile();
  res.json({ success: true, comment: newComment });
});

app.delete('/api/comments/:commentId', (req, res) => {
  const { commentId } = req.params;
  localComments = localComments.filter(c => c.id !== commentId);
  saveLocalCommentsToFile();
  res.json({ success: true });
});

app.get('/api/suggestions/:blockId', (req, res) => {
  res.json([]);
});

app.get('/api/book/:book/toc', (req, res) => {
  res.json([]);
});


// Helper: Run command and return promise
function runCmd(command, cwd = WORKSPACE_ROOT) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Helper: Reorganize flat book files into chapter folders
function reorganizeBookFolders(bookName) {
  const bookDir = path.join(WORKSPACE_ROOT, bookName);
  const rawDir = path.join(bookDir, 'raw');
  const cleanDir = path.join(bookDir, 'clean');
  const assetsDir = path.join(bookDir, 'assets');

  if (!fs.existsSync(rawDir)) return;

  const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.html'));

  files.forEach(file => {
    let chapNum = 999;
    if (file.startsWith('preface')) {
      chapNum = 0;
    } else if (file.startsWith('references')) {
      chapNum = 20;
    } else if (file.startsWith('index')) {
      chapNum = 21;
    } else {
      const match = file.match(/^(\d+)-/);
      if (match) {
        chapNum = parseInt(match[1]);
      } else if (file.startsWith('a-')) {
        chapNum = 18;
      } else if (file.startsWith('b-')) {
        chapNum = 19;
      }
    }

    const chapDir = path.join(bookDir, `chapter-${chapNum}`);
    const destRawDir = path.join(chapDir, '01-raw');
    const destCleanDir = path.join(chapDir, '02-clean');
    const destAssetsDir = path.join(chapDir, 'assets');

    // Create directories
    fs.mkdirSync(destRawDir, { recursive: true });
    fs.mkdirSync(destCleanDir, { recursive: true });

    // Move raw file
    const srcRawFile = path.join(rawDir, file);
    if (fs.existsSync(srcRawFile)) {
      fs.renameSync(srcRawFile, path.join(destRawDir, file));
    }

    // Move clean file
    const srcCleanFile = path.join(cleanDir, file);
    if (fs.existsSync(srcCleanFile)) {
      fs.renameSync(srcCleanFile, path.join(destCleanDir, file));
    }

    // Find and move associated images from assets/ to chapter's assets/
    let filePrefix = file.replace('.html', '');
    const numMatch = filePrefix.match(/^(\d+(?:-\d+)?)/);
    if (numMatch) {
      filePrefix = numMatch[1];
    }
    const imgPrefix = `img-${filePrefix}-`;

    if (fs.existsSync(assetsDir)) {
      const allAssets = fs.readdirSync(assetsDir);
      allAssets.forEach(asset => {
        if (asset.startsWith(imgPrefix)) {
          fs.mkdirSync(destAssetsDir, { recursive: true });
          fs.renameSync(path.join(assetsDir, asset), path.join(destAssetsDir, asset));
        }
      });
    }
  });

  // Clean up empty directories
  try {
    if (fs.existsSync(rawDir)) fs.rmdirSync(rawDir);
    if (fs.existsSync(cleanDir)) fs.rmdirSync(cleanDir);
    if (fs.existsSync(assetsDir)) fs.rmdirSync(assetsDir);
  } catch (err) {
    console.error('Lỗi khi xoá thư mục tạm:', err.message);
  }
}


// 1. GET /api/books: Scan for book directories in workspace
app.get('/api/books', (req, res) => {
  try {
    const files = fs.readdirSync(WORKSPACE_ROOT);
    const books = [];

    for (const file of files) {
      const fullPath = path.join(WORKSPACE_ROOT, file);
      if (fs.statSync(fullPath).isDirectory()) {
        // Ignore internal/utility folders
        if (['translate-agents', 'web-site', 'dashboard', 'node_modules'].includes(file) || file.startsWith('.')) {
          continue;
        }
        // A book should contain glossary.csv
        const glossaryPath = path.join(fullPath, 'glossary.csv');
        if (fs.existsSync(glossaryPath)) {
          // Read tasks.md to get general progress if available
          let tasksContent = '';
          const tasksPath = path.join(fullPath, 'tasks.md');
          if (fs.existsSync(tasksPath)) {
            tasksContent = fs.readFileSync(tasksPath, 'utf8');
          }

          books.push({
            name: file,
            hasTasks: fs.existsSync(tasksPath),
            path: fullPath
          });
        }
      }
    }
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/books/:book/chapters: List chapters and their phase readiness
app.get('/api/books/:book/chapters', (req, res) => {
  const bookName = req.params.book;
  const bookPath = path.join(WORKSPACE_ROOT, bookName);

  if (!fs.existsSync(bookPath)) {
    return res.status(404).json({ error: 'Không tìm thấy sách' });
  }

  try {
    const files = fs.readdirSync(bookPath);
    const chapters = [];

    for (const file of files) {
      const fullPath = path.join(bookPath, file);
      if (fs.statSync(fullPath).isDirectory() && file.startsWith('chapter-')) {
        const parsedChapNum = parseInt(file.replace('chapter-', ''));
        const chapNum = isNaN(parsedChapNum) ? 999 : parsedChapNum;
        
        // Check phases
        const rawExists = fs.existsSync(path.join(fullPath, '01-raw'));
        const cleanExists = fs.existsSync(path.join(fullPath, '02-clean'));
        const analyzedExists = fs.existsSync(path.join(fullPath, '03-analyzed'));
        const prepExists = fs.existsSync(path.join(fullPath, '04-prep'));
        const transExists = fs.existsSync(path.join(fullPath, '05-translated'));
        const reviewExists = fs.existsSync(path.join(fullPath, '06-reviews'));
        const archiveExists = fs.existsSync(path.join(fullPath, '07-archive'));

        // Count HTML files in translated
        let transFilesCount = 0;
        const transPath = path.join(fullPath, '05-translated');
        if (transExists) {
          transFilesCount = fs.readdirSync(transPath).filter(f => f.endsWith('.html')).length;
        }

        // Count total expected files from 04-prep or 02-clean
        let totalFilesCount = 0;
        const prepPath = path.join(fullPath, '04-prep');
        const cleanPath = path.join(fullPath, '02-clean');
        if (prepExists) {
          totalFilesCount = fs.readdirSync(prepPath).filter(f => f.endsWith('.html')).length;
        } else if (cleanExists) {
          totalFilesCount = fs.readdirSync(cleanPath).filter(f => f.endsWith('.html')).length;
        }

        // Compute progress percentage
        const progressPercent = totalFilesCount > 0 
          ? Math.round((transFilesCount / totalFilesCount) * 100) 
          : (transExists ? 100 : 0);

        // Count pending QA issues accurately (only count lines where current !== suggestion)
        let pendingQACount = 0;
        if (reviewExists) {
          const reviewPath = path.join(fullPath, '06-reviews');
          const reviewFiles = fs.readdirSync(reviewPath).filter(f => f.endsWith('.md') && !f.includes('integrity-report') && !f.includes('glossary-summary') && !f.includes('glossary-review'));
          for (const rf of reviewFiles) {
            const rfContent = fs.readFileSync(path.join(reviewPath, rf), 'utf8');
            const lines = rfContent.split('\n');
            for (const line of lines) {
              if (!line.startsWith('|') || line.startsWith('| ID') || line.startsWith('|---')) continue;
              const cols = line.split('|').map(c => c.trim());
              if (cols.length >= 8) {
                const current = cols[3].replace(/`/g, '').trim();
                let suggestion = cols[5].replace(/`/g, '').trim();
                const status = cols[7].trim();
                if (current !== suggestion && (status === 'Mới' || status === 'Yêu cầu sửa lại' || status.includes('Manual') || status.includes('Chờ Dev') || status.includes('thủ công'))) {
                  pendingQACount++;
                }
              }
            }
          }
        }

        chapters.push({
          name: file,
          number: chapNum,
          phases: {
            raw: rawExists,
            clean: cleanExists,
            analyzed: analyzedExists,
            prep: prepExists,
            translated: transExists,
            review: reviewExists,
            archive: archiveExists
          },
          translatedCount: transFilesCount,
          totalFilesCount: totalFilesCount,
          progressPercent: progressPercent,
          pendingQACount: pendingQACount
        });
      }
    }

    // Sort chapters numerically
    chapters.sort((a, b) => a.number - b.number);
    res.json(chapters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// 2b. POST /api/books/:book/glossary: Save uploaded glossary content
app.post('/api/books/:book/glossary', (req, res) => {
  const bookName = req.params.book;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Nội dung file glossary trống hoặc không hợp lệ.' });
  }

  const bookDir = path.join(WORKSPACE_ROOT, bookName);
  const glossaryPath = path.join(bookDir, 'glossary.csv');

  try {
    if (!fs.existsSync(bookDir)) {
      fs.mkdirSync(bookDir, { recursive: true });
    }
    fs.writeFileSync(glossaryPath, content, 'utf8');
    res.json({ status: 'success', message: 'Tệp glossary.csv đã được tạo thành công!' });
  } catch (error) {
    res.status(500).json({ error: 'Không thể tạo hoặc lưu tệp glossary.csv: ' + error.message });
  }
});


// 3. POST /api/books/:book/onboard: Run scraping and cleanup in background (SSE stream logs)
app.get('/api/books/:book/onboard/stream', (req, res) => {
  const bookName = req.params.book;
  const startUrl = req.query.url;

  if (!startUrl) {
    return res.status(400).send('Thiếu tham số url');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendLog = (message) => {
    res.write(`data: ${JSON.stringify({ log: message })}\n\n`);
  };

  sendLog(`[ONBOARD] Bắt đầu quá trình thu thập sách: ${bookName}`);
  sendLog(`[ONBOARD] URL gốc: ${startUrl}`);

  // Run Scrape
  const scrapeScript = path.join(WORKSPACE_ROOT, 'translate-agents/agents/agent-scrape/scripts/skill-scrape.js');
  sendLog(`[SCRAPE] Đang chạy scraper Puppeteer...`);

  const scrapeProcess = spawn('node', [scrapeScript, bookName, startUrl], {
    cwd: path.join(WORKSPACE_ROOT, 'translate-agents')
  });

  scrapeProcess.stdout.on('data', (data) => {
    sendLog(data.toString().trim());
  });

  scrapeProcess.stderr.on('data', (data) => {
    sendLog(`[WARN/ERR] ${data.toString().trim()}`);
  });

  scrapeProcess.on('close', (code) => {
    if (code !== 0) {
      sendLog(`[SCRAPE] ❌ Quá trình scrape thất bại với mã lỗi ${code}`);
      res.write(`data: ${JSON.stringify({ status: 'failed', code })}\n\n`);
      res.end();
      return;
    }
    sendLog(`[SCRAPE] ✅ Hoàn tất thu thập HTML gốc!`);
    sendLog(`[CLEANUP] Bắt đầu làm sạch HTML và tải hình ảnh về máy...`);

    // Run Cleanup
    const cleanupScript = path.join(WORKSPACE_ROOT, 'translate-agents/agents/agent-scrape/scripts/skill-cleanup.js');
    const cleanupProcess = spawn('node', [cleanupScript, bookName], {
      cwd: path.join(WORKSPACE_ROOT, 'translate-agents')
    });

    cleanupProcess.stdout.on('data', (data) => {
      sendLog(data.toString().trim());
    });

    cleanupProcess.stderr.on('data', (data) => {
      sendLog(`[WARN/ERR] ${data.toString().trim()}`);
    });

    cleanupProcess.on('close', (code) => {
      if (code !== 0) {
        sendLog(`[CLEANUP] ❌ Quá trình dọn dẹp thất bại với mã lỗi ${code}`);
        res.write(`data: ${JSON.stringify({ status: 'failed', code })}\n\n`);
      } else {
        sendLog(`[CLEANUP] ✅ Hoàn tất quá trình Cleanup & tải ảnh!`);
        try {
          sendLog(`[ONBOARD] 📦 Đang tự động phân loại các tệp về từng chương (chapter-X)...`);
          reorganizeBookFolders(bookName);
          sendLog(`[ONBOARD] ✅ Hoàn tất phân loại thư mục chương! Sách sẵn sàng dịch thuật.`);
          res.write(`data: ${JSON.stringify({ status: 'success' })}\n\n`);
        } catch (reorgErr) {
          sendLog(`[ONBOARD] ❌ Lỗi phân loại thư mục chương: ${reorgErr.message}`);
          res.write(`data: ${JSON.stringify({ status: 'failed', code: 500 })}\n\n`);
        }
      }
      res.end();
    });
  });
});

// 4a. GET /api/books/:book/chapters/:chapter/pages: List built HTML pages for chapter
app.get('/api/books/:book/chapters/:chapter/pages', (req, res) => {
  const { book, chapter } = req.params;
  const builtChapDir = path.join(WORKSPACE_ROOT, book, '.html', `chapter-${chapter}`);

  if (!fs.existsSync(builtChapDir)) {
    return res.json({ files: [], firstPage: null });
  }

  try {
    const sortOrder = (name) => {
      // Match: 15-1-show-me-the-money.html  (chapter-section-slug)
      const withSection = name.match(/^(\d+)-(\d+)-(.+)\.html$/);
      if (withSection) {
        return [parseInt(withSection[1]), parseInt(withSection[2]), withSection[3]];
      }
      // Match: 15-introduction.html, 15-key-terms.html etc. (chapter-slug, no section number)
      const noSection = name.match(/^(\d+)-(.+)\.html$/);
      if (noSection) {
        const ch = parseInt(noSection[1]);
        const slug = noSection[2];
        if (slug === 'introduction') return [ch, 0, slug];
        if (slug === 'key-terms') return [ch, 100, slug];
        if (slug.includes('summary')) return [ch, 101, slug];
        if (slug.includes('preparing')) return [ch, 102, slug];
        if (slug.includes('critical-thinking')) return [ch, 103, slug];
        if (slug.includes('ethics')) return [ch, 104, slug];
        if (slug.includes('working')) return [ch, 105, slug];
        if (slug.includes('hot-links')) return [ch, 106, slug];
        return [ch, 99, slug];
      }
      return [999, 999, name];
    };

    const files = fs.readdirSync(builtChapDir)
      .filter(f => f.endsWith('.html'))
      .sort((a, b) => {
        const [ac, as1, aslug] = sortOrder(a);
        const [bc, bs1, bslug] = sortOrder(b);
        if (ac !== bc) return ac - bc;
        if (as1 !== bs1) return as1 - bs1;
        return aslug.localeCompare(bslug);
      });

    const firstPage = files.length > 0 ? files[0] : null;
    res.json({ files, firstPage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 4. GET & POST /api/session: Share active translation sessions with Antigravity Agent
const SESSION_FILE = path.join(__dirname, 'active_session.json');

app.get('/api/session', (req, res) => {
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      return res.json(data);
    } catch (e) {
      return res.json({ status: 'empty' });
    }
  }
  res.json({ status: 'empty' });
});

app.post('/api/session', (req, res) => {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ status: 'success', session: req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. GET /api/books/:book/chapters/:chapter/qa: Parse review markdown reports in 06-reviews/
app.get('/api/books/:book/chapters/:chapter/qa', (req, res) => {
  const { book, chapter } = req.params;
  const reviewsDir = path.join(WORKSPACE_ROOT, book, `chapter-${chapter}`, '06-reviews');

  if (!fs.existsSync(reviewsDir)) {
    return res.json([]);
  }

  try {
    const files = fs.readdirSync(reviewsDir).filter(f => f.endsWith('.md') && !f.includes('integrity-report') && !f.includes('glossary-summary'));
    const allIssues = [];

    for (const file of files) {
      const filePath = path.join(reviewsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      let inTable = false;
      let headersMap = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('| ID |') || line.startsWith('|ID|')) {
          inTable = true;
          // Map headers
          const cols = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
          cols.forEach((col, idx) => {
            headersMap[col.toLowerCase()] = idx;
          });
          continue;
        }
        if (inTable && line.startsWith('|---')) {
          continue;
        }
        if (inTable && line.startsWith('|')) {
          const cols = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
          if (cols.length > 0) {
            // Find key column values dynamically based on mapping
            const getColVal = (keys, defaultIdx) => {
              for (const k of keys) {
                for (const hk of Object.keys(headersMap)) {
                  if (hk.includes(k) && cols[headersMap[hk]] !== undefined) return cols[headersMap[hk]];
                }
              }
              return cols[defaultIdx] || '';
            };

            const issueId = cols[0] || `L-${i}`;
            const originalText = getColVal(['gốc', 'original'], 1) || '';
            const currentText = getColVal(['hiện tại', 'current'], 2) || '';
            const critique = getColVal(['phản biện', 'critique'], 3) || '';
            const suggestionRaw = getColVal(['đề xuất', 'suggestion'], 4) || '';
            const response = getColVal(['phản hồi', 'response'], 5) || '';
            const statusText = getColVal(['trạng thái', 'status'], 6) || '';

            // Clean up backticks in suggestion
            let suggestion = suggestionRaw;
            if (suggestionRaw.includes('`')) {
              const matches = suggestionRaw.match(/`([^`]+)`/);
              if (matches) suggestion = matches[1];
            } else {
              suggestion = suggestionRaw.replace('Sửa thành:', '').trim();
            }

            const currClean = currentText.replace(/`/g, '').trim();
            const suggClean = suggestion.trim();

            // Ignore non-issues where current translation is ALREADY 100% identical to suggestion
            if (currClean !== suggClean) {
              allIssues.push({
                file: file,
                lineIndex: i,
                id: issueId,
                original: originalText.replace(/`/g, ''),
                current: currClean,
                critique: critique,
                suggestion: suggClean,
                response: response,
                status: statusText,
                rawLine: line
              });
            }
          }
        } else if (inTable && !line.startsWith('|')) {
          inTable = false;
        }
      }
    }
    res.json(allIssues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. POST /api/books/:book/chapters/:chapter/qa/update: Update specific markdown line
app.post('/api/books/:book/chapters/:chapter/qa/update', (req, res) => {
  const { book, chapter } = req.params;
  const { file, lineIndex, current, suggestion, status, id } = req.body;
  const filePath = path.join(WORKSPACE_ROOT, book, `chapter-${chapter}`, '06-reviews', file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Không tìm thấy file review' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    if (lineIndex < 0 || lineIndex >= lines.length) {
      return res.status(400).json({ error: 'Chỉ số dòng không hợp lệ' });
    }

    const currentLine = lines[lineIndex];
    const parts = currentLine.split('|');

    // Make sure we have enough columns
    if (parts.length >= 8) {
      // Re-create the line. A standard review row has 9 parts (from split of | col | col |)
      // Parts: ['', ' ID ', ' Thẻ Gốc ', ' Bản dịch hiện tại ', ' Phản biện ', ' Đề xuất sửa ', ' Phản hồi ', ' Trạng thái ', '']
      // Let's identify the header first to find column mapping, or map standard 7 columns (which splits into 9 parts)
      if (parts.length === 9) {
        parts[3] = ` ${current} `;
        parts[5] = ` \`${suggestion}\` `;
        parts[7] = ` ${status} `;
      } else if (parts.length > 9) {
        // More columns, handle mapping if needed
        parts[3] = ` ${current} `;
        parts[5] = ` \`${suggestion}\` `;
        parts[parts.length - 2] = ` ${status} `;
      } else {
        // Less columns
        parts[3] = ` ${current} `;
        parts[5] = ` \`${suggestion}\` `;
        parts[parts.length - 2] = ` ${status} `;
      }

      lines[lineIndex] = parts.join('|');
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      res.json({ status: 'success', updatedLine: lines[lineIndex] });
    } else {
      res.status(400).json({ error: 'Cấu trúc dòng trong bảng markdown không đúng định dạng' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. POST /api/books/:book/chapters/:chapter/qa/apply: Run patch script and build preview
app.post('/api/books/:book/chapters/:chapter/qa/apply', async (req, res) => {
  const { book, chapter } = req.params;
  const { file, htmlFile } = req.body;

  const reviewPath = path.join(WORKSPACE_ROOT, book, `chapter-${chapter}`, '06-reviews', file);
  const htmlPath = path.join(WORKSPACE_ROOT, book, `chapter-${chapter}`, '05-translated', htmlFile);

  if (!fs.existsSync(reviewPath) || !fs.existsSync(htmlPath)) {
    return res.status(400).json({ error: 'Thiếu file review markdown hoặc file HTML song ngữ tương ứng.' });
  }

  try {
    // 1. Execute apply-review-fixes.py
    const applyScript = path.join(WORKSPACE_ROOT, 'translate-agents/agents/agent-translate/scripts/apply-review-fixes.py');
    const pythonCmd = `python3 ${applyScript} "${reviewPath}" "${htmlPath}"`;
    const applyRes = await runCmd(pythonCmd);

    // 2. Execute build-preview.py to re-generate .html preview static content
    const buildScript = path.join(WORKSPACE_ROOT, 'translate-agents/agents/agent-archive/scripts/build-preview.py');
    const rebuildCmd = `python3 ${buildScript} "${path.join(WORKSPACE_ROOT, book)}"`;
    const buildRes = await runCmd(rebuildCmd);

    res.json({
      status: 'success',
      applyLog: applyRes.stdout,
      buildLog: buildRes.stdout
    });
  } catch (error) {
    res.status(500).json({
      error: 'Lỗi trong quá trình vá HTML hoặc Build Preview',
      details: error.stderr || error.message
    });
  }
});

// 8. POST /api/books/:book/publish: Trigger build-preview.py and copy files to web-site/
app.post('/api/books/:book/publish', async (req, res) => {
  const bookName = req.params.book;
  const bookPath = path.join(WORKSPACE_ROOT, bookName);

  try {
    // 1. Build preview
    const buildScript = path.join(WORKSPACE_ROOT, 'translate-agents/agents/agent-archive/scripts/build-preview.py');
    const buildCmd = `python3 ${buildScript} "${bookPath}"`;
    const buildRes = await runCmd(buildCmd);

    // 2. Copy to web-site directory
    const websiteBookDir = path.join(WORKSPACE_ROOT, 'web-site', bookName);
    if (fs.existsSync(websiteBookDir)) {
      fs.rmSync(websiteBookDir, { recursive: true, force: true });
    }
    fs.mkdirSync(websiteBookDir, { recursive: true });

    // Copy built folder
    const htmlSrcDir = path.join(bookPath, '.html');
    if (fs.existsSync(htmlSrcDir)) {
      // Helper function to recursively copy directories
      const copyDir = (src, dest) => {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };
      copyDir(htmlSrcDir, websiteBookDir);
    }

    res.json({
      status: 'success',
      buildLog: buildRes.stdout,
      message: `Đã export thành công bản dịch sạch sang web-site/${bookName}/`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Build hoặc Export thất bại',
      details: error.stderr || error.message
    });
  }
});

// 9. GET /api/books/:book/git/status: Get status of web-site repo
app.get('/api/books/:book/git/status', async (req, res) => {
  try {
    const gitStatus = await runCmd('git status -s', path.join(WORKSPACE_ROOT, 'web-site'));
    res.json({ status: gitStatus.stdout.trim() });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi Git status', details: error.message });
  }
});

// 10. POST /api/books/:book/git/push: Commit & Push to GitHub in web-site repo (SSE stream)
app.get('/api/books/:book/git/push/stream', (req, res) => {
  const bookName = req.params.book;
  const commitMsg = req.query.msg || `Publish book ${bookName}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendLog = (message) => {
    res.write(`data: ${JSON.stringify({ log: message })}\n\n`);
  };

  const gitDir = path.join(WORKSPACE_ROOT, 'web-site');
  sendLog(`[GIT] Bắt đầu đẩy dữ liệu của ${bookName} lên GitHub...`);

  // Run: git add [bookName]
  sendLog(`[GIT] Running: git add "${bookName}"`);
  const gitAdd = spawn('git', ['add', bookName], { cwd: gitDir });

  gitAdd.on('close', (addCode) => {
    if (addCode !== 0) {
      sendLog(`[GIT] ❌ Lỗi khi add file (Code: ${addCode})`);
      res.write(`data: ${JSON.stringify({ status: 'failed' })}\n\n`);
      res.end();
      return;
    }

    // Run: git commit -m "commitMsg"
    sendLog(`[GIT] Running: git commit -m "${commitMsg}"`);
    const gitCommit = spawn('git', ['commit', '-m', commitMsg], { cwd: gitDir });

    gitCommit.stdout.on('data', (d) => sendLog(d.toString().trim()));
    gitCommit.stderr.on('data', (d) => sendLog(d.toString().trim()));

    gitCommit.on('close', (commitCode) => {
      // Code 1 might mean nothing to commit, which is fine
      if (commitCode !== 0 && commitCode !== 1) {
        sendLog(`[GIT] ❌ Lỗi khi commit (Code: ${commitCode})`);
        res.write(`data: ${JSON.stringify({ status: 'failed' })}\n\n`);
        res.end();
        return;
      }

      // Run: git push origin main
      sendLog(`[GIT] Running: git push origin main`);
      const gitPush = spawn('git', ['push', 'origin', 'main'], { cwd: gitDir });

      gitPush.stdout.on('data', (d) => sendLog(d.toString().trim()));
      gitPush.stderr.on('data', (d) => sendLog(d.toString().trim()));

      gitPush.on('close', (pushCode) => {
        if (pushCode !== 0) {
          sendLog(`[GIT] ❌ Lỗi khi push lên GitHub (Code: ${pushCode})`);
          sendLog(`[GIT] Gợi ý: Hãy kiểm tra quyền ssh hoặc https credentials của bạn trong repo web-site.`);
          res.write(`data: ${JSON.stringify({ status: 'failed' })}\n\n`);
        } else {
          sendLog(`[GIT] ✅ Đã đồng bộ thành công lên GitHub (Liberian-Book/web-site)!`);
          res.write(`data: ${JSON.stringify({ status: 'success' })}\n\n`);
        }
        res.end();
      });
    });
  });
});

// ─────────────────────────────────────────────
// API TRANSLATION ROUTES (OpenRouter/DeepSeek)
// ─────────────────────────────────────────────
const API_CONFIG_PATH = path.join(WORKSPACE_ROOT, 'translate-agents/api_config.json');
const API_TRANSLATE_SCRIPT = path.join(WORKSPACE_ROOT, 'translate-agents/api_translate.js');

// GET /api/translate-api/config - load saved API config
app.get('/api/translate-api/config', (req, res) => {
  try {
    if (fs.existsSync(API_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(API_CONFIG_PATH, 'utf8'));
      // Mask API key
      if (cfg.apiKey) cfg.apiKeyMasked = cfg.apiKey.substring(0, 12) + '...' + cfg.apiKey.slice(-4);
      cfg.hasKey = !!cfg.apiKey;
      delete cfg.apiKey;
      return res.json(cfg);
    }
    res.json({ hasKey: false, model: 'deepseek/deepseek-chat-v3-5:free' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/translate-api/config - save API key and model
app.post('/api/translate-api/config', (req, res) => {
  try {
    const { apiKey, model } = req.body;
    const existing = fs.existsSync(API_CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(API_CONFIG_PATH, 'utf8'))
      : {};
    if (apiKey) existing.apiKey = apiKey;
    if (model) existing.model = model;
    fs.writeFileSync(API_CONFIG_PATH, JSON.stringify(existing, null, 2), 'utf8');
    res.json({ status: 'success', message: 'Đã lưu cấu hình API.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/translate-api/run/stream - run api_translate.js with SSE streaming output
app.get('/api/translate-api/run/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Check config
  if (!fs.existsSync(API_CONFIG_PATH)) {
    res.write(`data: ${JSON.stringify({ log: '❌ Chưa cấu hình API key. Vui lòng nhập API key trước.', status: 'error' })}\n\n`);
    return res.end();
  }
  const cfg = JSON.parse(fs.readFileSync(API_CONFIG_PATH, 'utf8'));
  if (!cfg.apiKey) {
    res.write(`data: ${JSON.stringify({ log: '❌ Chưa có API key. Vui lòng nhập API key trong phần cấu hình.', status: 'error' })}\n\n`);
    return res.end();
  }

  const sendLog = (log, status) => {
    res.write(`data: ${JSON.stringify({ log, status })}\n\n`);
  };

  sendLog(`🚀 Khởi động dịch qua API (${cfg.model || 'deepseek'})...`);

  const proc = spawn('node', [API_TRANSLATE_SCRIPT], {
    cwd: path.join(WORKSPACE_ROOT, 'translate-agents'),
    env: { ...process.env, OPENROUTER_API_KEY: cfg.apiKey },
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => sendLog(line));
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => sendLog(`⚠️ ${line}`));
  });

  proc.on('close', (code) => {
    if (code === 0) {
      sendLog('✅ Hoàn tất dịch qua API!', 'success');
    } else {
      sendLog(`❌ Quá trình kết thúc với lỗi (code ${code})`, 'error');
    }
    res.end();
  });

  req.on('close', () => proc.kill());
});
// ─────────────────────────────────────────────
// WATCHDOG: Fallback to API if session is stalled (e.g. Antigravity runs out of quota)
// ─────────────────────────────────────────────
let watchdogActive = false;

setInterval(() => {
  if (watchdogActive) return;

  if (fs.existsSync(SESSION_FILE)) {
    try {
      const stats = fs.statSync(SESSION_FILE);
      const elapsed = Date.now() - stats.mtimeMs;

      // Only check if active_session.json hasn't been updated for > 300 seconds (5 minutes)
      if (elapsed > 300000) {
        const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        
        if (session.status === 'translating' && session.apiFallback === true) {
          exec('pgrep -f api_translate.js', (pgrepErr, stdout) => {
            const isRunning = !pgrepErr && stdout.trim().length > 0;
            if (isRunning) {
              console.log(`[WATCHDOG] Stalled time detected, but api_translate.js is already running (PIDs: ${stdout.trim().split('\n').join(', ')}). Skipping duplicate spawn.`);
              return;
            }

            if (fs.existsSync(API_CONFIG_PATH)) {
              const cfg = JSON.parse(fs.readFileSync(API_CONFIG_PATH, 'utf8'));
              if (cfg.apiKey) {
                watchdogActive = true;
                
                console.log(`[WATCHDOG] Stalled session detected (> 300s idle). Activating API fallback...`);
                
                // Append watchdog logs to session
                session.logs.push(`[${new Date().toLocaleTimeString('vi-VN')}] ⚠️ [WATCHDOG] Phát hiện Antigravity dừng hoạt động quá 5 phút. Tự động kích hoạt dịch qua API để hoàn tất session...`);
                fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');

                const proc = spawn('node', [API_TRANSLATE_SCRIPT], {
                  cwd: path.join(WORKSPACE_ROOT, 'translate-agents'),
                  env: { ...process.env, OPENROUTER_API_KEY: cfg.apiKey },
                });

                proc.stdout.on('data', (data) => {
                  const lines = data.toString().split('\n').filter(l => l.trim());
                  console.log('[WATCHDOG-API-OUT]', lines.join(' | '));
                });

                proc.stderr.on('data', (data) => {
                  const lines = data.toString().split('\n').filter(l => l.trim());
                  console.error('[WATCHDOG-API-ERR]', lines.join(' | '));
                });

                proc.on('close', (code) => {
                  console.log(`[WATCHDOG] API Translation process closed with code ${code}`);
                  watchdogActive = false;
                });
              }
            }
          });
        }
      }
    } catch (e) {
      console.error('[WATCHDOG ERROR]', e.message);
      watchdogActive = false;
    }
  }
}, 30000); // Check every 30 seconds

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  DASHBOARD BỘT ĐANG CHẠY CỤC BỘ TẠI CỔNG: ${PORT}`);
  console.log(`  Mở trình duyệt: http://localhost:${PORT}`);
  console.log(`==================================================`);
});

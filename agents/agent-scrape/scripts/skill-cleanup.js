const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const axios = require('axios');

const bookName = process.argv[2];
const chapterName = process.argv[3] || ''; // Optional: specify chapter like '1', 'preface'

if (!bookName) {
  console.error("Vui lòng cung cấp tên sách! Ví dụ: node skills/skill-cleanup.js entrepreneurship 1");
  process.exit(1);
}

let baseDir = path.join(__dirname, '../../../data', bookName);
if (chapterName) {
  baseDir = path.join(baseDir, `chapter-${chapterName}`);
  RAW_DIR = path.join(baseDir, '01-raw');
  CLEAN_DIR = path.join(baseDir, '02-clean');
  ASSETS_DIR = path.join(baseDir, 'assets');
} else {
  RAW_DIR = path.join(baseDir, 'raw');
  CLEAN_DIR = path.join(baseDir, 'clean');
  ASSETS_DIR = path.join(baseDir, 'assets');
}

const BASE_URL = 'https://openstax.org';

if (!fs.existsSync(CLEAN_DIR)) fs.mkdirSync(CLEAN_DIR, { recursive: true });
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

async function downloadImage(url, filepath) {
  if (fs.existsSync(filepath)) return; 
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`⚠️ Lỗi tải ảnh ${url}: ${error.message}`);
  }
}

async function cleanupHTML() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error('Không tìm thấy thư mục raw!');
    return;
  }

  const files = fs.readdirSync(RAW_DIR).filter(file => file.endsWith('.html'));
  console.log(`Tìm thấy ${files.length} file trong raw. Bắt đầu làm sạch và tải ảnh...`);

  // Xoá trắng thư mục assets cũ để tránh rác (tuỳ chọn, nhưng an toàn hơn khi test lại quy tắc đặt tên)
  if (fs.existsSync(ASSETS_DIR)) {
    const oldAssets = fs.readdirSync(ASSETS_DIR);
    for (const asset of oldAssets) {
      fs.unlinkSync(path.join(ASSETS_DIR, asset));
    }
  }

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const rawFilePath = path.join(RAW_DIR, file);
    const cleanFilePath = path.join(CLEAN_DIR, file);

    const rawHTML = fs.readFileSync(rawFilePath, 'utf8');
    const $ = cheerio.load(rawHTML);

    let mainContent = $('[data-type="page"]').html();
    if (!mainContent) {
      mainContent = $('main').html() || $('body').html();
    }

    if (mainContent) {
      const $clean = cheerio.load(mainContent);
      $clean('script').remove();
      $clean('style').remove();
      $clean('link[rel="stylesheet"]').remove(); 
      
      $clean('head').append('<link rel="stylesheet" href="./style.css">');

      // Xác định tiền tố (prefix) từ tên file (ví dụ: '1-1', '1', 'preface')
      let filePrefix = file.replace('.html', '');
      const numMatch = filePrefix.match(/^(\d+(?:-\d+)?)/);
      if (numMatch) {
        filePrefix = numMatch[1];
      }

      const imgTags = $clean('img').toArray();
      let imgIndex = 1;

      for (const img of imgTags) {
        let src = $clean(img).attr('src');
        if (!src) continue;

        const fullUrl = src.startsWith('http') ? src : BASE_URL + src;
        
        // Xác định phần mở rộng (đuôi file)
        let ext = '.webp'; // Mặc định
        const originalSrc = $clean(img).attr('data-original-src') || '';
        const urlParts = fullUrl.split('/');
        let originalFileName = urlParts[urlParts.length - 1].split('?')[0];

        if (originalFileName.includes('.')) {
          ext = '.' + originalFileName.split('.').pop();
        } else {
          if (fullUrl.includes('f=webp')) ext = '.webp';
          else if (originalSrc.endsWith('.jpg') || originalSrc.endsWith('.jpeg')) ext = '.jpg';
          else if (originalSrc.endsWith('.png')) ext = '.png';
        }

        // Quy tắc đặt tên mới: img-[prefix]-[index].ext
        const newFileName = `img-${filePrefix}-${imgIndex}${ext}`;
        imgIndex++;

        const imgPath = path.join(ASSETS_DIR, newFileName);
        
        console.log(`  - Đang tải ảnh: ${newFileName}`);
        await downloadImage(fullUrl, imgPath);

        // Đổi đường dẫn trong HTML sang file mới
        $clean(img).attr('src', `../assets/${newFileName}`);
        $clean(img).removeAttr('data-original-src');
        $clean(img).removeAttr('srcset');
      }
      
      const finalHTML = $clean.html();
      fs.writeFileSync(cleanFilePath, finalHTML, 'utf8');
      console.log(`[${index + 1}/${files.length}] Đã làm sạch và tải ảnh: ${file}`);
    } else {
      console.warn(`[${index + 1}/${files.length}] ⚠️ Cảnh báo: Không thể trích xuất nội dung chính cho ${file}`);
    }
  }

  console.log('✅ Hoàn tất quá trình Cleanup & Tải ảnh với quy tắc đặt tên mới!');
}

cleanupHTML();

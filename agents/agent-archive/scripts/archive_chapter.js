const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

function findProjectRoot() {
    let d = __dirname;
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(d, 'package.json'))) {
            return d;
        }
        d = path.dirname(d);
    }
    return null;
}

function archiveChapter(chapterNum, book = 'entrepreneurship') {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
        console.error("Cannot find project root with 'package.json'.");
        return;
    }
    
    const bookDir = path.abspath ? path.abspath(path.join(projectRoot, '..', book)) : path.resolve(path.join(projectRoot, '..', book));
    const chapDir = path.join(bookDir, `chapter-${chapterNum}`);
    const transDir = path.join(chapDir, '05-translated');
    
    const archiveDir = path.join(chapDir, '07-archive');
    const bilingualDir = path.join(archiveDir, 'bilingual');
    const vnOnlyDir = path.join(archiveDir, 'vn-only');
    
    if (!fs.existsSync(transDir)) {
        console.error(`No translated folder found at ${transDir}`);
        return;
    }
    
    fs.mkdirSync(bilingualDir, { recursive: true });
    fs.mkdirSync(vnOnlyDir, { recursive: true });
    
    const files = fs.readdirSync(transDir).filter(f => f.endsWith('.html'));
    if (files.length === 0) {
        console.log(`No translated files found in ${transDir}`);
        return;
    }
    
    for (const filename of files) {
        const filePath = path.join(transDir, filename);
        
        // 1. Copy to bilingual
        fs.copyFileSync(filePath, path.join(bilingualDir, filename));
        
        // 2. Process vn-only
        const content = fs.readFileSync(filePath, 'utf-8');
        const $ = cheerio.load(content);
        
        // Remove eng hidden elements
        $('.eng.hidden').remove();
        
        // Clean up vn visible class
        $('.vn.visible').each((_, elem) => {
            $(elem).removeClass('vn visible');
            if ($(elem).attr('class') === '') {
                $(elem).removeAttr('class');
            }
        });
        
        // Remove style block injected for debug
        $('style').each((_, elem) => {
            const text = $(elem).text();
            if (text.includes('.eng.hidden') || text.includes('.vn.visible')) {
                $(elem).remove();
            }
        });
        
        // Save vn-only
        fs.writeFileSync(path.join(vnOnlyDir, filename), $.html(), 'utf-8');
    }
    
    console.log(`Archived chapter ${chapterNum} successfully to 07-archive/bilingual and 07-archive/vn-only.`);
}

const chapter = process.argv[2];
const book = process.argv[3] || 'entrepreneurship';

if (chapter) {
    archiveChapter(chapter, book);
} else {
    console.log('Usage: node archive_chapter.js <chapter-num> [book-name]');
}

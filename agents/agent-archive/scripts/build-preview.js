const fs = require('fs');
const path = require('path');

function sortHtmlFiles(fileName) {
  const match = fileName.match(/^(\d+)(?:-(\d+))?-/);
  if (match) {
    const chapNum = parseInt(match[1], 10);
    const secNum = match[2] ? parseInt(match[2], 10) : -1;

    if (secNum === -1) {
      if (fileName.includes('introduction')) return [chapNum, 0];
      if (fileName.includes('key-terms')) return [chapNum, 100];
      if (fileName.includes('summary')) return [chapNum, 101];
      if (fileName.includes('review-questions')) return [chapNum, 102];
      if (fileName.includes('discussion-questions')) return [chapNum, 103];
      if (fileName.includes('case-questions')) return [chapNum, 104];
      if (fileName.includes('suggested-resources')) return [chapNum, 105];
      return [chapNum, 99];
    } else {
      return [chapNum, secNum];
    }
  }
  return [999, 999];
}

function compareHtmlFiles(a, b) {
  const sortA = sortHtmlFiles(a);
  const sortB = sortHtmlFiles(b);
  if (sortA[0] !== sortB[0]) return sortA[0] - sortB[0];
  return sortA[1] - sortB[1];
}

// Recursive helper to copy directories
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function buildPreview(bookDir) {
  if (!bookDir) {
    console.error("Please specify a book directory.");
    process.exit(1);
  }
  
  const absBookDir = path.resolve(bookDir);
  const outputDir = path.join(absBookDir, ".html");
  console.log(`Building preview to ${outputDir}...`);

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Copy css
  const cssSrc = path.join(absBookDir, "css");
  const cssDst = path.join(outputDir, "css");
  if (fs.existsSync(cssSrc)) {
    copyDirSync(cssSrc, cssDst);
    console.log("Copied css directory.");
  }

  // 2. Copy book-reader
  const brSrc = path.join(__dirname, "..", "book-reader");
  const brDst = path.join(outputDir, "book-reader");
  if (fs.existsSync(brSrc)) {
    copyDirSync(brSrc, brDst);
    console.log("Copied book-reader.");
  } else {
    console.warn(`Warning: book-reader source not found at ${brSrc}`);
  }

  const allPages = [];

  // Process book-level front matter
  const bookLevelDir = "_book-level";
  const bookLevelSrc = path.join(absBookDir, bookLevelDir);
  const bookLevelDst = path.join(outputDir, bookLevelDir);

  if (fs.existsSync(bookLevelSrc)) {
    fs.mkdirSync(bookLevelDst, { recursive: true });
    const transSrc = path.join(bookLevelSrc, "05-translated");
    if (fs.existsSync(transSrc)) {
      for (const fileName of ['preface.html', 'index.html']) {
        const srcFile = path.join(transSrc, fileName);
        const dstFile = path.join(bookLevelDst, fileName);
        if (fs.existsSync(srcFile)) {
          let content = fs.readFileSync(srcFile, 'utf8');
          allPages.push(`/${bookLevelDir}/${fileName}`);

          const pagesJs = '<script src="../book-reader/book-pages.js"></script>\n';
          const cssLink = '<link rel="stylesheet" href="../book-reader/book-reader.css">\n';
          const jsLink = '<script src="../book-reader/book-reader.js"></script>\n';

          content = content.replace(/\.\.\/\.\.\/\.\.\/css\/style\.css/g, '../css/style.css')
                           .replace(/\.\.\/\.\.\/css\/style\.css/g, '../css/style.css')
                           .replace(/\.\.\/css\/style\.css/g, '../css/style.css');
          content = content.replace(/\.\.\/assets\//g, 'assets/');

          if (!content.toLowerCase().includes('charset')) {
            content = content.replace('<head>', '<head>\n    <meta charset="utf-8">');
          }

          // Clean up old scripts
          content = content.replace(/<script src="\.\.\/\.\.\/book-reader\/book-pages\.js"><\/script>\n?/g, '')
                           .replace(/<link rel="stylesheet" href="\.\.\/\.\.\/book-reader\/book-reader\.css">\n?/g, '')
                           .replace(/<script src="\.\.\/\.\.\/book-reader\/book-reader\.js"><\/script>\n?/g, '')
                           .replace(/<link href="\.\.\/\.\.\/book-reader\/book-reader\.css" rel="stylesheet"\/>\n?/g, '')
                           .replace(/<script src="\.\.\/book-reader\/book-pages\.js"><\/script>\n?/g, '')
                           .replace(/<link rel="stylesheet" href="\.\.\/book-reader\/book-reader\.css">\n?/g, '')
                           .replace(/<script src="\.\.\/book-reader\/book-reader\.js"><\/script>\n?/g, '')
                           .replace(/<link href="\.\.\/book-reader\/book-reader\.css" rel="stylesheet"\/>\n?/g, '');

          if (content.includes('</head>') && !content.includes('book-pages.js')) {
            content = content.replace('</head>', `${pagesJs}${cssLink}${jsLink}</head>`);
          }

          fs.writeFileSync(dstFile, content, 'utf8');
        }
      }
    }

    const assetsSrc = path.join(bookLevelSrc, "assets");
    const assetsDst = path.join(bookLevelDst, "assets");
    if (fs.existsSync(assetsSrc)) {
      copyDirSync(assetsSrc, assetsDst);
    }
  }

  // Find and sort chapters
  const entries = fs.readdirSync(absBookDir);
  const chapterDirs = entries.filter(e => {
    return e.startsWith("chapter-") && fs.statSync(path.join(absBookDir, e)).isDirectory();
  });
  chapterDirs.sort((a, b) => {
    const numA = parseInt(a.split('-')[1], 10);
    const numB = parseInt(b.split('-')[1], 10);
    return (isNaN(numA) ? 999 : numA) - (isNaN(numB) ? 999 : numB);
  });

  for (const chap of chapterDirs) {
    const chapSrc = path.join(absBookDir, chap);
    const chapDst = path.join(outputDir, chap);
    fs.mkdirSync(chapDst, { recursive: true });

    const transSrc = path.join(chapSrc, "05-translated");
    if (fs.existsSync(transSrc)) {
      const htmlFiles = fs.readdirSync(transSrc).filter(f => f.endsWith('.html'));
      htmlFiles.sort(compareHtmlFiles);

      for (const fileName of htmlFiles) {
        const srcFile = path.join(transSrc, fileName);
        const dstFile = path.join(chapDst, fileName);
        let content = fs.readFileSync(srcFile, 'utf8');

        allPages.push(`/${chap}/${fileName}`);

        const pagesJs = '<script src="../book-reader/book-pages.js"></script>\n';
        const cssLink = '<link rel="stylesheet" href="../book-reader/book-reader.css">\n';
        const jsLink = '<script src="../book-reader/book-reader.js"></script>\n';

        content = content.replace(/\.\.\/\.\.\/\.\.\/css\/style\.css/g, '../css/style.css')
                         .replace(/\.\.\/\.\.\/css\/style\.css/g, '../css/style.css')
                         .replace(/\.\.\/css\/style\.css/g, '../css/style.css');
        content = content.replace(/\.\.\/assets\//g, 'assets/');

        if (!content.toLowerCase().includes('charset')) {
          content = content.replace('<head>', '<head>\n    <meta charset="utf-8">');
        }

        // Clean up old scripts
        content = content.replace(/<script src="\.\.\/\.\.\/book-reader\/book-pages\.js"><\/script>\n?/g, '')
                         .replace(/<link rel="stylesheet" href="\.\.\/\.\.\/book-reader\/book-reader\.css">\n?/g, '')
                         .replace(/<script src="\.\.\/\.\.\/book-reader\/book-reader\.js"><\/script>\n?/g, '')
                         .replace(/<link href="\.\.\/\.\.\/book-reader\/book-reader\.css" rel="stylesheet"\/>\n?/g, '')
                         .replace(/<script src="\.\.\/book-reader\/book-pages\.js"><\/script>\n?/g, '')
                         .replace(/<link rel="stylesheet" href="\.\.\/book-reader\/book-reader\.css">\n?/g, '')
                         .replace(/<script src="\.\.\/book-reader\/book-reader\.js"><\/script>\n?/g, '')
                         .replace(/<link href="\.\.\/book-reader\/book-reader\.css" rel="stylesheet"\/>\n?/g, '');

        if (content.includes('</head>') && !content.includes('book-pages.js')) {
          content = content.replace('</head>', `${pagesJs}${cssLink}${jsLink}</head>`);
        }

        fs.writeFileSync(dstFile, content, 'utf8');
      }
      console.log(`Copied and injected into ${chap}/`);
    }

    const assetsSrc = path.join(chapSrc, "assets");
    const assetsDst = path.join(chapDst, "assets");
    if (fs.existsSync(assetsSrc)) {
      copyDirSync(assetsSrc, assetsDst);
    }
  }

  // Process book-level back matter
  const bookLevelTransSrc = path.join(bookLevelSrc, "05-translated");
  if (fs.existsSync(bookLevelSrc) && fs.existsSync(bookLevelTransSrc)) {
    const srcFile = path.join(bookLevelTransSrc, 'a-suggested-resources.html');
    const dstFile = path.join(bookLevelDst, 'a-suggested-resources.html');
    if (fs.existsSync(srcFile)) {
      let content = fs.readFileSync(srcFile, 'utf8');
      allPages.push(`/${bookLevelDir}/a-suggested-resources.html`);

      const pagesJs = '<script src="../book-reader/book-pages.js"></script>\n';
      const cssLink = '<link rel="stylesheet" href="../book-reader/book-reader.css">\n';
      const jsLink = '<script src="../book-reader/book-reader.js"></script>\n';

      content = content.replace(/\.\.\/\.\.\/\.\.\/css\/style\.css/g, '../css/style.css')
                       .replace(/\.\.\/\.\.\/css\/style\.css/g, '../css/style.css')
                       .replace(/\.\.\/css\/style\.css/g, '../css/style.css');
      content = content.replace(/\.\.\/assets\//g, 'assets/');

      if (!content.toLowerCase().includes('charset')) {
        content = content.replace('<head>', '<head>\n    <meta charset="utf-8">');
      }

      // Clean up old scripts
      content = content.replace(/<script src="\.\.\/\.\.\/book-reader\/book-pages\.js"><\/script>\n?/g, '')
                       .replace(/<link rel="stylesheet" href="\.\.\/\.\.\/book-reader\/book-reader\.css">\n?/g, '')
                       .replace(/<script src="\.\.\/\.\.\/book-reader\/book-reader\.js"><\/script>\n?/g, '')
                       .replace(/<link href="\.\.\/\.\.\/book-reader\/book-reader\.css" rel="stylesheet"\/>\n?/g, '')
                       .replace(/<script src="\.\.\/book-reader\/book-pages\.js"><\/script>\n?/g, '')
                       .replace(/<link rel="stylesheet" href="\.\.\/book-reader\/book-reader\.css">\n?/g, '')
                       .replace(/<script src="\.\.\/book-reader\/book-reader\.js"><\/script>\n?/g, '')
                       .replace(/<link href="\.\.\/book-reader\/book-reader\.css" rel="stylesheet"\/>\n?/g, '');

      if (content.includes('</head>') && !content.includes('book-pages.js')) {
        content = content.replace('</head>', `${pagesJs}${cssLink}${jsLink}</head>`);
      }

      fs.writeFileSync(dstFile, content, 'utf8');
    }
  }

  // 3. Copy global glossary
  const glossarySrc = path.join(absBookDir, "glossary.csv");
  const glossaryDst = path.join(outputDir, "glossary.csv");
  if (fs.existsSync(glossarySrc)) {
    fs.copyFileSync(glossarySrc, glossaryDst);
    console.log("Copied global glossary.csv");
  }

  // Create book-pages.js with section titles mapping
  const sectionTitles = {};
  for (const pagePath of allPages) {
    const fullPagePath = path.join(outputDir, pagePath);
    if (fs.existsSync(fullPagePath)) {
      const htmlContent = fs.readFileSync(fullPagePath, 'utf8');
      const match = htmlContent.match(/<h2[^>]*class="[^"]*vn visible[^"]*"[^>]*>(.*?)<\/h2>/i) ||
                    htmlContent.match(/<h2[^>]*>(.*?)<\/h2>/i);
      if (match) {
        let cleanTitle = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        cleanTitle = cleanTitle.replace(/^(\d+\.\d+\.?\s*)\1/, '$1');
        sectionTitles[pagePath] = cleanTitle;
      }
    }
  }

  const pagesJsPath = path.join(brDst, "book-pages.js");
  fs.writeFileSync(pagesJsPath, `window.BOOK_PAGES = ${JSON.stringify(allPages)};\nwindow.SECTION_TITLES = ${JSON.stringify(sectionTitles)};`, "utf-8");
  console.log(`Generated ${allPages.length} pages and ${Object.keys(sectionTitles).length} section titles into book-pages.js`);

  // 4. Create index.html redirect at root
  const indexHtml = path.join(outputDir, "index.html");
  const firstPage = allPages[0] || "/chapter-1/1-introduction.html";
  fs.writeFileSync(indexHtml, `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="refresh" content="0; url=.${firstPage}" />
    <title>OpenStax Preview</title>
</head>
<body>
    <p>Redirecting to <a href=".${firstPage}">Start Reading</a></p>
</body>
</html>`, "utf-8");

  console.log(`\nBuild completed successfully! You can view the preview at: ${outputDir}`);
}

const args = process.argv.slice(2);
const bookDirArg = args[0] || "../entrepreneurship";
buildPreview(bookDirArg);

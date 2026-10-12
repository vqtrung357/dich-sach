const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Simple CSV parser
function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0) return {};
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const keyIdx = headers.indexOf('key');
    const transIdx = headers.indexOf('translation');
    const descViIdx = headers.indexOf('desc_vi');
    
    const glossary = {};
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Simple comma split that respects quotes
        const row = [];
        let inQuotes = false;
        let current = '';
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        row.push(current.trim().replace(/^"|"$/g, ''));
        
        const key = row[keyIdx]?.trim().toLowerCase();
        const translation = row[transIdx]?.trim();
        const descVi = row[descViIdx]?.trim();
        
        if (key) {
            glossary[key] = { translation, descVi };
        }
    }
    return glossary;
}

function translateFile(inPath, outPath, glossaryPath) {
    const csvText = fs.readFileSync(glossaryPath, 'utf-8');
    const glossary = parseCSV(csvText);
    console.log(`Loaded ${Object.keys(glossary).length} glossary entries.`);
    
    const htmlText = fs.readFileSync(inPath, 'utf-8');
    const $ = cheerio.load(htmlText);
    
    // Translate title
    $('h2.vn.visible span.os-text').text('Các Thuật ngữ Chính');
    
    let missingTerms = [];
    let missingDefinitions = [];
    
    const keyMappings = {
        'distribution strategy': 'place (distribution) strategy',
        'odd-even (psychological) pricing': 'odd-even pricing',
        'test marketing': 'test-marketing'
    };

    $('.os-glossary-list-item').each((_, item) => {
        const dtEng = $(item).find('dt.eng.hidden');
        const dtVn = $(item).find('dt.vn.visible');
        const ddEng = $(item).find('dd.eng.hidden');
        const ddVn = $(item).find('dd.vn.visible');
        
        if (dtEng.length && dtVn.length) {
            let termEn = dtEng.text().trim().toLowerCase().replace(/\s+/g, ' ');
            
            // Map if has custom mapping
            if (keyMappings[termEn]) {
                termEn = keyMappings[termEn];
            }
            
            if (glossary[termEn]) {
                const entry = glossary[termEn];
                dtVn.text(entry.translation);
                
                if (ddEng.length && ddVn.length) {
                    if (entry.descVi) {
                        ddVn.text(entry.descVi);
                    } else {
                        missingDefinitions.push(termEn);
                    }
                }
            } else {
                missingTerms.push(termEn);
            }
        }
    });
    
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, $.html(), 'utf-8');
    console.log(`Translated key terms saved to ${outPath}`);
    if (missingTerms.length) {
        console.log(`Warning: Missing terms in glossary:`, missingTerms);
    }
    if (missingDefinitions.length) {
        console.log(`Warning: Missing desc_vi for terms:`, missingDefinitions);
    }
}

const inFile = process.argv[2];
const outFile = process.argv[3];
const glossaryFile = process.argv[4];

if (inFile && outFile && glossaryFile) {
    translateFile(inFile, outFile, glossaryFile);
} else {
    console.log('Usage: node translate_key_terms.js <inFile> <outFile> <glossaryFile>');
}

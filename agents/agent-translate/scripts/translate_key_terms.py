import sys
import os
import csv
import bs4
from bs4 import BeautifulSoup

def load_glossary(csv_path):
    glossary = {}
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row.get('key', '').strip().lower()
            translation = row.get('translation', '').strip()
            desc_vi = row.get('desc_vi', '').strip()
            if key:
                glossary[key] = {
                    'translation': translation,
                    'desc_vi': desc_vi
                }
    return glossary

def translate_file(in_path, out_path, glossary):
    with open(in_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    # Translate title
    title_eng = soup.find('h2', class_='eng hidden')
    title_vn = soup.find('h2', class_='vn visible')
    if title_eng and title_vn:
        span_vn = title_vn.find('span', class_='os-text')
        if span_vn:
            span_vn.string = "Các Thuật ngữ Chính"
        else:
            title_vn.string = "Các Thuật ngữ Chính"

    # Translate terms
    missing_terms = []
    missing_definitions = []
    
    items = soup.find_all('div', class_='os-glossary-list-item')
    for item in items:
        dt_eng = item.find('dt', class_='eng hidden')
        dt_vn = item.find('dt', class_='vn visible')
        dd_eng = item.find('dd', class_='eng hidden')
        dd_vn = item.find('dd', class_='vn visible')
        
        if dt_eng and dt_vn:
            term_en = dt_eng.get_text().strip().lower()
            # Clean up potential multi-spaces or newlines
            term_en_clean = " ".join(term_en.split())
            
            if term_en_clean in glossary:
                entry = glossary[term_en_clean]
                dt_vn.string = entry['translation']
                
                if dd_eng and dd_vn:
                    if entry['desc_vi']:
                        dd_vn.string = entry['desc_vi']
                    else:
                        missing_definitions.append(term_en_clean)
            else:
                missing_terms.append(term_en_clean)
                
    # Save output
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(str(soup))
        
    print(f"Translated key terms saved to {out_path}")
    if missing_terms:
        print(f"Warning: Missing terms in glossary: {missing_terms}")
    if missing_definitions:
        print(f"Warning: Missing desc_vi for terms: {missing_definitions}")

if __name__ == '__main__':
    in_file = sys.argv[1]
    out_file = sys.argv[2]
    glossary_file = sys.argv[3]
    
    glossary = load_glossary(glossary_file)
    print(f"Loaded {len(glossary)} glossary entries.")
    translate_file(in_file, out_file, glossary)

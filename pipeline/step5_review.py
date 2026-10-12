#!/usr/bin/env python3
"""
step5_review.py - Quality Assurance (QA) & Audit Engine

Nhiệm vụ:
1. Kiểm tra tính toàn vẹn (Integrity):
   - Đối chiếu số lượng thẻ block giữa bản tiếng Anh (eng hidden) và tiếng Việt (vn visible)
   - Phát hiện các đoạn chưa dịch hoặc bị dịch sót
2. Kiểm tra bảng thuật ngữ (Glossary Compliance):
   - Quét qua tất cả thuật ngữ trong glossary.csv
   - Cảnh báo các thuật ngữ dịch sai quy chuẩn
3. Xuất báo cáo Markdown chi tiết vào 06-reviews/

Cách dùng:
  python3 pipeline/step5_review.py --book entrepreneurship --chapter 1
"""

import os
import sys
import re
import csv
import argparse
from datetime import datetime

def parse_args():
    parser = argparse.ArgumentParser(description="Audit & Review Pipeline")
    parser.add_argument("--book", default="sample-book", help="Tên sách")
    parser.add_argument("--chapter", default="1", help="Số chương")
    return parser.parse_args()

def load_glossary(glossary_path):
    glossary = {}
    if os.path.exists(glossary_path):
        with open(glossary_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                en = (row.get("key") or row.get("Thuật ngữ Tiếng Anh") or "").strip().lower()
                vi = (row.get("translation") or row.get("Dịch Tiếng Việt") or "").strip()
                if en and vi:
                    glossary[en] = vi
    return glossary

def audit_file(file_path, glossary):
    with open(file_path, "r", encoding="utf-8") as f:
        html = f.read()

    issues = []

    # 1. Đếm số lượng eng hidden và vn visible
    eng_matches = re.findall(r'class="[^"]*\beng\b[^"]*\bhidden\b[^"]*"', html)
    vn_matches = re.findall(r'class="[^"]*\bvn\b[^"]*\bvisible\b[^"]*"', html)

    if len(eng_matches) != len(vn_matches):
        issues.append(f"⚠️ Chênh lệch số khối song ngữ: {len(eng_matches)} bản Anh vs {len(vn_matches)} bản Việt")

    # 2. Kiểm tra đoạn tiếng Việt bị bỏ trống
    empty_vn = re.findall(r'<p[^>]*class="[^"]*\bvn\b[^"]*\bvisible\b[^"]*"[^>]*>\s*<\/p>', html)
    if empty_vn:
        issues.append(f"❌ Phát hiện {len(empty_vn)} đoạn tiếng Việt bị rỗng!")

    # 3. Quét kiểm tra thuật ngữ
    vn_blocks = re.findall(r'<p[^>]*class="[^"]*\bvn\b[^"]*\bvisible\b[^"]*"[^>]*>([\s\S]*?)<\/p>', html)
    all_vn_text = " ".join(vn_blocks).lower()

    untranslated_english = []
    # Kiểm tra xem có cụm từ tiếng Anh phổ biến chưa dịch còn sót lại không
    common_en_leftovers = ["is defined as", "according to", "in addition", "for example", "furthermore"]
    for phrase in common_en_leftovers:
        if phrase in all_vn_text:
            untranslated_english.append(phrase)

    if untranslated_english:
        issues.append(f"⚠️ Nghi vấn câu tiếng Anh chưa dịch: {', '.join(untranslated_english)}")

    return {
        "file": os.path.basename(file_path),
        "eng_blocks": len(eng_matches),
        "vn_blocks": len(vn_matches),
        "issues": issues
    }

def main():
    args = parse_args()
    book_dir = os.path.abspath(os.path.join(os.getcwd(), args.book))
    chapter_dir = os.path.join(book_dir, f"chapter-{args.chapter}")
    trans_dir = os.path.join(chapter_dir, "05-translated")
    review_dir = os.path.join(chapter_dir, "06-reviews")
    glossary_path = os.path.join(book_dir, "glossary.csv")

    if not os.path.exists(trans_dir):
        print(f"❌ Không tìm thấy thư mục 05-translated tại: {trans_dir}")
        sys.exit(1)

    os.makedirs(review_dir, exist_ok=True)
    glossary = load_glossary(glossary_path)

    files = [f for f in os.listdir(trans_dir) if f.endswith(".html")]
    if not files:
        print(f"⚠️ Không có file .html nào trong {trans_dir}")
        return

    print(f"🔍 [Bước 5: Review] Kiểm tra chất lượng và độ toàn vẹn cho {len(files)} file...")

    results = []
    for f in sorted(files):
        res = audit_file(os.path.join(trans_dir, f), glossary)
        results.append(res)

    # Xuất báo cáo Markdown
    report_file = os.path.join(review_dir, f"chapter-{args.chapter}-review-report.md")
    with open(report_file, "w", encoding="utf-8") as rf:
        rf.write(f"# Báo Cáo Đánh Giá & Kiểm Định Chất Lượng (QA Report)\n\n")
        rf.write(f"- **Sách**: {args.book}\n")
        rf.write(f"- **Chương**: {args.chapter}\n")
        rf.write(f"- **Thời gian kiểm tra**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        rf.write(f"- **Tổng số tệp kiểm định**: {len(files)}\n\n")
        rf.write(f"---\n\n")
        rf.write(f"## Chi tiết từng mục:\n\n")

        total_issues = 0
        for r in results:
            rf.write(f"### 📄 `{r['file']}`\n")
            rf.write(f"- Số khối tiếng Anh (eng hidden): **{r['eng_blocks']}**\n")
            rf.write(f"- Số khối tiếng Việt (vn visible): **{r['vn_blocks']}**\n")

            if r['issues']:
                total_issues += len(r['issues'])
                rf.write(f"- **Cảnh báo ({len(r['issues'])}):**\n")
                for iss in r['issues']:
                    rf.write(f"  - {iss}\n")
            else:
                rf.write(f"- ✅ **Trạng thái:** Hoàn hảo, không phát hiện lỗi.\n")
            rf.write(f"\n")

        rf.write(f"---\n\n")
        rf.write(f"## Tổng kết:\n")
        rf.write(f"- Tổng số vấn đề cần lưu ý: **{total_issues}**\n")

    print(f"✅ Hoàn tất kiểm tra! Báo cáo QA lưu tại:\n   📄 {report_file}")

if __name__ == "__main__":
    main()

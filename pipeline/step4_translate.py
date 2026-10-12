#!/usr/bin/env python3
"""
step4_translate.py - AI Translation Engine cho OpenStax Books

Quy trình:
1. Đọc file HTML từ 04-prep/
2. Nạp bảng thuật ngữ glossary.csv (Single Source of Truth)
3. Gửi các đoạn text thuộc class 'vn visible' tới LLM (OpenAI, Gemini hoặc Claude)
4. Bảo tồn 100% thẻ HTML gốc, ID, class, cấu trúc song ngữ
5. Hậu xử lý văn phong thuần Việt học thuật, loại bỏ chú thích Anh thừa
6. Ghi kết quả vào 05-translated/

Cách dùng:
  python3 pipeline/step4_translate.py --book entrepreneurship --chapter 1
  python3 pipeline/step4_translate.py --book entrepreneurship --chapter 1 --dry-run
"""

import os
import sys
import re
import csv
import json
import argparse
from urllib import request, error

# System Prompt học thuật chuẩn hóa
SYSTEM_PROMPT = """Bạn là một Chuyên gia Dịch thuật Sách Giáo trình Đại học hàng đầu (OpenStax).
Nhiệm vụ của bạn là dịch các đoạn văn bản từ tiếng Anh sang tiếng Việt với văn phong học thuật mượt mà, thuần Việt, chuẩn xác ngữ nghĩa.

QUY TẮC BẮT BUỘC:
1. VĂN PHONG THUẦN VIỆT & MƯỢT MÀ (Fluency-first):
   - Tái cấu trúc câu bị động hoặc rườm rà của tiếng Anh thành câu tiếng Việt mạch lạc, tự nhiên.
   - Tránh dịch word-for-word khô cứng.
2. BẢO TỒN THUẬT NGỮ (Glossary-first):
   - Bắt buộc tuân thủ danh sách thuật ngữ được cung cấp.
3. KHÔNG TỰ Ý CHÈN CHÚ THÍCH TIẾNG ANH NGOẶC ĐƠN:
   - Dịch thẳng sang tiếng Việt chuẩn, không viết kiểu "kinh tế tự do (gig economy)".
4. TÊN RIÊNG & THƯƠNG HIỆU:
   - Giữ nguyên tên riêng người nước ngoài và thương hiệu quốc tế (Apple, Toyota, Nike...).
5. BẢO TỒN CẤU TRÚC THẺ HTML:
   - Giữ nguyên tất cả các thẻ con bên trong như <span data-type="term">, <em>, <strong>, <a>, <sup>.
   - Chỉ dịch phần văn bản hiển thị.
"""

def parse_args():
    parser = argparse.ArgumentParser(description="AI Translation Engine cho OpenStax")
    parser.add_argument("--book", default="sample-book", help="Tên sách")
    parser.add_argument("--chapter", default="1", help="Số chương")
    parser.add_argument("--model", default=os.getenv("OPENAI_MODEL", "gpt-4o"), help="Model LLM")
    parser.add_argument("--api-key", default=os.getenv("OPENAI_API_KEY", ""), help="OpenAI API Key")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử nghiệm không gọi API (mock translation)")
    return parser.parse_args()

def load_glossary(glossary_path):
    glossary = {}
    if not os.path.exists(glossary_path):
        return glossary

    with open(glossary_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            en = (row.get("key") or row.get("Thuật ngữ Tiếng Anh") or "").strip().lower()
            vi = (row.get("translation") or row.get("Dịch Tiếng Việt") or "").strip()
            if en and vi:
                glossary[en] = vi
    return glossary

def clean_vn_text(text):
    """Lọc bỏ các chú thích mở ngoặc tiếng Anh thừa nếu LLM vô tình thêm vào"""
    redundancies = [
        (r'\s*\(\s*gig economy\s*\)', ''),
        (r'\s*\(\s*sharing economy\s*\)', ''),
        (r'\s*\(\s*startup\s*\)', ''),
        (r'\s*\(\s*venture\s*\)', ''),
        (r'\s*\(\s*mindset\s*\)', ''),
    ]
    for pattern, repl in redundancies:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    return text

def call_openai_chat(prompt, system_prompt, api_key, model="gpt-4o"):
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
    }
    req = request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    try:
        with request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        raise RuntimeError(f"OpenAI API Error ({e.code}): {err_msg}")

def translate_html_content(html_content, glossary, api_key, model, dry_run=False):
    """Dịch các thẻ mang class vn visible"""
    pattern = re.compile(r'(<(?:p|h[1-6]|li|caption|figcaption|th|td|dt|dd)[^>]*class="[^"]*\bvn\b[^"]*\bvisible\b[^"]*"[^>]*>)([\s\S]*?)(<\/(?:p|h[1-6]|li|caption|figcaption|th|td|dt|dd)>)', re.IGNORECASE)

    matches = list(pattern.finditer(html_content))
    if not matches:
        return html_content

    glossary_context = "\n".join([f"- {k} -> {v}" for k, v in list(glossary.items())[:50]])

    def replacer(match):
        open_tag = match.group(1)
        inner_content = match.group(2)
        close_tag = match.group(3)

        if not inner_content.strip():
            return match.group(0)

        # Nếu dry-run hoặc không có key, áp dụng glossary trực tiếp để demo
        if dry_run or not api_key:
            translated = inner_content
            for en, vi in glossary.items():
                translated = re.sub(rf'\b{re.escape(en)}\b', vi, translated, flags=re.IGNORECASE)
            return f"{open_tag}{translated}{close_tag}"

        prompt = f"""Dịch đoạn HTML sau sang tiếng Việt chuẩn OpenStax. Bảo tồn thẻ HTML bên trong nếu có:
Bảng thuật ngữ tham khảo:
{glossary_context}

Đoạn văn bản cần dịch:
{inner_content}

Chỉ trả về duy nhất nội dung sau khi dịch, không thêm giải thích hay markdown code block:"""

        try:
            trans = call_openai_chat(prompt, SYSTEM_PROMPT, api_key, model)
            trans = clean_vn_text(trans.strip())
            return f"{open_tag}{trans}{close_tag}"
        except Exception as e:
            print(f"⚠️ Lỗi dịch đoạn: {e}")
            return match.group(0)

    # Thay thế từng đoạn
    new_html = pattern.sub(replacer, html_content)
    return new_html

def main():
    args = parse_args()
    book_dir = os.path.abspath(os.path.join(os.getcwd(), args.book))
    chapter_dir = os.path.join(book_dir, f"chapter-{args.chapter}")
    prep_dir = os.path.join(chapter_dir, "04-prep")
    trans_dir = os.path.join(chapter_dir, "05-translated")
    glossary_path = os.path.join(book_dir, "glossary.csv")

    if not os.path.exists(prep_dir):
        print(f"❌ Không tìm thấy thư mục 04-prep tại: {prep_dir}")
        sys.exit(1)

    os.makedirs(trans_dir, exist_ok=True)
    glossary = load_glossary(glossary_path)
    print(f"📖 Nạp {len(glossary)} thuật ngữ từ glossary.csv")

    files = [f for f in os.listdir(prep_dir) if f.endswith(".html")]
    if not files:
        print(f"⚠️ Không có file .html nào trong {prep_dir}")
        return

    print(f"🤖 [Bước 4: Translate] Dịch {len(files)} file của chương {args.chapter} (Mode: {'DRY-RUN' if (args.dry_run or not args.api_key) else args.model})")

    for idx, f in enumerate(files):
        print(f"[{idx + 1}/{len(files)}] Đang dịch: {f}")
        in_path = os.path.join(prep_dir, f)
        out_path = os.path.join(trans_dir, f)

        with open(in_path, "r", encoding="utf-8") as rf:
            content = rf.read()

        translated = translate_html_content(content, glossary, args.api_key, args.model, args.dry_run)

        with open(out_path, "w", encoding="utf-8") as wf:
            wf.write(translated)

    print(f"✅ Dịch hoàn tất! Kết quả lưu tại: {trans_dir}")

if __name__ == "__main__":
    main()

import os
import sys
import re

def parse_markdown_table(file_path):
    """Parse review markdown table using dynamic header mapping."""
    rows = []
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    in_table = False
    headers = {}   # column name -> index

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Detect header row: starts with | and contains column names
        if not in_table and stripped.startswith('|') and not stripped.startswith('|---'):
            cols = [c.strip().lower() for c in stripped.split('|')][1:-1]
            # Map header columns by key terms
            for idx, col in enumerate(cols):
                if 'id' == col:
                    headers['id'] = idx
                elif 'gốc' in col or 'original' in col or 'thẻ' in col:
                    headers['tag'] = idx
                elif 'hiện tại' in col or 'current' in col or 'bản dịch' in col:
                    headers['current'] = idx
                elif 'phản biện' in col or 'critique' in col:
                    headers['critique'] = idx
                elif 'đề xuất' in col or 'suggestion' in col:
                    headers['suggestion'] = idx
                elif 'phản hồi' in col or 'response' in col:
                    headers['response'] = idx
                elif 'trạng thái' in col or 'status' in col:
                    headers['status'] = idx
            if headers:
                in_table = True
            continue

        if in_table and stripped.startswith('|---'):
            continue

        if in_table and stripped.startswith('|'):
            cols = [c.strip() for c in line.split('|')][1:-1]

            def gcol(key, default=''):
                idx = headers.get(key)
                if idx is not None and idx < len(cols):
                    return cols[idx].strip()
                return default

            row_id = gcol('id', f'L-{i}')
            tag_ref = gcol('tag', '')
            current = gcol('current', '')
            suggestion_raw = gcol('suggestion', '')
            status = gcol('status', '')

            # Clean suggestion: strip backticks
            if '`' in suggestion_raw:
                m = re.search(r'`([^`]+)`', suggestion_raw)
                suggestion = m.group(1) if m else suggestion_raw.replace('Sửa thành:', '').strip()
            else:
                suggestion = suggestion_raw.replace('Sửa thành:', '').strip()

            rows.append({
                'line_num': i,
                'id': row_id,
                'tag_ref': tag_ref.strip('`'),   # e.g. "p#fs-idm123" or "span.class"
                'current': current.strip('`'),
                'suggestion': suggestion,
                'status': status
            })

        elif in_table and not stripped:
            in_table = False

    return rows, lines


def apply_fix_to_html(html_content, tag_ref, current_text, suggestion_text):
    """
    Try to replace current_text with suggestion_text in the Vietnamese (.vn.visible) version
    of the given element referenced by tag_ref (e.g. "p#elem-id", "li", "span#id").
    Falls back to simple text replacement.
    """
    if not current_text or not suggestion_text or current_text == suggestion_text:
        return html_content, False

    replaced = False

    # Parse tag_ref: extract tag name and optional #id or .class
    tag_name = 'span'
    elem_id = None

    if tag_ref:
        # Handle p#id, li, h2, span#id etc.
        m = re.match(r'^([a-zA-Z]+)(?:#([\w-]+))?', tag_ref)
        if m:
            tag_name = m.group(1)
            elem_id = m.group(2)

    if elem_id:
        # Try to find the element by ID — look for both -vn variant and base id
        for eid in [f'{elem_id}-vn', elem_id]:
            pattern = re.compile(
                rf'(<{tag_name}[^>]*\bid=["\']?{re.escape(eid)}["\']?[^>]*>)(.*?)(</{tag_name}>)',
                re.DOTALL | re.IGNORECASE
            )
            def replacer(m):
                inner = m.group(2)
                if current_text in inner:
                    return m.group(1) + inner.replace(current_text, suggestion_text, 1) + m.group(3)
                return m.group(0)
            new_html = pattern.sub(replacer, html_content)
            if new_html != html_content:
                html_content = new_html
                replaced = True
                break

    if not replaced and current_text in html_content:
        # Fallback: try to only replace within vn visible elements
        vn_pattern = re.compile(
            r'(class=["\'][^"\']*\bvn\b[^"\']*visible[^"\']*["\'][^>]*>)(.*?)(</)',
            re.DOTALL | re.IGNORECASE
        )
        def vn_replacer(m):
            inner = m.group(2)
            if current_text in inner:
                return m.group(1) + inner.replace(current_text, suggestion_text, 1) + m.group(3)
            return m.group(0)
        new_html = vn_pattern.sub(vn_replacer, html_content)
        if new_html != html_content:
            html_content = new_html
            replaced = True

    if not replaced and current_text in html_content:
        # Last resort: global replace
        html_content = html_content.replace(current_text, suggestion_text, 1)
        replaced = True

    return html_content, replaced


def apply_fixes(review_path, html_path):
    if not os.path.exists(review_path):
        print(f"❌ Không tìm thấy file review: {review_path}")
        return
    if not os.path.exists(html_path):
        print(f"❌ Không tìm thấy file HTML: {html_path}")
        return

    rows, md_lines = parse_markdown_table(review_path)

    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()

    changes_made = 0
    for row in rows:
        status = row['status'].strip().lower()
        if status in ['từ chối', 'rejected', 'chấp nhận giải trình']:
            continue

        current_text = row['current']
        suggestion_text = row['suggestion']
        tag_ref = row.get('tag_ref', '')

        # Automatic Glossary Propagation if issue is a Glossary term (ID G-* or term match)
        orig_term = row.get('tag_ref', '') or row.get('current', '')
        if row['id'].startswith('G-') and suggestion_text:
            try:
                # Find book dir from html_path
                # html_path looks like .../<book>/chapter-N/05-translated/file.html
                parts_path = html_path.split(os.sep)
                if '05-translated' in parts_path:
                    idx_trans = parts_path.index('05-translated')
                    book_dir = os.sep.join(parts_path[:idx_trans-2])
                    csv_path = os.path.join(book_dir, 'glossary.csv')
                    if os.path.exists(csv_path):
                        import csv
                        # Read existing rows
                        rows_csv = []
                        fieldnames = ['STT', 'Thuật ngữ Tiếng Anh', 'Dịch Tiếng Việt', 'Giải thích', 'Cột 1']
                        with open(csv_path, 'r', encoding='utf-8-sig') as fcsv:
                            reader = csv.DictReader(fcsv)
                            if reader.fieldnames:
                                fieldnames = reader.fieldnames
                            rows_csv = list(reader)
                        
                        term_key = row.get('tag_ref') or ''
                        # Match by Thuật ngữ Tiếng Anh or key
                        updated_csv = False
                        for rcsv in rows_csv:
                            en_val = (rcsv.get('Thuật ngữ Tiếng Anh') or rcsv.get('key') or '').strip().lower()
                            if en_val and (en_val == term_key.lower() or en_val in current_text.lower()):
                                rcsv['Dịch Tiếng Việt'] = suggestion_text
                                updated_csv = True
                                break
                        
                        if updated_csv:
                            with open(csv_path, 'w', encoding='utf-8-sig', newline='') as fcsv:
                                writer = csv.DictWriter(fcsv, fieldnames=fieldnames)
                                writer.writeheader()
                                writer.writerows(rows_csv)
                            print(f"📖 Đã tự động cập nhật từ điển glossary.csv với thuật ngữ: {suggestion_text}")
            except Exception as e_gl:
                print(f"⚠️ Không thể cập nhật glossary.csv: {e_gl}")

        if not current_text or not suggestion_text:
            print(f"⚠️  Bỏ qua {row['id']}: thiếu bản dịch hiện tại hoặc đề xuất.")
            continue

        html_content, replaced = apply_fix_to_html(html_content, tag_ref, current_text, suggestion_text)

        if replaced:
            # Update markdown line: set Response and Status
            line_idx = row['line_num']
            old_line = md_lines[line_idx]
            parts = old_line.split('|')
            # Find response and status columns
            if len(parts) >= 4:
                # Locate status column (last non-empty)
                # Typically format: | id | tag | current | critique | suggestion | response | status |
                # parts[0] = '', parts[-1] = '\n', so real cols are parts[1:-1]
                real_cols = parts[1:-1]
                # The last real col is status, second to last is response
                if len(real_cols) >= 2:
                    real_cols[-1] = ' Đã sửa '
                    real_cols[-2] = ' Đồng ý, đã sửa theo đề xuất. '
                    md_lines[line_idx] = '|' + '|'.join(real_cols) + '|\n'
                    changes_made += 1
        else:
            print(f"⚠️  Không khớp text cho {row['id']}: '{current_text[:60]}...' trong HTML.")

    if changes_made > 0:
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        with open(review_path, 'w', encoding='utf-8') as f:
            f.writelines(md_lines)
        print(f"✅ Đã áp dụng {changes_made} bản vá vào {os.path.basename(html_path)}")
        print(f"✅ Đã cập nhật trạng thái trong {os.path.basename(review_path)}")
    else:
        print("ℹ️  Không có lỗi mới nào cần sửa hoặc không thể khớp text.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Sử dụng: python3 apply-review-fixes.py <đường-dẫn-file-review.md> <đường-dẫn-file-html>")
    else:
        apply_fixes(sys.argv[1], sys.argv[2])

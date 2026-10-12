# 📚 Dịch Sách OpenStax — Hệ Thống Quy Trình Dịch Sách Giáo Trình Đại Học Bằng AI & Agent Pipeline

Hệ thống mã nguồn mở đóng gói toàn bộ quy trình dịch thuật, hiệu đính học thuật và xuất bản sách giáo trình chất lượng cao từ nguồn học liệu mở **[OpenStax](https://openstax.org)** sang tiếng Việt.

---

## 🎯 1. Mục Tiêu Dự Án
Dự án được xây dựng nhằm mang các bộ giáo trình chuẩn đại học thế giới về cho sinh viên và giảng viên Việt Nam với các tiêu chí:
- **Chuẩn học thuật & văn phong thuần Việt:** Không dịch máy thô ráp (word-for-word), câu văn gãy gọn, tự nhiên, thoát ý và bảo toàn thuật ngữ chuyên ngành.
- **Bảo toàn dữ liệu (Data Versioning):** Mỗi giai đoạn lưu ở một thư mục độc lập, không ghi đè, minh bạch và dễ dàng kiểm tra chéo (QA).
- **Hỗ trợ đa định dạng xuất bản:** Đọc trực tiếp trên Web Reader tương tác song ngữ hoặc xuất bản sách PDF chuẩn in ấn ấn tượng.

---

## 🔄 2. Kiến Trúc Quy Trình 6 Bước (6-Stage Pipeline)

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  01-raw     │ ──> │  02-clean   │ ──> │  03-analyzed│
│  (Scrape)   │     │  (Cleanup)  │     │  (Analysis) │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  07-archive │ <── │  06-reviews │ <── │  04-prep &  │
│  & PDF Pub  │     │  (QA Audit) │     │  05-trans   │
└─────────────┘     └─────────────┘     └─────────────┘
```

| Bước | Tên Giai Đoạn | Thư mục đầu ra | Nhiệm vụ chính |
| :--- | :--- | :--- | :--- |
| **Bước 1** | **Scrape** | `chapter-N/01-raw/` | Thu thập toàn bộ HTML và assets nguyên gốc từ trang OpenStax. |
| **Bước 2** | **Cleanup** | `chapter-N/02-clean/` | Loại bỏ menu, header, footer, script rác; giữ lại semantic content và ảnh. |
| **Bước 3** | **Prep** | `chapter-N/04-prep/` | Nhân đôi cấu trúc thành cặp thẻ: `.eng.hidden` và `.vn.visible`. |
| **Bước 4** | **Translate** | `chapter-N/05-translated/` | AI dịch từng đoạn dựa trên `glossary.csv`, bảo toàn thẻ HTML và ID. |
| **Bước 5** | **Review (QA)** | `chapter-N/06-reviews/` | Đối chiếu thuật ngữ, kiểm tra tính toàn vẹn câu từ và sinh báo cáo Markdown. |
| **Bước 6** | **Archive & PDF**| `chapter-N/07-archive/` | Đóng gói bản song ngữ, bản tiếng Việt thuần và xuất file sách PDF. |

---

## 📁 3. Cấu Trúc Thư Mục Dự Án

```text
dich-sach/
├── pipeline/                      # 6 bước quy trình lõi (Pipeline CLI Scripts)
│   ├── run_pipeline.js            # Runner tổng hợp điều phối các bước
│   ├── step1_scrape.js            # Bước 1: Thu thập HTML & Assets
│   ├── step2_cleanup.js           # Bước 2: Làm sạch nội dung bài đọc
│   ├── step3_prepare.js           # Bước 3: Nhân bản khối song ngữ
│   ├── step4_translate.py         # Bước 4: AI dịch thuật học thuật
│   ├── step5_review.py            # Bước 5: Kiểm định QA & đối soát thuật ngữ
│   ├── step6_archive.js           # Bước 6: Đóng gói bản dịch & build Web Reader
│   └── export_pdf.js              # Xuất bản sách PDF chất lượng in ấn
│
├── agents/                        # Hướng dẫn chi tiết & Skills cho các AI Agent
│   ├── agent-scrape/              # Thu thập dữ liệu
│   ├── agent-analyze/             # Bóc tách thuật ngữ & phân tích ngữ cảnh
│   ├── agent-translate/           # Nguyên tắc dịch & xử lý HTML
│   ├── agent-review/              # Tiêu chí hiệu đính và QA
│   └── agent-archive/             # Đóng gói và giao diện Web Reader
│
├── dashboard/                     # Web Dashboard UI trực quan
│   ├── server.js                  # Express API Backend
│   └── public/                    # Frontend (HTML, CSS, JS)
│
├── templates/                     # Thư mục mẫu sẵn sàng để dịch sách mới
│   └── sample-book/
│       ├── glossary.csv           # Bảng thuật ngữ (Single Source of Truth)
│       ├── tasks.md               # Checklist theo dõi tiến độ
│       └── chapter-1/             # Cấu trúc chuẩn 7 thư mục con
│
├── examples/                      # Mẫu tham khảo trực quan trước/sau dịch
│   ├── sample_clean.html
│   ├── sample_prep.html
│   └── sample_translated.html
│
├── .env.example                   # Mẫu cấu hình API key an toàn
├── package.json                   # Quản lý dependencies & lệnh chạy
└── README.md                      # Tài liệu hướng dẫn sử dụng
```

---

## ⚡ 4. Cài Đặt & Khởi Tạo

### Yêu cầu hệ thống:
- **Node.js** >= 18.0.0
- **Python** >= 3.8
- **Google Chrome** (được cài mặc định trên máy để xuất PDF qua Chrome Headless)

### Các bước cài đặt:

1. **Clone repository:**
   ```bash
   git clone https://github.com/vqtrung357/dich-sach.git
   cd dich-sach
   ```

2. **Cài đặt các gói phụ thuộc (Dependencies):**
   ```bash
   npm install
   ```

3. **Cấu hình môi trường (`.env`):**
   ```bash
   cp .env.example .env
   ```
   Mở tệp `.env` và thêm khóa API của bạn:
   ```env
   OPENAI_API_KEY=sk-your-openai-api-key-here
   OPENAI_MODEL=gpt-4o
   PORT=3000
   ```

---

## 🚀 5. Hướng Dẫn Vận Hành

### Cách 1: Sử dụng Web Dashboard Trực Quan (Khuyên Dùng)

Khởi động giao diện quản lý bằng lệnh:
```bash
npm run dashboard
```
Truy cập: **`http://localhost:3000`** trên trình duyệt để:
- Quản lý danh sách các cuốn sách và từng chương.
- Theo dõi thanh tiến độ phần trăm hoàn thành.
- Bấm nút kích hoạt các bước dịch và xem ngay kết quả song ngữ.

---

### Cách 2: Sử Dụng Command Line (CLI Runner)

#### Chạy toàn bộ quy trình từ đầu đến cuối cho 1 chương:
```bash
# Chạy đầy đủ từ Bước 2 -> Bước 6 và Xuất file PDF
node pipeline/run_pipeline.js --book sample-book --chapter 1 --step all

# Chạy thử nghiệm offline (không tốn chi phí API token)
node pipeline/run_pipeline.js --book sample-book --chapter 1 --step all --dry-run
```

#### Chạy từng bước độc lập:

1. **Bước 1: Thu thập sách từ OpenStax**
   ```bash
   node pipeline/step1_scrape.js --book entrepreneurship --url https://openstax.org/books/entrepreneurship/pages/1-introduction
   ```

2. **Bước 2: Làm sạch HTML**
   ```bash
   node pipeline/step2_cleanup.js --book sample-book --chapter 1
   ```

3. **Bước 3: Chuẩn bị cấu trúc song ngữ**
   ```bash
   node pipeline/step3_prepare.js --book sample-book --chapter 1
   ```

4. **Bước 4: Dịch thuật AI với bảng thuật ngữ**
   ```bash
   python3 pipeline/step4_translate.py --book sample-book --chapter 1
   ```

5. **Bước 5: Kiểm định QA & Đối chiếu thuật ngữ**
   ```bash
   python3 pipeline/step5_review.py --book sample-book --chapter 1
   ```
   *Báo cáo Markdown chi tiết sẽ được tự động tạo tại:* `sample-book/chapter-1/06-reviews/chapter-1-review-report.md`

6. **Bước 6: Đóng gói bản dịch & Build Web Reader**
   ```bash
   node pipeline/step6_archive.js --book sample-book --chapter 1
   ```

7. **Xuất bản Sách PDF In Ấn (Publication-Grade PDF)**
   ```bash
   node pipeline/export_pdf.js --book=sample-book --chapter=1
   ```
   *File PDF hoàn chỉnh được tạo tại thư mục:* `pdf/sample-book/Chuong_1_sample-book.pdf`

---

## 📖 6. Nguyên Tắc Vàng Trong Dịch Thuật Học Thuật

1. **Bảng thuật ngữ là nguồn chân lý duy nhất (Single Source of Truth):**
   - Mọi từ khóa kỹ thuật phải được đăng ký trong `glossary.csv`.
   - Ví dụ: `entrepreneur` dịch nhất quán là **nhà khởi nghiệp**, `venture` là **dự án khởi nghiệp**.
2. **Loại bỏ chú thích ngoặc đơn tiếng Anh thừa:**
   - Dịch dứt khoát sang tiếng Việt: không viết *"kinh tế tự do (gig economy)"*, viết thẳng *"nền kinh tế tự do"*.
3. **Bảo toàn tên riêng & thương hiệu quốc tế:**
   - Giữ nguyên: *Apple, Nike, Starbucks, Peter Drucker*. Không dịch thô nghĩa đen.
4. **Bảo tồn trọn vẹn thuộc tính HTML:**
   - Không làm mất các thẻ con, công thức MathJax/LaTeX, thẻ liên kết tham chiếu chéo (`<a class="autogenerated-content">`).

---

## 🤝 7. Đóng Góp & Chia Sẻ

Mọi đóng góp nhằm hoàn thiện pipeline, bổ sung bảng thuật ngữ các chuyên ngành mới (Kinh tế, Tâm lý học, Khoa học Máy tính, Thống kê...) đều rất được hoan nghênh.

- **GitHub Repository:** [https://github.com/vqtrung357/dich-sach](https://github.com/vqtrung357/dich-sach)
- **Tác giả:** [vqtrung357](https://github.com/vqtrung357)

---
*Dự án vì mục tiêu phát triển học liệu mở và nâng cao chất lượng giáo dục đại học tại Việt Nam.*

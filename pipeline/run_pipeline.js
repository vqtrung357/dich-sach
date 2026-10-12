#!/usr/bin/env node

/**
 * run_pipeline.js - Bộ điều phối toàn diện quy trình Dịch Sách OpenStax
 *
 * Cách dùng:
 *   node pipeline/run_pipeline.js --book entrepreneurship --chapter 1 --step all
 *   node pipeline/run_pipeline.js --book entrepreneurship --chapter 1 --step 4 --dry-run
 *   node pipeline/run_pipeline.js --book entrepreneurship --chapter 1 --step pdf
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    book: 'sample-book',
    chapter: '1',
    step: 'all'
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--book' && args[i + 1]) params.book = args[++i];
    else if (args[i] === '--chapter' && args[i + 1]) params.chapter = args[++i];
    else if (args[i] === '--step' && args[i + 1]) params.step = args[++i];
    else if (args[i] === '--url' && args[i + 1]) params.url = args[++i];
    else if (args[i] === '--dry-run') params.dryRun = true;
    else if (args[i] === '--model' && args[i + 1]) params.model = args[++i];
  }
  return params;
}

function runCommand(desc, cmd) {
  console.log(`\n============================================================`);
  console.log(`▶ ${desc}`);
  console.log(`💻 Lệnh: ${cmd}`);
  console.log(`============================================================`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    return true;
  } catch (err) {
    console.error(`\n❌ Thất bại ở bước: ${desc}`);
    return false;
  }
}

function main() {
  const params = parseArgs();
  const pipelineDir = __dirname;

  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║       HỆ THỐNG DỊCH SÁCH GIÁO TRÌNH ĐẠI HỌC (OPENSTAX)            ║
║       Đóng gói & Phân phối bởi Dự án Dịch Sách                    ║
╚═══════════════════════════════════════════════════════════════════╝
Sách:    ${params.book}
Chương:  ${params.chapter}
Bước:    ${params.step}
Chế độ:  ${params.dryRun ? 'Dry Run (Thử nghiệm offline)' : 'Trực tiếp (Production)'}
  `);

  const steps = {
    '1': () => {
      if (!params.url) {
        console.error('⚠️ Bước 1 yêu cầu truyền thêm URL bắt đầu bằng tham số --url <link>');
        return false;
      }
      return runCommand('Bước 1: Thu thập HTML & Assets từ OpenStax', `node "${path.join(pipelineDir, 'step1_scrape.js')}" --book "${params.book}" --chapter "${params.chapter}" --url "${params.url}"`);
    },
    '2': () => runCommand('Bước 2: Làm sạch HTML (Loại bỏ rác và thanh điều hướng)', `node "${path.join(pipelineDir, 'step2_cleanup.js')}" --book "${params.book}" --chapter "${params.chapter}"`),
    '3': () => runCommand('Bước 3: Chuẩn bị cấu trúc song ngữ (eng hidden / vn visible)', `node "${path.join(pipelineDir, 'step3_prepare.js')}" --book "${params.book}" --chapter "${params.chapter}"`),
    '4': () => {
      let cmd = `python3 "${path.join(pipelineDir, 'step4_translate.py')}" --book "${params.book}" --chapter "${params.chapter}"`;
      if (params.dryRun) cmd += ' --dry-run';
      if (params.model) cmd += ` --model "${params.model}"`;
      return runCommand('Bước 4: Dịch thuật ngữ cảnh bằng AI & Bảng thuật ngữ', cmd);
    },
    '5': () => runCommand('Bước 5: Kiểm tra tính toàn vẹn và đối chiếu thuật ngữ (QA)', `python3 "${path.join(pipelineDir, 'step5_review.py')}" --book "${params.book}" --chapter "${params.chapter}"`),
    '6': () => runCommand('Bước 6: Đóng gói bản dịch & Dựng giao diện Book Reader Preview', `node "${path.join(pipelineDir, 'step6_archive.js')}" --book "${params.book}" --chapter "${params.chapter}"`),
    'pdf': () => runCommand('Bước Xuất Bản: Tạo file PDF sách chuẩn in ấn qua Chrome Headless', `node "${path.join(pipelineDir, 'export_pdf.js')}" --book="${params.book}" --chapter=${params.chapter}`)
  };

  if (params.step === 'all') {
    const sequence = ['2', '3', '4', '5', '6', 'pdf'];
    // Nếu có URL thì chạy cả bước 1
    if (params.url) sequence.unshift('1');

    for (const s of sequence) {
      const ok = steps[s]();
      if (!ok) {
        console.error(`\n⛔ Quy trình dừng lại do lỗi ở bước ${s}.`);
        process.exit(1);
      }
    }
  } else if (steps[params.step]) {
    const ok = steps[params.step]();
    if (!ok) process.exit(1);
  } else {
    console.error(`❌ Bước không hợp lệ: "${params.step}". Chọn từ: 1, 2, 3, 4, 5, 6, pdf, all.`);
    process.exit(1);
  }

  console.log(`\n🎉 HOÀN TẤT THÀNH CÔNG!`);
}

if (require.main === module) {
  main();
}

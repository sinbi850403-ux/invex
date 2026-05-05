import { showToast } from './toast.js';

const MAX_UPLOAD_MB = 10;

export async function readExcelFile(file) {
  if (!file) {
    throw new Error('파일을 선택해 주세요.');
  }

  const name = String(file.name || '').toLowerCase();
  const allowed = ['.xlsx', '.xls', '.csv'];
  if (!allowed.some((ext) => name.endsWith(ext))) {
    throw new Error('엑셀(xlsx/xls) 또는 CSV 파일만 업로드할 수 있습니다.');
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`파일 용량이 너무 큽니다. ${MAX_UPLOAD_MB}MB 이하로 줄여주세요.`);
  }

  if (name.endsWith('.csv')) {
    const text = await file.text();
    const Papa = await import('papaparse');
    const result = Papa.parse(text, { skipEmptyLines: false });
    if (result.errors && result.errors.length) {
      throw new Error('CSV 파일을 읽는 중 오류가 발생했습니다.');
    }
    return {
      sheetNames: ['CSV'],
      sheets: { CSV: result.data },
    };
  }

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheetNames = [];
  const sheets = {};

  workbook.eachSheet((worksheet) => {
    sheetNames.push(worksheet.name);
    const rows = [];
    let maxCols = 0;

    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values ? row.values.slice(1) : [];
      maxCols = Math.max(maxCols, values.length);
      rows.push(values);
    });

    const normalized = rows.map((row) => {
      const filled = row.slice();
      while (filled.length < maxCols) filled.push('');
      return filled.map((cell) => {
        if (cell == null) return '';
        if (typeof cell !== 'object') return cell;
        // Date — YYYY-MM-DD 문자열로 변환
        if (cell instanceof Date) {
          const y = cell.getFullYear();
          const m = String(cell.getMonth() + 1).padStart(2, '0');
          const d = String(cell.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        // ExcelJS richText
        if (cell.richText) return cell.richText.map(r => r.text || '').join('');
        // ExcelJS formula → use result
        if ('result' in cell) return cell.result ?? '';
        // ExcelJS hyperlink
        if (cell.text != null) return String(cell.text);
        return '';
      });
    });

    sheets[worksheet.name] = normalized;
  });

  return { sheetNames, sheets };
}

export async function downloadExcel(data, fileName = '내보내기') {
  try {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('내보낼 데이터가 없습니다.');
    }

    const sheets = [{ name: '데이터', rows: data }];
    await downloadExcelSheets(sheets, fileName);
  } catch (err) {
    reportExcelError(err);
  }
}

export async function downloadExcelSheets(sheets, fileName = '내보내기') {
  try {
    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw new Error('내보낼 시트가 없습니다.');
    }

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();

    sheets.forEach((sheet) => {
      const name = sheet.name || 'Sheet';
      const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
      const worksheet = workbook.addWorksheet(name);

      if (rows.length === 0) return;

      if (Array.isArray(rows[0])) {
        rows.forEach((row) => worksheet.addRow(row));
      } else {
        const headers = Object.keys(rows[0] || {});
        worksheet.columns = headers.map((key) => ({ header: key, key, width: Math.max(12, key.length + 2) }));
        rows.forEach((row) => {
          const record = {};
          headers.forEach((key) => {
            record[key] = row[key] == null ? '' : row[key];
          });
          worksheet.addRow(record);
        });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    triggerDownload(buffer, fileName);
  } catch (err) {
    reportExcelError(err);
  }
}

export function indexToCol(idx) {
  let col = '';
  let n = idx;
  while (n >= 0) {
    col = String.fromCharCode((n % 26) + 65) + col;
    n = Math.floor(n / 26) - 1;
  }
  return col;
}

function triggerDownload(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportExcelError(err) {
  const message = err?.message || '엑셀 처리 중 오류가 발생했습니다.';
  showToast(message, 'error');
}

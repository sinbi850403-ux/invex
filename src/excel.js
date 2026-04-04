/**
 * excel.js - 엑셀 파일 읽기/쓰기 처리
 * 왜 별도 파일? → 엑셀 처리 로직을 한 곳에 모아서 관리하기 위해
 * xlsx 라이브러리 사용
 */

import * as XLSX from 'xlsx';

/**
 * 엑셀 파일을 읽어서 데이터 반환
 * @param {File} file - 업로드된 파일 객체
 * @returns {Promise<{sheetNames: string[], sheets: Object}>}
 *   - sheetNames: 시트 이름 목록
 *   - sheets: { 시트이름: [[행1], [행2], ...] } 형태의 2차원 배열
 */
export function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetNames = workbook.SheetNames;
        const sheets = {};

        // 각 시트를 2차원 배열로 변환
        sheetNames.forEach((name) => {
          const sheet = workbook.Sheets[name];
          // header:1 → 헤더를 별도로 분리하지 않고 전부 배열로 반환
          sheets[name] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '', // 빈 셀은 빈 문자열로
          });
        });

        resolve({ sheetNames, sheets });
      } catch (err) {
        reject(new Error('엑셀 파일을 읽을 수 없습니다: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 컬럼 인덱스에서 엑셀 컬럼명(A, B, C...)으로 변환
 * @param {number} idx - 0부터 시작하는 인덱스
 * @returns {string} 엑셀 컬럼명
 */
export function indexToCol(idx) {
  let col = '';
  let n = idx;
  while (n >= 0) {
    col = String.fromCharCode((n % 26) + 65) + col;
    n = Math.floor(n / 26) - 1;
  }
  return col;
}

/**
 * 데이터를 엑셀 파일로 다운로드
 * @param {Array<Object>} data - 내보낼 데이터 배열
 * @param {string} fileName - 파일명 (확장자 제외)
 */
export function downloadExcel(data, fileName = '내보내기') {
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '데이터');
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (err) {
    throw new Error('엑셀 내보내기 실패: ' + err.message);
  }
}

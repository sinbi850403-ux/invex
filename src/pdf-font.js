/**
 * pdf-font.js - jsPDF 한글 폰트 지원
 * 역할: 나눔고딕 폰트를 로드하고 jsPDF에 등록
 * 왜 필요? → jsPDF 기본 폰트(Helvetica)는 한글 미지원 → 글자 깨짐
 * 
 * 폰트 파일: public/fonts/NanumGothic-Regular.ttf (정적 TTF, ~2MB)
 * 왜 나눔고딕? → 정적 TTF여서 jsPDF 호환 보장 (Variable TTF는 fvar 테이블 에러 발생)
 */

// 폰트 캐시 (한 번만 로드)
let fontCache = null;

/**
 * 로컬 TTF 파일을 가져와 base64로 변환
 */
async function loadKoreanFont() {
  if (fontCache) return fontCache;

  try {
    // public 폴더의 폰트 파일 가져오기 (Vite에서 자동 서빙)
    const res = await fetch('/fonts/NanumGothic-Regular.ttf');
    if (!res.ok) {
      throw new Error(`폰트 파일 로드 실패: ${res.status}`);
    }
    
    const arrayBuffer = await res.arrayBuffer();

    // ArrayBuffer → Base64 변환 (청크 단위)
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    fontCache = btoa(binary);
    return fontCache;
  } catch (err) {
    console.error('[PDF] 한글 폰트 로딩 실패:', err);
    return null;
  }
}

/**
 * jsPDF 문서에 한글 폰트 등록 및 설정
 * @param {jsPDF} doc - jsPDF 인스턴스
 * @returns {boolean} 성공 여부
 */
export async function applyKoreanFont(doc) {
  try {
    const fontBase64 = await loadKoreanFont();
    
    if (!fontBase64) {
      console.warn('[PDF] 한글 폰트 없음 — 기본 폰트 사용');
      return false;
    }

    // jsPDF VFS에 폰트 등록
    doc.addFileToVFS('NanumGothic-Regular.ttf', fontBase64);
    
    // 모든 스타일 변형에 동일 폰트 등록
    // 왜? → autoTable headStyles에 fontStyle:'bold' 적용 시 bold 변형을 찾기 때문
    doc.addFont('NanumGothic-Regular.ttf', 'NanumGothic', 'normal');
    doc.addFont('NanumGothic-Regular.ttf', 'NanumGothic', 'bold');
    doc.addFont('NanumGothic-Regular.ttf', 'NanumGothic', 'italic');
    doc.addFont('NanumGothic-Regular.ttf', 'NanumGothic', 'bolditalic');
    doc.setFont('NanumGothic');
    return true;
  } catch (err) {
    console.error('[PDF] 폰트 등록 실패:', err);
    return false;
  }
}

/**
 * autoTable용 한글 폰트 스타일 반환
 */
export function getKoreanFontStyle() {
  return {
    font: 'NanumGothic',
  };
}

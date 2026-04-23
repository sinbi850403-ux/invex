/**
 * InoutExcelPanel — 입출고 엑셀 다운로드 / 대량 업로드
 */
import { useRef, useState } from 'react';

export type ExcelRow = {
  type: 'in' | 'out';
  itemName: string;
  itemCode: string;
  quantity: number;
  unitPrice: number;
  vendor: string;
  warehouse: string;
  date: string;
  note: string;
};

type Props = {
  rows: {
    type?: string;
    itemName?: string;
    itemCode?: string;
    quantity?: string | number;
    unitPrice?: string | number;
    vendor?: string;
    warehouse?: string;
    date?: string;
    note?: string;
  }[];
  onImport: (rows: ExcelRow[]) => { ok: boolean; message?: string; count?: number };
};

const HEADERS = ['유형', '품목명', '품목코드', '수량', '단가', '거래처', '창고', '날짜', '비고'];

function toNum(v: unknown) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeType(v: unknown): 'in' | 'out' | null {
  const s = String(v ?? '').trim();
  if (s === '입고' || s === 'in') return 'in';
  if (s === '출고' || s === 'out') return 'out';
  return null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** 현재 rows → 엑셀 파일 다운로드 */
async function downloadRows(rows: Props['rows']) {
  const { downloadExcel } = await import('../../../../excel.js');
  const data = [
    HEADERS,
    ...rows.map((r) => [
      r.type === 'in' ? '입고' : '출고',
      r.itemName ?? '',
      r.itemCode ?? '',
      toNum(r.quantity),
      toNum(r.unitPrice),
      r.vendor ?? '',
      r.warehouse ?? '',
      r.date ?? '',
      r.note ?? '',
    ]),
  ];
  await downloadExcel(data, `입출고이력_${todayStr()}`);
}

/** 템플릿(빈 양식) 다운로드 */
async function downloadTemplate() {
  const { downloadExcel } = await import('../../../../excel.js');
  const data = [
    HEADERS,
    ['입고', '품목명 예시', 'CODE-001', 10, 5000, '거래처명', '본사 창고', todayStr(), '비고'],
  ];
  await downloadExcel(data, '입출고_업로드_양식');
}

/** 업로드된 파일 파싱 → ExcelRow[] */
async function parseFile(file: File): Promise<{ rows: ExcelRow[]; errors: string[] }> {
  const { readExcelFile } = await import('../../../../excel.js');
  const { sheetNames, sheets } = await readExcelFile(file);
  const raw: unknown[][] = sheets[sheetNames[0]] ?? [];

  if (raw.length < 2) return { rows: [], errors: ['데이터가 없습니다. 헤더 포함 2행 이상 필요합니다.'] };

  const header = (raw[0] as unknown[]).map((h) => String(h ?? '').trim());
  const idxOf = (label: string) => header.indexOf(label);

  const iType = idxOf('유형');
  const iName = idxOf('품목명');
  const iCode = idxOf('품목코드');
  const iQty  = idxOf('수량');
  const iPrice= idxOf('단가');
  const iVend = idxOf('거래처');
  const iWare = idxOf('창고');
  const iDate = idxOf('날짜');
  const iNote = idxOf('비고');

  if (iType === -1 || iName === -1 || iQty === -1) {
    return { rows: [], errors: ['헤더가 올바르지 않습니다. 템플릿을 다운로드해서 사용하세요.'] };
  }

  const rows: ExcelRow[] = [];
  const errors: string[] = [];

  raw.slice(1).forEach((row, idx) => {
    const lineNo = idx + 2;
    const get = (i: number) => (i >= 0 ? String((row as unknown[])[i] ?? '').trim() : '');

    const type = normalizeType(get(iType));
    if (!type) { errors.push(`${lineNo}행: 유형은 "입고" 또는 "출고"여야 합니다.`); return; }

    const itemName = get(iName);
    if (!itemName) { errors.push(`${lineNo}행: 품목명이 비어 있습니다.`); return; }

    const quantity = toNum(get(iQty));
    if (quantity <= 0) { errors.push(`${lineNo}행: 수량은 0보다 커야 합니다.`); return; }

    rows.push({
      type,
      itemName,
      itemCode: get(iCode),
      quantity,
      unitPrice: toNum(get(iPrice)),
      vendor: get(iVend),
      warehouse: get(iWare),
      date: get(iDate) || todayStr(),
      note: get(iNote),
    });
  });

  return { rows, errors };
}

export function InoutExcelPanel({ rows, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileRef.current) return;
    fileRef.current.value = '';
    if (!file) return;

    setUploading(true);
    setResult(null);
    try {
      const { rows: parsed, errors } = await parseFile(file);
      if (errors.length > 0) {
        setResult({ ok: false, message: errors.slice(0, 3).join('\n') + (errors.length > 3 ? `\n외 ${errors.length - 3}건` : '') });
        return;
      }
      const res = onImport(parsed);
      setResult({ ok: res.ok, message: res.message ?? (res.ok ? '완료' : '실패') });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : '파일 처리 중 오류가 발생했습니다.' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <article className="react-card">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">엑셀 대량 관리</span>
          <h3>엑셀로 한번에 처리</h3>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 현재 이력 다운로드 */}
        <button
          type="button"
          className="react-secondary-button"
          onClick={() => downloadRows(rows)}
          title="현재 필터된 입출고 이력을 엑셀로 저장"
        >
          ↓ 이력 다운로드 ({rows.length}건)
        </button>

        {/* 빈 양식 다운로드 */}
        <button
          type="button"
          className="react-secondary-button"
          onClick={downloadTemplate}
          title="업로드용 빈 양식 다운로드"
        >
          ↓ 업로드 양식
        </button>

        {/* 파일 업로드 */}
        <button
          type="button"
          className="react-primary-button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="엑셀/CSV 파일로 입출고 대량 등록"
        >
          {uploading ? '처리 중…' : '↑ 엑셀 업로드'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />

        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          xlsx · xls · csv 지원 / 양식 다운 후 작성하세요
        </span>
      </div>

      {result && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            whiteSpace: 'pre-line',
            background: result.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: result.ok ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${result.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          {result.message}
        </div>
      )}
    </article>
  );
}

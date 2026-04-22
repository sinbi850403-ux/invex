type InoutRow = {
  id?: string;
  type?: string;
  itemName?: string;
  itemCode?: string;
  quantity?: string | number;
  date?: string;
  vendor?: string;
  warehouse?: string;
  _index?: number;
};

export function InoutTable({ rows, onDelete }: { rows: InoutRow[]; onDelete: (row: InoutRow) => void }) {
  return (
    <article className="react-card react-card--table">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">입출고 이력</span>
          <h3>입고/출고 기록</h3>
        </div>
        <strong>{rows.length}건</strong>
      </div>

      <div className="react-data-table">
        <table>
          <thead>
            <tr>
              <th>유형</th>
              <th>품목</th>
              <th>코드</th>
              <th>수량</th>
              <th>날짜</th>
              <th>거래처</th>
              <th>창고</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.slice(0, 16).map((row, index) => (
                <tr key={row.id || `${row.itemCode || row.itemName || 'tx'}-${index}`}>
                  <td>
                    <span className={row.type === 'in' ? 'react-badge is-good' : 'react-badge is-warn'}>
                      {row.type === 'in' ? '입고' : '출고'}
                    </span>
                  </td>
                  <td>{row.itemName || '-'}</td>
                  <td>{row.itemCode || '-'}</td>
                  <td>{row.quantity || '-'}</td>
                  <td>{row.date || '-'}</td>
                  <td>{row.vendor || '-'}</td>
                  <td>{row.warehouse || '-'}</td>
                  <td>
                    <button type="button" className="react-link-button is-danger" onClick={() => onDelete(row)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="react-empty-cell">
                  현재 필터 조건에 맞는 입출고 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}


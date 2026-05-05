import React, { useState } from 'react';
import { useStore } from '../hooks/useStore.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { ADMIN_EMAILS, fmt } from '../domain/posConfig.js';
import { UploadModal }  from '../components/pos/UploadModal.jsx';
import { PosDashboard } from '../components/pos/PosDashboard.jsx';

export default function PosPage() {
  const { user } = useAuth();
  const [state, setState] = useStore();
  const posData = state.posData || [];
  const [showUpload, setShowUpload] = useState(false);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  if (!isAdmin) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">접근 제한</h1></div>
        <div className="alert alert-danger" style={{ marginTop: 16 }}> 이 기능은 관리자만 사용할 수 있습니다.</div>
      </div>
    );
  }

  function handleConfirm(rows) {
    const totalSales = rows.reduce((s, r) => s + (parseFloat(r.totalSales) || parseFloat(r.salesAmount) || 0), 0);
    setState({ posData: [...posData, ...rows] });
    showToast(` POS 매출 ${rows.length}건 등록 완료! (총 매출: ${fmt(totalSales)})`, 'success');
    setShowUpload(false);
  }

  function handleExport() {
    if (!posData.length) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
    downloadExcel(posData, 'POS_매출_데이터');
    showToast('POS 데이터를 엑셀로 내보냈습니다.', 'success');
  }

  function handleClear() {
    if (confirm('POS 매출 데이터를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      setState({ posData: [] });
      showToast('POS 데이터를 초기화했습니다.', 'info');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> POS 매출 분석</h1>
          <div className="page-desc">POS 매출 데이터를 업로드하여 매출 현황을 분석합니다. <span className="badge badge-danger" style={{ fontSize: 10 }}>관리자 전용</span></div>
        </div>
        <div className="page-actions">
          {posData.length > 0 && <>
            <button className="btn btn-outline" onClick={handleExport}> 내보내기</button>
            <button className="btn btn-outline" onClick={handleClear}> 데이터 초기화</button>
          </>}
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}> POS 엑셀 업로드</button>
        </div>
      </div>

      {posData.length > 0 ? (
        <PosDashboard posData={posData} />
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}></div>
          <h3 style={{ marginBottom: 8 }}>POS 매출 데이터를 업로드해 주세요</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
            POS 시스템에서 엑셀로 내보낸 매출 데이터를 업로드하면<br />
            자동으로 헤더를 인식하고 매출 현황을 분석합니다.
          </p>
          <div className="alert alert-info" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'left', fontSize: 12 }}>
            <strong> 지원되는 POS 헤더:</strong><br />
            판매일자, 매장명, 구분, 총매출액, 매출금액, 부가세, 카드, 현금, 포인트 등<br />
            → 헤더 이름이 조금 달라도 자동으로 인식합니다!
          </div>
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onConfirm={handleConfirm} />}
    </div>
  );
}

/**
 * SettingsPage.jsx - 설정 페이지
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { resetState } from '../store.js';
import { showToast } from '../toast.js';
import { isSupabaseConfigured } from '../supabase-client.js';
import { clearAllUserData, transactions as dbTransactions, transfers as dbTransfers } from '../db.js';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [beginnerMode, setStore] = useStore(s => s.beginnerMode !== false);
  const [clearingTx, setClearingTx] = useState(false);
  const [clearingTransfers, setClearingTransfers] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const handleBeginnerToggle = (e) => {
    const enabled = e.target.checked;
    setStore({ beginnerMode: enabled });
    showToast(`초보자 도움 모드가 ${enabled ? '켜졌습니다' : '꺼졌습니다'}.`, 'success');
  };

  const handleResetViewPrefs = () => {
    setStore({
      inventoryViewPrefs: {
        filter: { keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all' },
        sort: { key: '', direction: '' },
      },
      inoutViewPrefs: {
        filter: { keyword: '', type: '', date: '', vendor: '', itemCode: '', quick: 'all' },
        sort: { key: 'date', direction: 'desc' },
      },
    });
    showToast('정렬/필터 설정을 기본값으로 되돌렸습니다.', 'info');
  };

  const handleClearTx = async () => {
    if (!confirm('입출고 기록을 모두 삭제하시겠습니까?')) return;
    setClearingTx(true);
    try {
      if (isSupabaseConfigured) await dbTransactions.deleteAll();
      setStore({ transactions: [] });
      showToast('입출고 기록이 초기화되었습니다.', 'info');
    } catch (err) {
      console.error('[Settings] 입출고 초기화 실패:', err);
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setClearingTx(false);
    }
  };

  const handleClearTransfers = async () => {
    if (!confirm('이동 이력을 모두 삭제하시겠습니까?')) return;
    setClearingTransfers(true);
    try {
      if (isSupabaseConfigured) await dbTransfers.deleteAll();
      setStore({ transfers: [] });
      showToast('이동 이력이 초기화되었습니다.', 'info');
    } catch (err) {
      console.error('[Settings] 이동 이력 초기화 실패:', err);
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setClearingTransfers(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm(' 모든 데이터(품목, 거래, 설정)를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    if (!confirm('정말로 전체 초기화하시겠습니까? (최종 확인)')) return;
    setClearingAll(true);
    try {
      if (isSupabaseConfigured) {
        await clearAllUserData();
      }
      await resetState();  // await 추가: IndexedDB/localStorage 초기화 완료 대기
      setStore({ _onboardingDone: false });
      showToast('전체 데이터가 초기화되었습니다.', 'info');
      navigate('/home');
    } catch (error) {
      console.error('[Settings] 전체 초기화 실패:', error);
      showToast(error?.message || '전체 초기화에 실패했습니다.', 'error');
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">설정</h1>
          <div className="page-desc">사용성 설정과 데이터 초기화를 관리합니다.</div>
        </div>
      </div>

      {/* 사용성 설정 */}
      <div className="card">
        <div className="card-title"> 사용성 설정</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '220px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>초보자 도움 모드</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>온보딩과 빠른 시작 가이드를 화면에 표시합니다.</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={beginnerMode} onChange={handleBeginnerToggle} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{beginnerMode ? '켜짐' : '꺼짐'}</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={handleResetViewPrefs}>정렬/필터 기본값으로 되돌리기</button>
        </div>
      </div>

      {/* 데이터 관리 */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-title"> 데이터 관리</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handleClearTx} disabled={clearingTx}>
            {clearingTx ? '삭제 중...' : ' 입출고 기록 초기화'}
          </button>
          <button className="btn btn-outline" onClick={handleClearTransfers} disabled={clearingTransfers}>
            {clearingTransfers ? '삭제 중...' : ' 이동 이력 초기화'}
          </button>
          <button className="btn btn-danger" onClick={handleClearAll} disabled={clearingAll}>
            {clearingAll ? '초기화 중...' : ' 전체 데이터 초기화'}
          </button>
        </div>
      </div>
    </div>
  );
}

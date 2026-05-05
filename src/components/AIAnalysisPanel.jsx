/**
 * AIAnalysisPanel.jsx — 범용 AI 분석 패널
 * 어떤 페이지에서도 systemPrompt + userPrompt만 넘기면 스트리밍 AI 분석 표시
 */
import React, { useState, useCallback } from 'react';
import { callAIStream } from '../ai-report.js';

/** 마크다운 간단 렌더 (##, -, 1.) */
function renderAIText(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) {
      return (
        <div key={i} style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', marginTop: 14, marginBottom: 3 }}>
          {line.replace('## ', '')}
        </div>
      );
    }
    if (line.startsWith('- ') || line.match(/^\d+\. /)) {
      return (
        <div key={i} style={{ paddingLeft: 12, fontSize: '13px', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          {line}
        </div>
      );
    }
    if (line.trim() === '') return <div key={i} style={{ height: 5 }} />;
    return (
      <div key={i} style={{ fontSize: '13px', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
        {line}
      </div>
    );
  });
}

/**
 * @param {{
 *   systemPrompt: string,
 *   userPrompt: string,
 *   title?: string,
 *   buttonLabel?: string,
 *   icon?: string,
 * }} props
 */
export default function AIAnalysisPanel({
  systemPrompt,
  userPrompt,
  title = 'AI 분석',
  buttonLabel = 'AI 분석',
  icon = '',
}) {
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState(null);
  const [open, setOpen] = useState(false);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError('');
    setReport('');
    setGeneratedAt(null);
    setOpen(true);
    try {
      await callAIStream(systemPrompt, userPrompt, (chunk) => {
        setLoading(false);
        setReport(prev => prev + chunk);
      });
      setGeneratedAt(new Date());
    } catch (e) {
      setError(e.message || 'AI 분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [systemPrompt, userPrompt]);

  return (
    <>
      {/* 트리거 버튼 — 페이지 page-actions 안에 배치 */}
      <button
        className="btn btn-outline"
        onClick={handleRun}
        disabled={loading}
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}
      >
        {loading ? (
          <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> 분석 중...</>
        ) : (
          <>{icon || ''} {buttonLabel}</>
        )}
      </button>

      {/* 결과 패널 — 버튼 아래에 슬라이드인 */}
      {open && (
        <div
          className="card"
          style={{
            marginTop: 16,
            borderLeft: '3px solid var(--primary)',
            background: 'var(--bg-card, var(--bg-secondary))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>
               {title}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {generatedAt && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {generatedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 생성
                </span>
              )}
              <button
                className="btn btn-ghost"
                style={{ padding: '2px 8px', fontSize: 12 }}
                onClick={handleRun}
                disabled={loading}
              >
                재생성
              </button>
              <button
                className="btn btn-ghost"
                style={{ padding: '2px 8px', fontSize: 12 }}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {loading && !report && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: 6 }}>⟳</span>
              AI가 분석 중입니다...
            </div>
          )}

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 0' }}>
              ⚠️ {error}
            </div>
          )}

          {report && (
            <div style={{ lineHeight: 1.7 }}>
              {renderAIText(report)}
            </div>
          )}
        </div>
      )}
    </>
  );
}

type InoutSummaryProps = {
  summary: {
    totalTransactions: number;
    todayInbound: number;
    todayOutbound: number;
    missingVendor: number;
  };
};

export function InoutSummary({ summary }: InoutSummaryProps) {
  const cards = [
    { label: '거래 건수', value: summary.totalTransactions, tone: 'neutral' },
    { label: '오늘 입고', value: summary.todayInbound, tone: summary.todayInbound ? 'good' : 'neutral' },
    { label: '오늘 출고', value: summary.todayOutbound, tone: summary.todayOutbound ? 'warn' : 'neutral' },
    { label: '거래처 미입력', value: summary.missingVendor, tone: summary.missingVendor ? 'warn' : 'good' },
  ];

  return (
    <div className="react-grid react-grid--stats">
      {cards.map((card) => (
        <article key={card.label} className={`react-stat-card is-${card.tone}`}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </div>
  );
}


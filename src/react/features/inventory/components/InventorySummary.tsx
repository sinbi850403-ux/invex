type InventorySummaryProps = {
  summary: {
    itemCount: number;
    warehouses: number;
    categories: number;
    totalQuantity: number;
    totalValue: number;
    lowStock: number;
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function InventorySummary({ summary }: InventorySummaryProps) {
  const cards = [
    { label: '품목 수', value: formatNumber(summary.itemCount), tone: 'neutral' },
    { label: '창고 수', value: formatNumber(summary.warehouses), tone: 'neutral' },
    { label: '카테고리', value: formatNumber(summary.categories), tone: 'neutral' },
    { label: '재고 수량', value: formatNumber(summary.totalQuantity), tone: 'neutral' },
    { label: '재고 가치', value: `₩${formatNumber(summary.totalValue)}`, tone: 'neutral' },
    { label: '부족 재고', value: formatNumber(summary.lowStock), tone: summary.lowStock ? 'warn' : 'good' },
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


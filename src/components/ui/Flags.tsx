// Флаги для переключателя языка (Рус / Ўзб).
const frame = { display: 'block', borderRadius: 2, boxShadow: '0 0 0 1px rgba(25,56,44,.18)', flex: 'none' } as const;

export function FlagRu({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={(size * 2) / 3} viewBox="0 0 24 16" style={frame}>
      <rect width="24" height="16" fill="#ffffff" />
      <rect y="5.33" width="24" height="5.34" fill="#0039A6" />
      <rect y="10.67" width="24" height="5.33" fill="#D52B1E" />
    </svg>
  );
}

export function FlagUz({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={(size * 2) / 3} viewBox="0 0 24 16" style={frame}>
      <rect width="24" height="5.1" fill="#0099B5" />
      <rect y="5.1" width="24" height="0.5" fill="#CE1126" />
      <rect y="5.6" width="24" height="4.8" fill="#ffffff" />
      <rect y="10.4" width="24" height="0.5" fill="#CE1126" />
      <rect y="10.9" width="24" height="5.1" fill="#1EB53A" />
      <circle cx="4.3" cy="2.55" r="1.75" fill="#ffffff" />
      <circle cx="5" cy="2.55" r="1.5" fill="#0099B5" />
      {[[7.6, 1.6], [8.8, 1.6], [7.6, 3.4], [8.8, 3.4], [10, 2.5]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.4" fill="#ffffff" />)}
    </svg>
  );
}

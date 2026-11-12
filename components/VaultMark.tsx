// The Neon Vault mark: a vault door – hinges, neon ring with bolts, door plate and the spoked handle wheel.
// Plain SVG with explicit attributes, so the same drawing works in the page and in next/og icons.

// Rounded: Node and browsers differ in the last digits of cos/sin, which would break hydration.
const r2 = (n: number) => Math.round(n * 100) / 100;

const BOLTS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4 + Math.PI / 8);
const SPOKES = Array.from({ length: 4 }, (_, i) => (i * Math.PI) / 2 + Math.PI / 4);

/** `color` is the neon colour; `bg` the plate behind it (null = transparent). `wheelClass` lets the page animate the handle. */
export function VaultMark({ size, color, bg = '#0b0d12', wheelClass }: { size: number; color: string; bg?: string | null; wheelClass?: string }) {
  const hole = bg ?? '#0b0d12';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {bg && <rect x="0" y="0" width="64" height="64" rx="15" fill={bg} />}
      {/* hinges on the left */}
      <rect x="6" y="18" width="6" height="8" rx="2" fill={color} />
      <rect x="6" y="38" width="6" height="8" rx="2" fill={color} />
      {/* door: outer ring, tinted plate, inner ring */}
      <circle cx="33" cy="32" r="22" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="3.6" />
      <circle cx="33" cy="32" r="16.5" fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="1.4" />
      {BOLTS.map((a, i) => {
        const [x, y] = [r2(33 + 22 * Math.cos(a)), r2(32 + 22 * Math.sin(a))];
        return <circle key={i} cx={x} cy={y} r="2.2" fill={hole} stroke={color} strokeWidth="1.6" />;
      })}
      {/* handle wheel: rim, four spokes with grips */}
      <g className={wheelClass}>
        <circle cx="33" cy="32" r="8.5" fill="none" stroke={color} strokeWidth="2.6" />
        {SPOKES.map((a, i) => {
          const [x1, y1] = [r2(33 + 3 * Math.cos(a)), r2(32 + 3 * Math.sin(a))];
          const [x2, y2] = [r2(33 + 12.5 * Math.cos(a)), r2(32 + 12.5 * Math.sin(a))];
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.6" strokeLinecap="round" />
              <circle cx={x2} cy={y2} r="2" fill={color} />
            </g>
          );
        })}
        <circle cx="33" cy="32" r="3.4" fill={color} />
        <circle cx="33" cy="32" r="1.3" fill={hole} />
      </g>
    </svg>
  );
}

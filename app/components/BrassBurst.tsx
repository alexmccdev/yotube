const DOT_COUNT = 8;
const RADIUS = 26;

/** A brief radial burst of brass dust — fired once when a card first lands on Yoto. */
export default function BrassBurst() {
  return (
    <span className="relative inline-block w-0 h-0" aria-hidden="true">
      {Array.from({ length: DOT_COUNT }, (_, i) => {
        const angle = (i / DOT_COUNT) * Math.PI * 2;
        const dx = Math.cos(angle) * RADIUS;
        const dy = Math.sin(angle) * RADIUS;
        return (
          <span
            key={i}
            className="brass-burst-dot"
            style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties}
          />
        );
      })}
    </span>
  );
}

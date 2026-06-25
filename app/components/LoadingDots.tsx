const DELAYS = ["0ms", "150ms", "300ms"];

/** Three brass dots bouncing in sequence — used wherever we'd otherwise just say "Loading…".
 *  Pass `className` to set text color/size for the surrounding context (defaults to the
 *  app's dark-background tone; card interiors are paper-colored and need an ink tone instead). */
export default function LoadingDots({
  label,
  className = "font-mono text-sm text-paper/50",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={`${className} inline-flex items-center gap-1.5`}>
      {label}
      <span className="inline-flex items-center gap-1">
        {DELAYS.map((delay) => (
          <span
            key={delay}
            className="bounce-dot w-1.5 h-1.5 rounded-full bg-brass"
            style={{ animationDelay: delay }}
          />
        ))}
      </span>
    </span>
  );
}

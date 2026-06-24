"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Plain (non-link) version of the marquee-on-hover effect, for use over arbitrary text. */
export default function TickerText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    const measure = () => setDistance(Math.max(0, track.scrollWidth - container.clientWidth));
    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    document.fonts?.ready.then(measure);

    return () => resizeObserver.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className="overflow-hidden w-full">
      <span
        ref={trackRef}
        title={text}
        style={distance > 0 ? ({ "--marquee-distance": `${distance}px` } as React.CSSProperties) : undefined}
        className={`marquee-track ${distance > 0 ? "is-overflowing" : ""} ${className ?? ""}`}
      >
        {text}
      </span>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";

export default function TickerTitle({ href, title, className }: { href: string; title: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLAnchorElement>(null);
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
  }, [title]);

  return (
    <div ref={containerRef} className="overflow-hidden">
      <Link
        ref={trackRef}
        href={href}
        title={title}
        style={distance > 0 ? ({ "--marquee-distance": `${distance}px` } as React.CSSProperties) : undefined}
        className={`marquee-track ${distance > 0 ? "is-overflowing" : ""} ${className ?? ""}`}
      >
        {title}
      </Link>
    </div>
  );
}

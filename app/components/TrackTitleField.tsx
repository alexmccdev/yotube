"use client";

import { useRef, useState } from "react";
import TickerText from "@/app/components/TickerText";

export default function TrackTitleField({
  title,
  onRename,
  editable = true,
}: {
  title: string;
  onRename: (title: string) => void;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (editing && editable) {
    return (
      <input
        ref={inputRef}
        autoFocus
        className="flex-1 min-w-0 border-b border-brass outline-none bg-transparent transition-colors"
        value={title}
        onChange={(e) => onRename(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => editable && setEditing(true)}
      disabled={!editable}
      className="flex-1 min-w-0 block text-left border-b border-transparent hover:border-ink-text/20 transition-colors disabled:cursor-default disabled:hover:border-transparent"
    >
      <TickerText text={title} />
    </button>
  );
}

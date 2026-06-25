"use client";

import { useState } from "react";

export default function CoverImageField({
  coverImageUrl,
  onChange,
  editable = true,
}: {
  coverImageUrl?: string;
  onChange: (url: string) => void;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(coverImageUrl ?? "");

  const save = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== coverImageUrl) onChange(value.trim());
  };

  if (editing && editable) {
    return (
      <input
        autoFocus
        className="w-16 font-mono text-[9px] border-b border-brass outline-none bg-transparent text-ink-text"
        value={value}
        placeholder="Image URL"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => editable && setEditing(true)}
      disabled={!editable}
      title={editable ? "Click to change cover image" : undefined}
      className="w-16 h-[88px] shrink-0 rounded-sm border border-ink-text/15 bg-ink-text/5 overflow-hidden hover:border-brass transition-colors disabled:hover:border-ink-text/15 flex items-center justify-center"
    >
      {coverImageUrl ? (
        <img src={coverImageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-mono text-[9px] text-ink-text/30 text-center px-1">No cover</span>
      )}
    </button>
  );
}

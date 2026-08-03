"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A plain text field that suggests school names other users have already
 * typed, so "1-р сургууль" doesn't end up spelled five different ways
 * across accounts. Suggestions only — any value can still be typed and
 * submitted, matching how the field worked before this existed.
 *
 * Not a direct child of FormField's styled wrapper (it needs its own
 * `position: relative` for the dropdown), so the input's styling is
 * duplicated here rather than inherited via FormField's `[&>input]` CSS.
 */
export default function SchoolAutocomplete({
  value,
  onChange,
  placeholder = "Сургуулийн нэр",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    const id = setTimeout(() => {
      if (query.length < 1) {
        setSuggestions([]);
        return;
      }
      fetch(`/api/account/schools?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : { schools: [] }))
        .then((json) => setSuggestions(json.schools ?? []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Typing the same school someone already entered shouldn't still show a
  // dropdown offering to re-select it.
  const visible = suggestions.filter((s) => s !== value);

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full px-4 py-[14px] rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold transition-colors outline-none focus:bg-surface focus:border-blue"
      />
      {open && visible.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1.5 bg-surface border border-line-2 rounded-xs shadow-md max-h-[220px] overflow-y-auto">
          {visible.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 font-semibold text-ink hover:bg-bg-soft transition-colors"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

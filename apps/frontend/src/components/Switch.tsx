"use client";

import { ReactNode } from "react";

interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** ID explicite pour aria-labelledby si besoin */
  id?: string;
}

export default function Switch({
  checked,
  onChange,
  children,
  icon,
  disabled = false,
  id,
}: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-border)]/50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] disabled:opacity-60"
    >
      {icon && <span className="text-[var(--color-text-tertiary)]" aria-hidden="true">{icon}</span>}
      <span className="flex-1 text-sm text-[var(--color-text-primary)]">{children}</span>
      <span
        className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
        } ${disabled ? "cursor-not-allowed" : ""}`}
        aria-hidden="true"
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

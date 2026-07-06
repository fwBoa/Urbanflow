"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export default function Header({ title, showBack = false, rightAction }: HeaderProps) {
  const router = useRouter();

  return (
    <header
      className="sticky top-0 z-40 grid grid-cols-[1fr_auto_1fr] items-center h-[var(--header-height)] px-4 bg-background/85 backdrop-blur-md text-[var(--color-text-primary)] border-b border-[var(--color-border)]/60 safe-area-top transition-colors duration-300"
      role="banner"
    >
      <div className="justify-self-start">
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-[var(--color-surface)] text-[var(--color-text-primary)] transition-colors"
            aria-label="Retour"
          >
            <ArrowLeft size={20} />
          </button>
        )}
      </div>

      <h1 className="col-start-2 text-base font-semibold text-center truncate px-4 text-[var(--color-text-primary)]">{title}</h1>

      <div className="justify-self-end">
        {rightAction}
      </div>
    </header>
  );
}
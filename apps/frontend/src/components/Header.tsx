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
      className="sticky top-0 z-40 flex items-center justify-between h-[60px] px-4 bg-[var(--color-primary)] text-white safe-area-top"
      role="banner"
    >
      <div className="flex items-center gap-3 min-w-[40px]">
        {showBack && (
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Retour"
          >
            <ArrowLeft size={22} />
          </button>
        )}
      </div>

      <h1 className="text-lg font-semibold flex-1 text-center truncate">{title}</h1>

      <div className="flex items-center min-w-[40px] justify-end">
        {rightAction || <span className="w-9" />}
      </div>
    </header>
  );
}
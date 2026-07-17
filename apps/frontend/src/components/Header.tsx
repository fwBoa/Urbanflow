"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import UrbanFlowIcon from "./icons/UrbanFlowIcon";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export default function Header({ title, showBack = false, rightAction }: HeaderProps) {
  const router = useRouter();
  const isHomeBrand = title === "UrbanFlow";

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
            <UrbanFlowIcon type="action" name="arrow-left" size={20} />
          </button>
        )}
      </div>

      <div className="col-start-2 flex items-center justify-center px-4">
        {isHomeBrand ? (
          <>
            <Image
              src="/assets/urbanflow/brand/urbanflow-logo-clair.svg"
              alt="UrbanFlow"
              width={130}
              height={28}
              priority
              className="h-7 w-auto dark:hidden"
            />
            <Image
              src="/assets/urbanflow/brand/urbanflow-logo-sur-fond-sombre.svg"
              alt="UrbanFlow"
              width={130}
              height={28}
              priority
              className="hidden h-7 w-auto dark:block"
            />
          </>
        ) : (
          <h1 className="text-base font-semibold text-center truncate text-[var(--color-text-primary)]">{title}</h1>
        )}
      </div>

      <div className="justify-self-end">
        {rightAction}
      </div>
    </header>
  );
}
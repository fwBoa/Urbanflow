"use client";

import { ReactNode } from "react";
import Header from "./Header";
import NavBar from "./NavBar";

interface AppShellProps {
  children: ReactNode;
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export default function AppShell({ children, title, showBack, rightAction }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* WCAG 2.4.1: Skip navigation link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:bg-white focus:text-black focus:p-4 focus:outline focus:outline-2 focus:outline-blue-600"
      >
        Aller au contenu principal
      </a>
      <Header title={title} showBack={showBack} rightAction={rightAction} />
      <main id="main-content" className="flex-1 px-4 py-4 pb-[96px] max-w-lg mx-auto w-full">
        {children}
      </main>
      <NavBar />
    </div>
  );
}
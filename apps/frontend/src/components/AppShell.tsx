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
      <Header title={title} showBack={showBack} rightAction={rightAction} />
      <main className="flex-1 px-4 py-4 pb-[96px] max-w-lg mx-auto w-full">
        {children}
      </main>
      <NavBar />
    </div>
  );
}
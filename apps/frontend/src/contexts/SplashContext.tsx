"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface SplashContextType {
  isSplashVisible: boolean;
  setSplashVisible: (visible: boolean) => void;
}

const SplashContext = createContext<SplashContextType | undefined>(undefined);

export function SplashProvider({ children }: { children: ReactNode }) {
  const [isSplashVisible, setSplashVisible] = useState(false);

  return (
    <SplashContext.Provider value={{ isSplashVisible, setSplashVisible }}>
      {children}
    </SplashContext.Provider>
  );
}

export function useSplash() {
  const context = useContext(SplashContext);
  if (context === undefined) {
    throw new Error("useSplash must be used within a SplashProvider");
  }
  return context;
}

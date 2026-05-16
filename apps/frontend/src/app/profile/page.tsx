"use client";

import { useState } from "react";
import {
  User,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  Leaf,
  Accessibility,
  Moon,
} from "lucide-react";
import AppShell from "@/components/AppShell";

const menuItems = [
  { icon: Bell, label: "Notifications", href: "#", badge: "3" },
  { icon: Leaf, label: "Préférences de transport", href: "#", badge: null },
  { icon: Accessibility, label: "Accessibilité", href: "#", badge: null },
  { icon: Moon, label: "Mode sombre", href: "#", badge: null, toggle: true },
  { icon: Shield, label: "Confidentialité", href: "#", badge: null },
  { icon: HelpCircle, label: "Aide et support", href: "#", badge: null },
];

export default function ProfilePage() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <AppShell title="Profil">
      {/* Avatar & Info */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-2xl font-bold mb-3">
          JD
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Jean Dupont
        </h2>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          jean.dupont@email.com
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-eco-green)]/10 text-[var(--color-eco-green)]">
            <Leaf size={12} className="mr-1" />
            Éco-mobiliste
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-primary)]">42</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">Trajets</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-eco-green)]">1.2kg</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">CO₂ évité</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-mobility-orange)]">3</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">Favoris</p>
        </div>
      </div>

      {/* Menu */}
      <div className="bg-white rounded-[var(--card-radius)] border border-[var(--color-border)] overflow-hidden">
        {menuItems.map((item, i) => (
          <button
            key={i}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface)] transition-colors text-left border-b border-[var(--color-border)] last:border-b-0"
          >
            <item.icon size={18} className="text-[var(--color-text-tertiary)]" />
            <span className="flex-1 text-sm text-[var(--color-text-primary)]">
              {item.label}
            </span>
            {item.toggle ? (
              <div
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
                  darkMode ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDarkMode(!darkMode);
                }}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    darkMode ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
            ) : (
              <>
                {item.badge && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-favorite-red)] text-white text-[10px] font-bold">
                    {item.badge}
                  </span>
                )}
                <ChevronRight size={16} className="text-[var(--color-text-tertiary)]" />
              </>
            )}
          </button>
        ))}
      </div>

      {/* Logout */}
      <button className="w-full mt-4 py-3 text-sm font-medium text-[var(--color-favorite-red)] hover:bg-[var(--color-favorite-red)]/5 rounded-[var(--card-radius)] transition-colors flex items-center justify-center gap-2">
        <LogOut size={16} />
        Se déconnecter
      </button>
    </AppShell>
  );
}
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import UrbanFlowIcon from "./icons/UrbanFlowIcon";

interface NavItem {
  href: string;
  label: string;
  renderIcon: (isActive: boolean) => React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Accueil",
    renderIcon: (isActive) => (
      <UrbanFlowIcon
        type="navigation"
        name="home"
        size={20}
        className={isActive ? "stroke-[2.5]" : "stroke-[1.5]"}
      />
    ),
  },
  {
    href: "/search",
    label: "Recherche",
    renderIcon: (isActive) => (
      <UrbanFlowIcon
        type="navigation"
        name="search"
        size={20}
        className={isActive ? "stroke-[2.5]" : "stroke-[1.5]"}
      />
    ),
  },
  {
    href: "/favorites",
    label: "Favoris",
    renderIcon: (isActive) => (
      <UrbanFlowIcon
        type="navigation"
        name="favorites"
        size={20}
        className={isActive ? "stroke-[2.5]" : "stroke-[1.5]"}
      />
    ),
  },
  {
    href: "/alerts",
    label: "Alertes",
    renderIcon: (isActive) => (
      <Bell size={20} strokeWidth={isActive ? 2.5 : 1.5} />
    ),
  },
  {
    href: "/profile",
    label: "Profil",
    renderIcon: (isActive) => (
      <UrbanFlowIcon
        type="navigation"
        name="profile"
        size={20}
        className={isActive ? "stroke-[2.5]" : "stroke-[1.5]"}
      />
    ),
  },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-4 left-4 right-4 md:left-1/2 md:right-auto md:w-[440px] md:-translate-x-1/2 z-50 bg-white/80 dark:bg-surface/80 backdrop-blur-lg border border-[var(--color-border)] h-[64px] rounded-2xl flex items-center justify-around px-2 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] transition-all duration-300"
      role="navigation"
      aria-label="Navigation principale"
    >
      {navItems.map(({ href, label, renderIcon }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 min-w-[64px] min-h-[44px] ${
              isActive
                ? "text-[var(--color-primary)] font-semibold scale-105"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && (
              <span className="absolute inset-0 bg-[var(--color-primary)]/10 dark:bg-[var(--color-primary)]/20 rounded-xl -z-10" />
            )}
            {renderIcon(isActive)}
            <span className="text-[10px] font-medium leading-none mt-0.5">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

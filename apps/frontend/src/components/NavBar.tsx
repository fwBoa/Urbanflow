"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Heart,
  User,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/search", label: "Recherche", icon: Search },
  { href: "/favorites", label: "Favoris", icon: Heart },
  { href: "/profile", label: "Profil", icon: User },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[var(--color-border)] h-[80px] flex items-center justify-around px-2 safe-area-bottom"
      role="navigation"
      aria-label="Navigation principale"
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl transition-colors min-w-[64px] min-h-[44px] ${
              isActive
                ? "text-[var(--color-primary)]"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
            <span className="text-[11px] font-medium leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
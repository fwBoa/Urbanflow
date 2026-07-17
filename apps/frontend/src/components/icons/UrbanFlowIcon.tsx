"use client";

import React from "react";

export type UrbanFlowIconType = "navigation" | "action" | "transport" | "status";

interface UrbanFlowIconProps {
  type: UrbanFlowIconType;
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  ariaHidden?: boolean;
}

/**
 * Icône UrbanFlow chargée depuis le sprite SVG.
 * Les IDs du sprite suivent la convention : uf-{prefix}-{name}
 * où le préfixe est le type au pluriel (actions, navigation, transport, status).
 * Exemple : uf-navigation-home, uf-transport-bus, uf-actions-locate.
 */
const SPRITE_PREFIX: Record<UrbanFlowIconType, string> = {
  navigation: "navigation",
  action: "actions",
  transport: "transport",
  status: "status",
};

export default function UrbanFlowIcon({
  type,
  name,
  size = 24,
  className = "",
  style,
  ariaLabel,
  ariaHidden = true,
}: UrbanFlowIconProps) {
  const href = `/assets/urbanflow/icons/urbanflow-icons.svg#uf-${SPRITE_PREFIX[type]}-${name}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 ${className}`}
      style={style}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    >
      <use href={href} />
    </svg>
  );
}

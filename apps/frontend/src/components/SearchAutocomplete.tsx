"use client";

import { useState, useRef, useEffect, useId, useCallback, ReactNode } from "react";
import { MapPin, Building2 } from "lucide-react";
import SearchBar from "./SearchBar";
import type { PrimStop, GeocodeResult } from "@/services/api";

type SuggestionItem =
  | { type: "stop"; data: PrimStop }
  | { type: "address"; data: GeocodeResult };

interface SearchAutocompleteProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSelect?: (item: SuggestionItem) => void;
  onSubmit?: () => void;
  /** Liste complète de suggestions (arrêts + adresses mélangées). Prend le pas sur stopSuggestions/addressSuggestions. */
  suggestions?: SuggestionItem[];
  /** Arrêts à afficher (utilisé si `suggestions` n'est pas fourni). */
  stopSuggestions?: PrimStop[];
  /** Adresses à afficher (utilisé si `suggestions` n'est pas fourni). */
  addressSuggestions?: GeocodeResult[];
  isLoading?: boolean;
  /** Couleur de l'icône d'adresse */
  addressIconColor?: string;
  /** Élément à droite de l'input (ex: bouton géolocalisation) */
  rightElement?: ReactNode;
  disabled?: boolean;
}

function StopIcon({ arrtype }: { arrtype: string }) {
  const color =
    arrtype === "metro" ? "var(--color-metro)"
    : arrtype === "bus" ? "var(--color-bus)"
    : arrtype === "rer" || arrtype === "train" ? "var(--color-rer)"
    : arrtype === "tram" ? "var(--color-tram)"
    : "var(--color-primary)";
  return <MapPin size={14} style={{ color }} />;
}

export default function SearchAutocomplete({
  placeholder = "Rechercher…",
  value = "",
  onChange,
  onSelect,
  onSubmit,
  suggestions: suggestionsProp,
  stopSuggestions = [],
  addressSuggestions = [],
  isLoading = false,
  addressIconColor = "var(--color-primary)",
  rightElement,
  disabled = false,
}: SearchAutocompleteProps) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = suggestionsProp ?? [
    ...stopSuggestions.slice(0, 3).map((s) => ({ type: "stop" as const, data: s })),
    ...addressSuggestions.slice(0, 3).map((a) => ({ type: "address" as const, data: a })),
  ];

  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [isOpen, setIsOpen] = useState(false);

  const resetHighlight = useCallback(() => setHighlightedIndex(-1), []);

  const hasOptions = suggestions.length > 0 && value.length > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!hasOptions) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          onSelect?.(suggestions[highlightedIndex]);
          setIsOpen(false);
          resetHighlight();
        } else {
          onSubmit?.();
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        resetHighlight();
        inputRef.current?.focus();
        break;
      case "Tab":
        setIsOpen(false);
        resetHighlight();
        break;
    }
  };

  const handleSelect = (item: SuggestionItem) => {
    onSelect?.(item);
    setIsOpen(false);
    resetHighlight();
  };

  const activeDescendantId =
    highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined;

  // Scroll l'option surlignée dans la vue
  useEffect(() => {
    if (highlightedIndex >= 0) {
      const el = document.getElementById(`${listboxId}-option-${highlightedIndex}`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, listboxId]);

  return (
    <div className="relative">
      <SearchBar
        ref={inputRef}
        inputId={inputId}
        placeholder={placeholder}
        value={value}
        onChange={(v) => {
          onChange?.(v);
          setIsOpen(v.length > 0);
          if (v.length === 0) resetHighlight();
        }}
        onSubmit={onSubmit}
        isLoading={isLoading}
        ariaControls={listboxId}
        ariaExpanded={hasOptions && isOpen}
        ariaActiveDescendant={activeDescendantId}
        rightElement={rightElement}
        disabled={disabled}
        onKeyDown={handleKeyDown}
      />

      {hasOptions && isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={placeholder}
          className="absolute z-10 left-0 right-0 top-full mt-1 bg-background rounded-lg shadow-lg border border-[var(--color-border)] max-h-52 overflow-y-auto"
        >
          {suggestions.map((item, index) => {
            const isHighlighted = index === highlightedIndex;

            if (item.type === "stop") {
              const stop = item.data;
              const modesText = stop.arrmodes?.length ? stop.arrmodes.join(" · ") : "Arrêt";
              return (
                <div
                  key={`stop-${stop.arrid}-${index}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isHighlighted}
                  tabIndex={-1}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 cursor-pointer ${
                    isHighlighted ? "bg-[var(--color-surface)]" : ""
                  }`}
                >
                  <StopIcon arrtype={stop.arrtype} />
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{stop.arrname}</span>
                    <span className="text-[var(--color-text-tertiary)] text-xs truncate block">
                      {stop.arrmodes?.length ? `${modesText} · ${stop.arrtown}` : `${stop.arrtown} · Arrêt`}
                    </span>
                  </div>
                </div>
              );
            }

            const addr = item.data;
            return (
              <div
                key={`addr-${addr.label}-${index}`}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={isHighlighted}
                tabIndex={-1}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 cursor-pointer ${
                  isHighlighted ? "bg-[var(--color-surface)]" : ""
                }`}
              >
                <Building2 size={14} style={{ color: addressIconColor }} />
                <div className="flex-1 min-w-0">
                  <span className="truncate block">{addr.label}</span>
                  <span className="text-[var(--color-text-tertiary)] text-xs">
                    {addr.postcode} {addr.city} · Adresse
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {value.length > 0 && suggestions.length === 0 && !isLoading && isOpen && (
        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-background rounded-lg shadow-lg border border-[var(--color-border)]">
          <div className="px-3 py-3 text-xs text-[var(--color-text-tertiary)] text-center">
            Aucun résultat à Paris. UrbanFlow couvre uniquement Paris et ses arrêts de transport.
          </div>
        </div>
      )}
    </div>
  );
}

export type { SuggestionItem };

"use client";

import { Loader2 } from "lucide-react";
import { forwardRef, useId } from "react";
import UrbanFlowIcon from "./icons/UrbanFlowIcon";

interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  /** Affiche un spinner à droite (état de chargement des suggestions) */
  isLoading?: boolean;
  /** Message d'erreur / texte d'aide */
  helperText?: string;
  /** Id unique pour lier l'input à ses suggestions (autocomplete) */
  inputId?: string;
  /** Pour autocomplete : l'input contrôle une listebox */
  ariaControls?: string;
  /** Pour autocomplete : la liste est-elle ouverte ? */
  ariaExpanded?: boolean;
  /** Pour autocomplete : id de l'option actuellement surlignée */
  ariaActiveDescendant?: string;
  /** Élément React à afficher à droite (ex: bouton géolocalisation) */
  rightElement?: React.ReactNode;
  /** Désactiver l'input */
  disabled?: boolean;
  /** Référence pour focus programmatique depuis le parent */
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      placeholder = "D'où partez-vous ?",
      value = "",
      onChange,
      onSubmit,
      isLoading = false,
      helperText,
      inputId,
      ariaControls,
      ariaExpanded,
      ariaActiveDescendant,
      rightElement,
      disabled = false,
      onKeyDown,
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = inputId ?? generatedId;
    const hasValue = value.length > 0;
    const describedBy = helperText ? `${id}-helper` : undefined;

    return (
      <div className="relative">
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>

        {/* Icône de recherche */}
        <UrbanFlowIcon
          type="navigation"
          name="search"
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none"
        />

        <input
          ref={ref}
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (!e.defaultPrevented && e.key === "Enter") {
              e.preventDefault();
              onSubmit?.();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={placeholder}
          aria-describedby={describedBy}
          aria-controls={ariaControls}
          aria-expanded={ariaExpanded}
          aria-activedescendant={ariaActiveDescendant}
          role={ariaControls ? "combobox" : "searchbox"}
          autoComplete="off"
          className="w-full h-[52px] pl-12 pr-11 rounded-[var(--cta-radius)] bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        />

        {/* Actions à droite : clear, loading, ou élément custom */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && !rightElement && (
            <Loader2
              size={18}
              className="animate-spin text-[var(--color-primary)]"
              aria-hidden="true"
            />
          )}

          {!isLoading && hasValue && onChange && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="flex items-center justify-center w-7 h-7 rounded-full text-[var(--color-text-tertiary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-colors"
              aria-label="Effacer la recherche"
            >
              <UrbanFlowIcon type="action" name="close" size={16} />
            </button>
          )}

          {rightElement}
        </div>

        {/* Texte d'aide / erreur */}
        {helperText && (
          <p
            id={describedBy}
            className="mt-1.5 text-xs text-[var(--color-text-tertiary)]"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

SearchBar.displayName = "SearchBar";

export default SearchBar;

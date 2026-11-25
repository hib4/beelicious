'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Beelicious-styled single select (WAI-ARIA "select-only combobox").
 * Focus stays on the trigger; the listbox is driven by aria-activedescendant.
 * A hidden input keeps `name` working inside server-action forms.
 */
export function Select({
  label,
  options,
  value,
  defaultValue,
  onChange,
  name,
  hideLabel = false,
  disabled = false,
  className = '',
}: {
  label: string;
  options: SelectOption[];
  value?: string | undefined;
  defaultValue?: string | undefined;
  onChange?: (value: string) => void;
  name?: string | undefined;
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const [inner, setInner] = useState(
    defaultValue ?? value ?? options[0]?.value ?? '',
  );
  const current = value ?? inner;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === current),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    setOpen(false);
    if (!option || option.value === current) return;
    if (value === undefined) setInner(option.value);
    onChange?.(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!open) return show();
        setActive((index) =>
          event.key === 'ArrowDown'
            ? Math.min(last, index + 1)
            : Math.max(0, index - 1),
        );
        return;
      case 'Home':
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActive(event.key === 'Home' ? 0 : last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) choose(active);
        else show();
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      case 'Tab':
        if (open) choose(active);
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          const now = Date.now();
          typed.current.text =
            (now - typed.current.at > 700 ? '' : typed.current.text) +
            event.key.toLocaleLowerCase('id');
          typed.current.at = now;
          const match = options.findIndex((option) =>
            option.label.toLocaleLowerCase('id').startsWith(typed.current.text),
          );
          if (match >= 0) {
            if (open) setActive(match);
            else choose(match);
          }
        }
    }
  };

  return (
    <div className={`dash-field ${className}`.trim()}>
      <span id={labelId} className={hideLabel ? 'sr-only' : 'dash-field-label'}>
        {label}
      </span>
      <div className="dash-select" ref={root}>
        <button
          type="button"
          role="combobox"
          aria-labelledby={labelId}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${id}-option-${active}` : undefined}
          className="dash-select-trigger"
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={onKeyDown}
        >
          <span className="dash-select-value">
            {options[selectedIndex]?.label ?? ''}
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="dash-select-list"
          hidden={!open}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-option-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === selectedIndex}
              className={index === active ? 'is-active' : undefined}
              onPointerEnter={() => setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {index === selectedIndex && (
                <Check size={16} aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
        {name && <input type="hidden" name={name} value={current} />}
      </div>
    </div>
  );
}

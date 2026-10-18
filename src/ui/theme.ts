// Light / dark / system theme. Stored per browser (it is a viewer preference, not part of a project).
// index.html applies the saved choice before first paint; this wires up the switch.

import { byId } from './dom';

const STORAGE_KEY = 'maxtabs.theme';
type ThemeChoice = 'system' | 'light' | 'dark';

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyChoice(choice: ThemeChoice, buttons: HTMLButtonElement[]): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
  }
}

export function setupTheme(): void {
  const group = byId('theme-switch');
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[data-theme-choice]')];
  applyChoice(readChoice(), buttons);
  group.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-theme-choice]');
    if (!button) return;
    const choice = button.dataset.themeChoice as ThemeChoice;
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch { /* The choice still applies for this session. */ }
    applyChoice(choice, buttons);
  });
}

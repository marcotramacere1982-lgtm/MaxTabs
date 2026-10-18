import { byId } from './dom';

/** Close behaviour for the top-bar menu. */
export function setupMenu(): void {
  const menu = byId<HTMLDetailsElement>('app-menu');

  // Close when clicking outside (but not when answering a dialog the menu opened).
  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (menu.open && !menu.contains(target) && !target.closest('dialog')) {
      menu.open = false;
    }
  });

  // Close with Escape and return focus to the menu trigger.
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      menu.open = false;
      menu.querySelector('summary')?.focus();
      event.preventDefault();
    }
  });
}

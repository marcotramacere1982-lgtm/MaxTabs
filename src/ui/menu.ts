import { byId } from './dom';

export function setupMenu(): void {
  const menu = byId<HTMLDetailsElement>('app-menu');

  const projectDestination = byId('menu-project-controls');
  const instrumentDestination = byId('menu-instrument-controls');
  const rhythmDestination = byId('menu-rhythm-controls');

  // Move the complete project toolbar.
  const projectToolbar =
    document.querySelector('.project-controls');

  if (projectToolbar) {
    projectDestination.append(projectToolbar);
  }

  // Move only Instrument, Tuning and Frets.
  // Scale controls remain visible in the header.
  for (const id of ['instrument-select', 'tuning-select', 'fret-count']) {
    const label = document.querySelector(`label[for="${id}"]`);
    const control = document.getElementById(id);

    if (label) {
      instrumentDestination.append(label);
    }

    if (control) {
      instrumentDestination.append(control);
    }
  }

  // Move the rhythm-import row, including its reset and status.
  const rhythmInput = document.getElementById('rhythm-file');
  const rhythmToolbar = rhythmInput?.closest('.rhythm-controls');

  if (rhythmToolbar) {
    rhythmDestination.append(rhythmToolbar);
  }

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

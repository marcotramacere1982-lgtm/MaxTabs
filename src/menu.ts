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

  // Move only Instrument and Frets.
  // Scale controls remain visible in the header.
  for (const id of ['instrument-select', 'fret-count']) {
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

  // Close when clicking outside.
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target as Node)) {
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

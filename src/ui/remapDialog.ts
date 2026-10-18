import { byId } from './dom';
import type { RemapMode } from '../model/remap';

/**
 * Ask how notes should move to a new instrument or tuning. Resolves to null if cancelled.
 * The answer is delivered from the button click itself (not the later `close` event),
 * so no other input can be handled between the choice and the edit.
 */
export function askRemapMode(message: string): Promise<RemapMode | null> {
  const dialog = byId<HTMLDialogElement>('remap-dialog');
  byId('remap-message').textContent = message;

  return new Promise(resolve => {
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button[value]')];
    const finish = (value: string): void => {
      for (const button of buttons) button.removeEventListener('click', onClick);
      dialog.removeEventListener('cancel', onCancel);
      dialog.close();
      resolve(value === 'pitch' || value === 'fret' ? value : null);
    };
    const onClick = (event: MouseEvent): void => {
      event.preventDefault();
      finish((event.currentTarget as HTMLButtonElement).value);
    };
    // Escape key.
    const onCancel = (event: Event): void => {
      event.preventDefault();
      finish('cancel');
    };
    for (const button of buttons) button.addEventListener('click', onClick);
    dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
  });
}

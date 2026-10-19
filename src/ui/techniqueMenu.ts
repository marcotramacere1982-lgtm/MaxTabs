// Technique menu: opened by right-clicking (or long-pressing) a note in the tab, or from the
// Techniques button. Items show what is set on the current note(s) and stay open for more edits.

import type { MarkState, NoteMark } from '../model/editing';
import type { Stroke } from '../model/song';

export type MenuAction =
  | { type: 'mark'; mark: NoteMark }
  | { type: 'bend'; semitones: number | null }
  | { type: 'release' }
  | { type: 'stroke'; stroke: Stroke };

export const MARK_ITEMS: { mark: NoteMark; label: string; key: string }[] = [
  { mark: 'slur', label: 'Hammer-on / pull-off', key: 'H' },
  { mark: 'slide', label: 'Slide', key: 'S' },
  { mark: 'vibrato', label: 'Vibrato', key: 'V' },
  { mark: 'tie', label: 'Tie', key: 'T' },
  { mark: 'letRing', label: 'Let ring', key: 'L' },
  { mark: 'dead', label: 'Mute (x)', key: 'X' }
];

export const BEND_STEPS = [0.5, 1, 1.5, 2];
const BEND_LABELS: Record<number, string> = { 0.5: '½', 1: 'Full', 1.5: '1½', 2: '2' };

export class TechniqueMenu {
  private readonly root: HTMLElement;
  private outside: ((event: PointerEvent) => void) | null = null;

  constructor(private readonly onAction: (action: MenuAction) => void) {
    this.root = document.createElement('div');
    this.root.className = 'panel technique-menu';
    this.root.setAttribute('role', 'menu');
    this.root.setAttribute('aria-label', 'Techniques');
    this.root.hidden = true;
    document.body.append(this.root);
    this.root.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button || button.disabled) return;
      const { mark, bend, stroke } = button.dataset;
      if (mark) this.onAction({ type: 'mark', mark: mark as NoteMark });
      else if (bend !== undefined) this.onAction({ type: 'bend', semitones: bend === '' ? null : Number(bend) });
      else if (button.dataset.release !== undefined) this.onAction({ type: 'release' });
      else if (stroke) this.onAction({ type: 'stroke', stroke: stroke as Stroke });
    });
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Open at a screen position (kept inside the window). */
  open(x: number, y: number, state: MarkState): void {
    this.render(state);
    this.root.hidden = false;
    const { width, height } = this.root.getBoundingClientRect();
    this.root.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
    this.root.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
    this.root.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    if (!this.outside) {
      this.outside = event => {
        if (!this.root.contains(event.target as Node)) this.close();
      };
      // Defer so the click that opened the menu does not close it.
      setTimeout(() => this.outside && document.addEventListener('pointerdown', this.outside, true));
    }
  }

  /** Refresh the ticks after an edit, keeping the menu open. */
  update(state: MarkState): void {
    if (this.isOpen) this.render(state);
  }

  close(): void {
    this.root.hidden = true;
    if (this.outside) document.removeEventListener('pointerdown', this.outside, true);
    this.outside = null;
  }

  private render(state: MarkState): void {
    const root = this.root;
    root.replaceChildren();
    const title = (text: string): void => {
      const p = document.createElement('p');
      p.className = 'menu-title';
      p.textContent = text;
      root.append(p);
    };
    const item = (label: string, key: string, checked: boolean, enabled: boolean, data: Record<string, string>): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      button.setAttribute('role', 'menuitemcheckbox');
      button.setAttribute('aria-checked', String(checked));
      button.disabled = !enabled;
      Object.assign(button.dataset, data);
      const name = document.createElement('span');
      name.textContent = label;
      button.append(name);
      if (key) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        button.append(kbd);
      }
      return button;
    };

    title(!state.hasNotes ? 'No note at the cursor' : state.singleNote ? 'Selected note' : 'Note or chord');
    const marks = document.createElement('div');
    marks.className = 'menu-list';
    for (const { mark, label, key } of MARK_ITEMS) {
      marks.append(item(label, key, state.on[mark], state.available[mark], { mark }));
    }
    root.append(marks);

    title('Bend (B)');
    const bends = document.createElement('div');
    bends.className = 'chips';
    for (const step of BEND_STEPS) {
      const chip = item(BEND_LABELS[step] ?? String(step), '', state.bend?.semitones === step, state.hasNotes,
        { bend: state.bend?.semitones === step ? '' : String(step) });
      chip.className = 'chip';
      bends.append(chip);
    }
    const release = item('Release', '', Boolean(state.bend?.release), Boolean(state.bend), { release: '' });
    release.className = 'chip chip-wide';
    bends.append(release);
    root.append(bends);

    title('Stroke');
    const strokes = document.createElement('div');
    strokes.className = 'chips';
    for (const [stroke, label] of [['down', '⊓ Down (D)'], ['up', 'V Up (U)']] as const) {
      const chip = item(label, '', state.stroke === stroke, state.hasNotes, { stroke });
      chip.className = 'chip chip-wide';
      strokes.append(chip);
    }
    root.append(strokes);
  }
}

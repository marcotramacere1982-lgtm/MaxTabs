/**
 * Take keyboard focus away from a toolbar control when the user starts working on the
 * fretboard or tab, so keys like Enter act on the music instead of pressing that control again.
 */
export function releaseControlFocus(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches('button, summary, input[type="checkbox"]')) active.blur();
}

/** Look up a required element by id; throws if the page markup is missing it. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

// Snapshot undo/redo. Every edit runs on a deep copy of the present state and is only
// committed if it completes (and passes `check`), so a failed edit never leaves partial changes.

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(
    private current: T,
    private readonly check: (state: T) => void = () => {},
    private readonly limit = 200
  ) {}

  /** The current state. Treat as read-only; change it through `apply`. */
  get present(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Run an edit; returns its result. Throws (leaving everything unchanged) if the edit or check fails. */
  apply<R>(edit: (draft: T) => R): R {
    const draft = structuredClone(this.current);
    const result = edit(draft);
    this.check(draft);
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = draft;
    this.future = [];
    return result;
  }

  /**
   * Change the present state without creating an undo step (e.g. moving the cursor).
   * Undo still returns to the state as it was before the last recorded edit.
   */
  amend(edit: (draft: T) => void): void {
    const draft = structuredClone(this.current);
    edit(draft);
    this.check(draft);
    this.current = draft;
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (previous === undefined) return false;
    this.future.push(this.current);
    this.current = previous;
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (next === undefined) return false;
    this.past.push(this.current);
    this.current = next;
    return true;
  }

  /** Replace the state and forget all history (e.g. after opening a file). */
  reset(state: T): void {
    this.check(state);
    this.current = state;
    this.past = [];
    this.future = [];
  }
}

import { byId } from './dom';
import { errorMessage } from '../errors';
import {
  parseProject,
  serializeProject,
  type LoadedProject,
  type ProjectFile,
  type ViewPrefs
} from '../io/projectFormat';
import type { EditorDoc } from '../model/song';

const STORAGE_KEY = 'maxtabs.project';
/** Where the alpha (format v1) kept its browser save. */
const LEGACY_STORAGE_KEY = 'maxtabs.project.v1';
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface ProjectFilesOptions {
  isBusy: () => boolean;
  getProject: () => { doc: EditorDoc; view: ViewPrefs };
  onLoaded: (project: LoadedProject) => void;
}

export function setupProjectFiles({ isBusy, getProject, onLoaded }: ProjectFilesOptions): void {
  const titleInput = byId<HTMLInputElement>('project-title');
  const saveButton = byId<HTMLButtonElement>('project-save');
  const loadButton = byId<HTMLButtonElement>('project-load');
  const exportButton = byId<HTMLButtonElement>('project-export');
  const status = byId('project-status');
  const openInput = byId<HTMLInputElement>('project-open');

  function report(message: string): void {
    status.textContent = message;
  }

  function captureProject(): ProjectFile {
    const { doc, view } = getProject();
    return serializeProject(titleInput.value, doc, view);
  }

  /** Confirm, then hand a validated project to the app. */
  function offer(project: LoadedProject, verb: 'Load' | 'Open'): boolean {
    const upgraded = project.migratedFrom ? ` It will be upgraded from format v${project.migratedFrom}.` : '';
    if (!window.confirm(`${verb} “${project.title}” and replace the current project? ` +
      `Unsaved changes, including undo history, will be lost.${upgraded}`)) return false;
    titleInput.value = project.title;
    onLoaded(project);
    return true;
  }

  saveButton.addEventListener('click', () => {
    if (isBusy()) {
      report('Stop playback before saving.');
      return;
    }

    try {
      if (localStorage.getItem(STORAGE_KEY) &&
        !window.confirm('Replace the existing browser save? Export it first if you want to keep a separate copy.')) {
        return;
      }
      const project = captureProject();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      report(`Saved “${project.title}” in this browser.`);
    } catch (error) {
      console.error('Project save failed:', error);
      report('Save failed. Try exporting a JSON copy instead.');
    }
  });

  loadButton.addEventListener('click', () => {
    if (isBusy()) {
      report('Stop playback before loading.');
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) {
        report('No browser save found.');
        return;
      }
      // Validate fully before changing the current project.
      const project = parseProject(JSON.parse(raw));
      if (offer(project, 'Load')) report(`Loaded “${project.title}”.`);
    } catch (error) {
      console.error('Project load failed:', error);
      report(`Load failed: ${errorMessage(error)}`);
    }
  });

  openInput.addEventListener('change', async () => {
    const file = openInput.files?.[0];
    if (!file) return;

    try {
      if (isBusy()) {
        report('Stop playback before opening a project.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) throw new Error('Project file must be smaller than 5 MB.');
      const project = parseProject(JSON.parse(await file.text()));
      // Playback may have started while the file was being read.
      if (isBusy()) {
        report('Stop playback before opening a project.');
        return;
      }
      if (offer(project, 'Open')) report(`Opened “${project.title}”.`);
    } catch (error) {
      console.error('Project open failed:', error);
      report(`Open failed: ${errorMessage(error)}`);
    } finally {
      // Allow selecting the same file again.
      openInput.value = '';
    }
  });

  exportButton.addEventListener('click', () => {
    if (isBusy()) {
      report('Stop playback before exporting.');
      return;
    }

    try {
      const project = captureProject();
      downloadProject(project);
      report(`Export requested for “${project.title}”.`);
    } catch (error) {
      console.error('Project export failed:', error);
      report(`Export failed: ${errorMessage(error)}`);
    }
  });
}

function downloadProject(project: ProjectFile): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const filename = project.title
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'maxtabs-project';

  link.href = url;
  link.download = `${filename}.maxtabs.json`;
  document.body.append(link);
  link.click();
  link.remove();

  // Leave enough time for the browser to begin the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

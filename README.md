Even though the app can ultimately be packaged as one self-contained HTML file, developing it as separate files is much easier to maintain. Later, you can bundle or inline everything into a single index.html if you want a portable file.

Folder/file	Purpose
index.html	App shell: fretboard, tab area, transport controls, chord panel
styles/	All CSS, keeping UI styling separate from behaviour
scripts/	JavaScript modules, each with one clear responsibility
data/	Editable JSON for tunings, instruments, and chord shapes
docs/	Durable project memory for you and any AI assistant
tests/	Manual test checklists now; automated tests later
examples/	Sample songs for testing import/export and playback
.vscode/	Workspace-specific editor settings
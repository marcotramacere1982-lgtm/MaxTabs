# MaxTabs

A browser-based guitar and bass tab builder: click a fretboard to write tab, overlay scales and modes to guide composition, play it back, and import mixed-meter rhythm charts from the companion metronome.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript strict type check |
| `npm run build` | Type check, then production build into `dist/` |
| `npm run preview` | Serve the production build |

## Layout

| Path | Purpose |
|---|---|
| `index.html` | App shell |
| `src/` | TypeScript source; each module has one responsibility |
| `src/importers/` | Importers for external formats (metronomo-composto rhythm charts) |
| `src/styles/` | CSS |
| `public/` | Static files copied as-is, including the companion `metronomo-composto.html` |
| `tests/unit/` | Vitest unit tests; `tests/fixtures/` holds sample files |
| `tests/manual-test-checklist.md` | Browser checks that unit tests cannot cover |
| `docs/` | Architecture, decisions, roadmap |

The pre-migration vanilla JS alpha is preserved at the git tag `alpha-concept`.

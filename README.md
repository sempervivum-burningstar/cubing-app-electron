# Cubing App (Electron)

Cube collection, lube collection and speedcubing timer built with Electron.

## Features

- Cube and lube collection tracking
- Speedcubing timer
- Local storage via sql.js (SQLite in the browser/Node)

### Getting Started

```bash
git clone https://github.com/sempervivum-burningstar/cubing-app-electron
cd cubing-app-electron
npm install
npm start
```

> Requires Node.js 18+. Data path shown in sidebar footer.

## Project Structure

- `main.js` — Electron main process
- `preload.js` — Preload script
- `renderer/` — Renderer (UI) files
- `database.js` — Database layer (sql.js)
- `scrambler.js` — Scramble generation

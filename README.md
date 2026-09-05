# Cubing App (Electron)

Cube collection, lube collection and speedcubing timer built with Electron.

## Features

- Cube and lube collection tracking
- Speedcubing timer
- Local storage via sql.js (SQLite in the browser/Node)

## Getting Started

```bash
npm install
npm start
```

## Project Structure

- `main.js` — Electron main process
- `preload.js` — Preload script
- `renderer/` — Renderer (UI) files
- `database.js` — Database layer (sql.js)
- `scrambler.js` — Scramble generation

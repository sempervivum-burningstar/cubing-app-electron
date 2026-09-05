const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const scrambler = require('./scrambler');

let win = null;

function createWindow() {
    win = new BrowserWindow({
        width: 960,
        height: 700,
        minWidth: 840,
        minHeight: 580,
        title: 'Cube Collection Manager',
        backgroundColor: '#f0f0f0',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    win.setMenuBarVisibility(false);
    win.on('page-title-updated', (e) => e.preventDefault());
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function csvEscape(value) {
    const s = String(value);
    if (/[",\r\n]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function writeCsv(fileName, header, rows) {
    const lines = [header.map(csvEscape).join(',')];
    for (const row of rows) {
        lines.push(row.map(csvEscape).join(','));
    }
    const filePath = path.join(db.DATA_DIR, fileName);
    fs.writeFileSync(filePath, '\ufeff' + lines.join('\r\n') + '\r\n', 'utf8');
    return filePath;
}

function registerHandlers() {
    ipcMain.handle('db:getCubes', () => db.loadCubes());
    ipcMain.handle('db:saveCubes', (e, cubes) => db.saveCubes(cubes));
    ipcMain.handle('db:getLubes', () => db.loadLubes());
    ipcMain.handle('db:saveLubes', (e, lubes) => db.saveLubes(lubes));
    ipcMain.handle('db:getSessions', () => db.loadSessions());
    ipcMain.handle('db:saveSessions', (e, sessions) => db.saveSessions(sessions));
    ipcMain.handle('db:getTimes', () => db.loadTimes());
    ipcMain.handle('db:saveTimes', (e, times) => db.saveTimes(times));
    ipcMain.handle('db:getSettings', () => db.loadSettings());
    ipcMain.handle('db:saveSettings', (e, settings) => db.saveSettings(settings));
    ipcMain.handle('db:migrateIfNeeded', () => db.migrateIfNeeded());

    ipcMain.handle('scramble:generate', (e, puzzleId, count) =>
        scrambler.generateScramble(puzzleId, count || 1));
    ipcMain.handle('scramble:image', (e, puzzleId, scramble) =>
        scrambler.generateScrambleImage(puzzleId, scramble));

    ipcMain.handle('csv:export', (e, kind) => {
        if (kind === 'cubes') {
            const cubes = db.loadCubes();
            if (!cubes.length) {
                return { ok: false, message: 'No cubes to export.' };
            }
            const badFirst = cubes[0].kind === 'Bad';
            const header = badFirst
                ? ['Name', 'Kind']
                : ['Name', 'Brand', 'Size', 'Adjustments and Features', 'Kind'];
            const rows = cubes.map((c) => c.kind === 'Bad'
                ? [c.name, c.kind]
                : [c.name, c.brand, c.size, c.adjustments, c.kind]);
            const filePath = writeCsv('cubes_export.csv', header, rows);
            return { ok: true, filePath };
        }
        const lubes = db.loadLubes();
        if (!lubes.length) {
            return { ok: false, message: 'No lubes to export.' };
        }
        const rows = lubes.map((l) => [l.name, l.hand_feeling]);
        const filePath = writeCsv('lubes_export.csv', ['Name', 'Hand Feeling'], rows);
        return { ok: true, filePath };
    });

    ipcMain.handle('app:info', () => ({ dataDir: db.DATA_DIR }));

    ipcMain.handle('dialog:show', async (e, opts) => {
        await dialog.showMessageBox(win, {
            type: opts.type || 'info',
            title: opts.title || '',
            message: opts.message || '',
            detail: opts.detail || undefined,
            buttons: ['OK'],
            noLink: true
        });
        return true;
    });

    ipcMain.handle('dialog:confirm', async (e, opts) => {
        const result = await dialog.showMessageBox(win, {
            type: opts.type || 'question',
            title: opts.title || '',
            message: opts.message || '',
            detail: opts.detail || undefined,
            buttons: ['Yes', 'No'],
            defaultId: 0,
            cancelId: 1,
            noLink: true
        });
        return result.response === 0;
    });
}

app.whenReady().then(async () => {
    try {
        await db.open();
        registerHandlers();
        createWindow();
    } catch (err) {
        dialog.showErrorBox('Startup Error', String(err.message || err));
        app.quit();
    }
});

app.on('window-all-closed', () => {
    scrambler.shutdown();
    app.quit();
});

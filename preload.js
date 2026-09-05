const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args).catch((err) => {
        let msg = String(err && err.message ? err.message : err);
        msg = msg.replace(/^Error invoking remote method '[^']+':\s*/, '');
        throw new Error(msg);
    });
}

contextBridge.exposeInMainWorld('api', {
    getCubes: () => invoke('db:getCubes'),
    saveCubes: (cubes) => invoke('db:saveCubes', cubes),
    getLubes: () => invoke('db:getLubes'),
    saveLubes: (lubes) => invoke('db:saveLubes', lubes),
    getSessions: () => invoke('db:getSessions'),
    saveSessions: (sessions) => invoke('db:saveSessions', sessions),
    getTimes: () => invoke('db:getTimes'),
    saveTimes: (times) => invoke('db:saveTimes', times),
    getSettings: () => invoke('db:getSettings'),
    saveSettings: (settings) => invoke('db:saveSettings', settings),
    migrateIfNeeded: () => invoke('db:migrateIfNeeded'),
    generateScramble: (puzzleId, count) => invoke('scramble:generate', puzzleId, count),
    generateScrambleImage: (puzzleId, scramble) => invoke('scramble:image', puzzleId, scramble),
    exportCsv: (kind) => invoke('csv:export', kind),
    getInfo: () => invoke('app:info'),
    showDialog: (opts) => invoke('dialog:show', opts),
    showConfirm: (opts) => invoke('dialog:confirm', opts)
});

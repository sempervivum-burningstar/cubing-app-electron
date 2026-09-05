const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DATA_DIR = __dirname;
const DB_FILE = path.join(DATA_DIR, 'cubing.db');
const CUBES_FILE = path.join(DATA_DIR, 'cubes.txt');
const LUBES_FILE = path.join(DATA_DIR, 'lubes.txt');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.txt');
const TIMES_FILE = path.join(DATA_DIR, 'times.txt');

const DELIMITER = '|';

const DEFAULT_SESSIONS = [
    ['2x2', '222'],
    ['3x3', '333'],
    ['4x4', '444'],
    ['5x5', '555'],
    ['6x6', '666'],
    ['7x7', '777'],
    ['3x3 OH', '333oh'],
    ['Clock', 'clock'],
    ['Megaminx', 'minx'],
    ['Pyraminx', 'pyram'],
    ['Skewb', 'skewb'],
    ['Square-1', 'sq1'],
    ['3x3 BLD', '333bf'],
    ['4x4 BLD', '444bf'],
    ['5x5 BLD', '555bf'],
    ['3x3 FM', '333fm'],
    ['3x3 Multi-Blind', '333mbf']
];

const WCA_PUZZLE_IDS = new Set(DEFAULT_SESSIONS.map(([, pid]) => pid));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cubes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    brand TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL DEFAULT '',
    adjustments TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lubes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    hand_feeling TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    puzzle_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS times (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL,
    time_ms INTEGER NOT NULL,
    penalty TEXT NOT NULL DEFAULT '0',
    scramble TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

let db = null;

async function open() {
    if (db) {
        return;
    }
    const SQL = await initSqlJs({
        locateFile: (file) => require.resolve('sql.js/dist/' + file)
    });
    const buf = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE) : null;
    db = buf && buf.length > 0 ? new SQL.Database(buf) : new SQL.Database();
    db.run(SCHEMA);
}

function persist() {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(db.export()));
    fs.renameSync(tmp, DB_FILE);
}

function all(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        return rows;
    } finally {
        stmt.free();
    }
}

function run(sql, params = []) {
    db.run(sql, params);
}

function normalizeField(value) {
    return String(value).trim();
}

function fixKnownTypos(value) {
    return value.replace(/adjstments/g, 'adjustments');
}

function parseCubeLine(line) {
    line = line.trim();
    if (!line) {
        return null;
    }
    let parts;
    if (line.includes(DELIMITER)) {
        parts = line.split(DELIMITER).map(fixKnownTypos);
        if (parts.length === 2 && parts[1] === 'Bad') {
            return { kind: 'Bad', name: normalizeField(parts[0]), brand: '', size: '', adjustments: '' };
        }
    } else {
        parts = line.trim().split(/\s+/).map(fixKnownTypos);
    }
    if (parts.length === 2 && parts[1] === 'Bad') {
        return { kind: 'Bad', name: normalizeField(parts[0]), brand: '', size: '', adjustments: '' };
    }
    if (parts.length >= 5) {
        const kind = parts[4];
        if (kind === 'Flagship' || kind === 'Regular') {
            return {
                kind,
                brand: normalizeField(parts[0]),
                size: normalizeField(parts[1]),
                adjustments: normalizeField(parts[2]),
                name: normalizeField(parts[3])
            };
        }
    }
    return null;
}

function cubeLine(cube) {
    if (cube.kind === 'Bad') {
        return cube.name + DELIMITER + 'Bad';
    }
    return [cube.brand, cube.size, cube.adjustments, cube.name, cube.kind].join(DELIMITER);
}

function sortCubes(cubes) {
    return cubes.slice().sort((a, b) => {
        const ka = [(a.kind === 'Bad' ? 1 : 0), cubeLine(a).toLowerCase()];
        const kb = [(b.kind === 'Bad' ? 1 : 0), cubeLine(b).toLowerCase()];
        return ka[0] !== kb[0] ? ka[0] - kb[0]
            : ka[1] < kb[1] ? -1
            : ka[1] > kb[1] ? 1 : 0;
    });
}

function loadCubes() {
    return all('SELECT name, brand, size, adjustments, kind FROM cubes ORDER BY id').map((row) => ({
        name: row.name,
        brand: row.brand,
        size: row.size,
        adjustments: row.adjustments,
        kind: row.kind
    }));
}

function saveCubes(cubes) {
    run('DELETE FROM cubes');
    for (const cube of cubes) {
        run(
            'INSERT INTO cubes (name, brand, size, adjustments, kind) VALUES (?, ?, ?, ?, ?)',
            [cube.name, cube.brand || '', cube.size || '', cube.adjustments || '', cube.kind]
        );
    }
    persist();
}

function parseLubeLine(line) {
    line = line.trim();
    if (!line) {
        return null;
    }
    let name, feeling;
    if (line.includes(DELIMITER)) {
        const parts = line.split(DELIMITER);
        if (parts.length !== 2) {
            return null;
        }
        name = parts[0];
        feeling = parts[1];
    } else {
        const m = line.match(/^(\S+)\s+(.*)$/);
        if (!m) {
            return null;
        }
        name = m[1];
        feeling = m[2];
    }
    return { name: normalizeField(name), hand_feeling: normalizeField(feeling) };
}

function lubeLine(lube) {
    return lube.name + DELIMITER + lube.hand_feeling;
}

function sortLubes(lubes) {
    return lubes.slice().sort((a, b) =>
        lubeLine(a).toLowerCase() < lubeLine(b).toLowerCase() ? -1
        : lubeLine(a).toLowerCase() > lubeLine(b).toLowerCase() ? 1 : 0
    );
}

function loadLubes() {
    return all('SELECT name, hand_feeling FROM lubes ORDER BY id').map((row) => ({
        name: row.name,
        hand_feeling: row.hand_feeling
    }));
}

function saveLubes(lubes) {
    run('DELETE FROM lubes');
    for (const lube of lubes) {
        run('INSERT INTO lubes (name, hand_feeling) VALUES (?, ?)', [lube.name, lube.hand_feeling]);
    }
    persist();
}

function loadSessions() {
    return all('SELECT name, puzzle_id FROM sessions ORDER BY id')
        .filter((row) => WCA_PUZZLE_IDS.has(row.puzzle_id))
        .map((row) => [row.name, row.puzzle_id]);
}

function saveSessions(sessions) {
    run('DELETE FROM sessions');
    for (const [name, puzzleId] of sessions) {
        run('INSERT INTO sessions (name, puzzle_id) VALUES (?, ?)', [name, puzzleId]);
    }
    persist();
}

function normalizePenalty(value) {
    if (value === 2 || value === '2') {
        return 2;
    }
    if (value === 'D' || value === 'd') {
        return 'D';
    }
    return 0;
}

function penaltyToText(penalty) {
    if (penalty === 2) {
        return '2';
    }
    if (penalty === 'D') {
        return 'D';
    }
    return '0';
}

function parseTimesText(text) {
    const timesBySession = {};
    for (const line of text.split(/\r?\n/)) {
        const parts = line.trim().split(DELIMITER);
        if (parts.length !== 3 && parts.length !== 4) {
            continue;
        }
        const session = parts[0];
        const timeStr = parts[1];
        const penaltyStr = parts[2];
        const scramble = parts.length === 4 ? parts[3] : '';
        const timeMs = parseInt(timeStr, 10);
        if (!Number.isFinite(timeMs)) {
            continue;
        }
        const penalty = normalizePenalty(penaltyStr);
        if (!timesBySession[session]) {
            timesBySession[session] = [];
        }
        timesBySession[session].push({ timeMs, penalty, scramble });
    }
    return timesBySession;
}

function loadTimes() {
    const timesBySession = {};
    for (const row of all('SELECT session, time_ms, penalty, scramble FROM times ORDER BY id')) {
        const session = row.session;
        if (!timesBySession[session]) {
            timesBySession[session] = [];
        }
        timesBySession[session].push({
            timeMs: row.time_ms,
            penalty: normalizePenalty(row.penalty),
            scramble: row.scramble || ''
        });
    }
    return timesBySession;
}

function saveTimes(timesBySession) {
    run('DELETE FROM times');
    for (const [session, solves] of Object.entries(timesBySession)) {
        for (const solve of solves) {
            run(
                'INSERT INTO times (session, time_ms, penalty, scramble) VALUES (?, ?, ?, ?)',
                [session, solve.timeMs, penaltyToText(solve.penalty), solve.scramble || '']
            );
        }
    }
    persist();
}

function loadSettings() {
    const settings = {};
    for (const row of all('SELECT key, value FROM settings')) {
        settings[row.key] = row.value;
    }
    return settings;
}

function saveSettings(settings) {
    run('DELETE FROM settings');
    for (const [key, value] of Object.entries(settings)) {
        run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }
    persist();
}

function migrateIfNeeded() {
    const tables = ['cubes', 'lubes', 'sessions', 'times'];
    for (const table of tables) {
        const rows = all(`SELECT COUNT(*) AS cnt FROM ${table}`);
        if (rows.length && rows[0].cnt > 0) {
            return false;
        }
    }

    if (fs.existsSync(CUBES_FILE)) {
        const cubes = [];
        for (const line of fs.readFileSync(CUBES_FILE, 'utf8').split(/\r?\n/)) {
            const cube = parseCubeLine(line);
            if (cube) {
                cubes.push(cube);
            }
        }
        if (cubes.length) {
            saveCubes(sortCubes(cubes));
        }
    }

    if (fs.existsSync(LUBES_FILE)) {
        const lubes = [];
        for (const line of fs.readFileSync(LUBES_FILE, 'utf8').split(/\r?\n/)) {
            const lube = parseLubeLine(line);
            if (lube) {
                lubes.push(lube);
            }
        }
        if (lubes.length) {
            saveLubes(sortLubes(lubes));
        }
    }

    if (fs.existsSync(SESSIONS_FILE)) {
        const sessions = [];
        for (const line of fs.readFileSync(SESSIONS_FILE, 'utf8').split(/\r?\n/)) {
            const parts = line.trim().split(DELIMITER);
            if (parts.length === 2 && WCA_PUZZLE_IDS.has(parts[1])) {
                sessions.push([parts[0].trim(), parts[1]]);
            }
        }
        if (sessions.length) {
            saveSessions(sessions);
        }
    }

    if (fs.existsSync(TIMES_FILE)) {
        const timesBySession = parseTimesText(fs.readFileSync(TIMES_FILE, 'utf8'));
        if (Object.keys(timesBySession).length) {
            saveTimes(timesBySession);
        }
    }
    return true;
}

module.exports = {
    DATA_DIR,
    DEFAULT_SESSIONS,
    WCA_PUZZLE_IDS,
    open,
    loadCubes,
    saveCubes,
    sortCubes,
    loadLubes,
    saveLubes,
    sortLubes,
    loadSessions,
    saveSessions,
    loadTimes,
    saveTimes,
    loadSettings,
    saveSettings,
    migrateIfNeeded
};

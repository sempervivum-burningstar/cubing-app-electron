const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = __dirname;
const BRIDGE_SOURCE = path.join(__dirname, 'TnoodleBridge.java');

function findJarPath() {
    // 1. Environment variable override
    if (process.env.TNOODLE_JAR && fs.existsSync(process.env.TNOODLE_JAR)) {
        return process.env.TNOODLE_JAR;
    }
    // 2. Same directory as scrambler.js (dev / manual setup)
    const localJar = path.join(DATA_DIR, 'tnoodle.jar');
    if (fs.existsSync(localJar)) {
        return localJar;
    }
    // 3. Electron packaged resources directory
    const resJar = path.join(process.resourcesPath || '', 'tnoodle.jar');
    if (fs.existsSync(resJar)) {
        return resJar;
    }
    // 4. Fallback: return local path (will produce a clear error later)
    return localJar;
}

const JAR_PATH = findJarPath();

const WCA_PUZZLE_LABELS = {
    '222': '2x2x2 Cube',
    '333': '3x3x3 Cube',
    '444': '4x4x4 Cube',
    '555': '5x5x5 Cube',
    '666': '6x6x6 Cube',
    '777': '7x7x7 Cube',
    '333oh': '3x3x3 One-Handed',
    'clock': 'Clock',
    'minx': 'Megaminx',
    'pyram': 'Pyraminx',
    'skewb': 'Skewb',
    'sq1': 'Square-1',
    '333bf': '3x3x3 Blindfolded',
    '444bf': '4x4x4 Blindfolded',
    '555bf': '5x5x5 Blindfolded',
    '333fm': '3x3x3 Fewest Moves',
    '333mbf': '3x3x3 Multi-Blind'
};

const START_TIMEOUT_MS = 120000;
const REQUEST_TIMEOUT_MS = 180000;

let jarValidated = false;
let startingPromise = null;
let proc = null;
let queue = [];
let stderrTail = '';
let javaCandidatesCache = null;

function tnoodleError(message) {
    const err = new Error(message);
    err.code = 'TNOODLE';
    return err;
}

function validateJar() {
    if (jarValidated) {
        return;
    }
    if (!fs.existsSync(JAR_PATH)) {
        throw tnoodleError(
            'TNoodle jar not found at:\n  ' + JAR_PATH + '\n\n' +
            'To fix this, download tnoodle.jar from:\n' +
            '  https://github.com/thewca/tnoodle/releases\n\n' +
            'Then place it in one of these locations:\n' +
            '  • The cubing-app-electron folder (alongside scrambler.js)\n' +
            '  • Set the TNOODLE_JAR environment variable to the full path\n\n' +
            'Note: you can place it next to the .exe if this is a packaged app.'
        );
    }
    let buf;
    try {
        buf = fs.readFileSync(JAR_PATH);
    } catch (e) {
        throw tnoodleError('Could not read the TNoodle jar at: ' + JAR_PATH + '\n' + e.message);
    }
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        throw tnoodleError(
            'The TNoodle jar at: ' + JAR_PATH + '\n' +
            'is corrupt or was downloaded incompletely.\n' +
            'Please delete it and re-download TNoodle from:\n' +
            'https://github.com/thewca/tnoodle/releases'
        );
    }
    if (!buf.includes(Buffer.from('PuzzleRegistry.class'))) {
        throw tnoodleError(
            'The file at: ' + JAR_PATH + '\n' +
            'is not a TNoodle jar (missing the PuzzleRegistry class).\n' +
            'Please download the official TNoodle release from:\n' +
            'https://github.com/thewca/tnoodle/releases'
        );
    }
    jarValidated = true;
}

function findJavaCandidates() {
    if (javaCandidatesCache) {
        return javaCandidatesCache;
    }
    const candidates = [];
    const pushCandidate = (javaPath, isJdk, isComplete) => {
        if (javaPath && !candidates.some((c) => c.path === javaPath)) {
            candidates.push({
                path: javaPath,
                score: (isJdk ? 2 : 0) + (isComplete ? 1 : 0)
            });
        }
    };
    const scanDir = (dir) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const home = path.join(dir, entry.name);
            const bin = path.join(home, 'bin', 'java.exe');
            const javac = path.join(home, 'bin', 'javac.exe');
            if (fs.existsSync(bin)) {
                const complete =
                    fs.existsSync(path.join(home, 'lib', 'modules')) ||
                    fs.existsSync(path.join(home, 'lib', 'jvm.cfg'));
                pushCandidate(bin, fs.existsSync(javac), complete);
            }
            scanDir(home);
        }
    };

    // 1. Check JAVA_HOME env var (highest priority)
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
        const bin = path.join(javaHome, 'bin', 'java.exe');
        const javac = path.join(javaHome, 'bin', 'javac.exe');
        if (fs.existsSync(bin)) {
            const complete =
                fs.existsSync(path.join(javaHome, 'lib', 'modules')) ||
                fs.existsSync(path.join(javaHome, 'lib', 'jvm.cfg'));
            pushCandidate(bin, fs.existsSync(javac), complete);
        }
    }

    // 2. Scan ~/jdk/ (user can extract a JDK zip here without admin)
    const jdkRoot = path.join(os.homedir(), 'jdk');
    if (fs.existsSync(jdkRoot)) {
        scanDir(jdkRoot);
    }

    // 3. Common non-admin install locations
    const home = os.homedir();
    const extraRoots = [
        // Scoop (no admin needed)
        path.join(home, 'scoop', 'apps', 'openjdk17', 'current'),
        path.join(home, 'scoop', 'apps', 'openjdk21', 'current'),
        path.join(home, 'scoop', 'apps', 'openjdk23', 'current'),
        path.join(home, 'scoop', 'apps', 'temurin-jdk-17', 'current'),
        path.join(home, 'scoop', 'apps', 'temurin-jdk-21', 'current'),
        // User-level Adoptium / Temurin
        path.join(home, 'AppData', 'Local', 'Programs', 'Eclipse Adoptium'),
        // winget user installs
        path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'),
        // System-wide installs (readable without admin)
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\Microsoft',
        'C:\\Program Files\\Zulu',
    ];
    for (const root of extraRoots) {
        scanDir(root);
    }

    // 4. where.exe PATH lookup
    try {
        const { execFileSync } = require('child_process');
        const whereOut = execFileSync('where.exe', ['java'], {
            encoding: 'utf8',
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        });
        for (const line of whereOut.split(/\r?\n/)) {
            const p = line.trim();
            if (p && fs.existsSync(p)) {
                pushCandidate(p, false, false);
            }
        }
    } catch (e) {
    }

    candidates.sort((a, b) => b.score - a.score);
    javaCandidatesCache = candidates;
    return candidates;
}

function spawnBridge(javaExe) {
    stderrTail = '';
    proc = spawn(javaExe, ['-Dfile.encoding=UTF-8', '-cp', JAR_PATH, BRIDGE_SOURCE], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    proc.stdout.setEncoding('utf8');
    let stdoutBuf = '';
    proc.stdout.on('data', (chunk) => {
        stdoutBuf += chunk;
        let idx;
        while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
            const line = stdoutBuf.slice(0, idx).replace(/\r$/, '');
            stdoutBuf = stdoutBuf.slice(idx + 1);
            handleLine(line);
        }
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
        stderrTail = (stderrTail + chunk).slice(-4000);
    });
    proc.on('error', (err) => {
        const p = proc;
        proc = null;
        failAll(new Error('Could not start Java (' + err.message + ').'));
        rejectStarter(p);
    });
    proc.on('close', (code) => {
        const p = proc;
        proc = null;
        failAll(new Error('The TNoodle bridge exited unexpectedly (code ' + code + ').' + tail()));
        rejectStarter(p);
    });
}

function handleLine(line) {
    if (line === 'READY') {
        resolveStarter();
        return;
    }
    if (line.startsWith('OK\t')) {
        const pending = queue.shift();
        if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(line.slice(3));
        }
        return;
    }
    if (line.startsWith('ERR\t')) {
        const pending = queue.shift();
        if (pending) {
            clearTimeout(pending.timer);
            pending.reject(tnoodleError(line.slice(4)));
        }
    }
}

function tail() {
    return stderrTail.trim() ? '\n' + stderrTail.trim().split('\n').slice(-5).join('\n') : '';
}

function failAll(err) {
    for (const pending of queue.splice(0)) {
        clearTimeout(pending.timer);
        pending.reject(err);
    }
}

let starterResolve = null;
let starterReject = null;

function resolveStarter() {
    if (starterResolve) {
        const r = starterResolve;
        starterResolve = null;
        if (starterReject) {
            starterReject = null;
        }
        r();
    }
}

function rejectStarter(p) {
    if (starterReject && proc === null) {
        const r = starterReject;
        starterReject = null;
        starterResolve = null;
        r(new Error('TNoodle bridge failed to start.'));
    }
}

function start() {
    if (proc) {
        return Promise.resolve();
    }
    if (startingPromise) {
        return startingPromise;
    }
    validateJar();
    const candidates = findJavaCandidates();
    if (!candidates.length) {
        return Promise.reject(tnoodleError(
            'Java (JDK) was not found.\n\n' +
            'Scramble generation needs a JDK (not just a JRE) to run the TNoodle bridge.\n\n' +
            'No admin required — pick one of these options:\n\n' +
            'Option A (easiest):\n' +
            '  1. Download a JDK zip from https://adoptium.net/\n' +
            '  2. Extract it to: ' + path.join(os.homedir(), 'jdk') + '\\<jdk-folder>\n\n' +
            'Option B (set JAVA_HOME):\n' +
            '  1. Download a JDK zip from https://adoptium.net/\n' +
            '  2. Extract it anywhere and set JAVA_HOME to that folder\n\n' +
            'Option C (scoop):\n' +
            '  scoop install openjdk21\n\n' +
            'Option D (winget, user-level):\n' +
            '  winget install EclipseAdoptium.Temurin.21.JDK --scope user\n'
        ));
    }
    startingPromise = new Promise((resolve, reject) => {
        let index = 0;
        let settled = false;
        const tryNext = () => {
            if (settled) {
                return;
            }
            if (index >= candidates.length) {
                settled = true;
                startingPromise = null;
                reject(tnoodleError(
                    'Could not start the TNoodle bridge with any installed Java.\n' +
                    'A full JDK (not just a JRE) is required.\n\n' +
                    'Searched in:\n' +
                    candidates.map(c => '  • ' + c.path).join('\n') + '\n\n' +
                    'Try extracting a fresh JDK to: ' + path.join(os.homedir(), 'jdk') + '\n' +
                    'Download from: https://adoptium.net/'
                ));
                return;
            }
            const candidate = candidates[index++];
            let timer = setTimeout(() => {
                if (settled || proc === null) {
                    return;
                }
                try { proc.kill(); } catch (e) {}
                proc = null;
                tryNext();
            }, START_TIMEOUT_MS);
            starterResolve = () => {
                clearTimeout(timer);
                if (settled) {
                    return;
                }
                settled = true;
                startingPromise = null;
                resolve();
            };
            starterReject = () => {
                clearTimeout(timer);
                if (settled) {
                    return;
                }
                tryNext();
            };
            try {
                spawnBridge(candidate.path);
            } catch (err) {
                clearTimeout(timer);
                tryNext();
            }
        };
        tryNext();
    });
    return startingPromise;
}

function request(payload, timeoutMs) {
    return start().then(() => new Promise((resolve, reject) => {
        const pending = { resolve, reject, timer: null };
        pending.timer = setTimeout(() => {
            const i = queue.indexOf(pending);
            if (i >= 0) {
                queue.splice(i, 1);
            }
            reject(tnoodleError('Timed out waiting for the TNoodle bridge.'));
        }, timeoutMs || REQUEST_TIMEOUT_MS);
        queue.push(pending);
        try {
            proc.stdin.write(payload + '\n');
        } catch (err) {
            clearTimeout(pending.timer);
            const i = queue.indexOf(pending);
            if (i >= 0) {
                queue.splice(i, 1);
            }
            proc = null;
            reject(new Error('The TNoodle bridge is not responding.' + tail()));
        }
    }));
}

function checkPuzzleId(puzzleId) {
    if (!Object.prototype.hasOwnProperty.call(WCA_PUZZLE_LABELS, puzzleId)) {
        throw tnoodleError(
            "Unknown puzzle id '" + puzzleId + "'. Valid ids: " + Object.keys(WCA_PUZZLE_LABELS).join(', ')
        );
    }
}

async function generateScramble(puzzleId, count = 1) {
    checkPuzzleId(puzzleId);
    const payload = await request('SCRAMBLE\t' + puzzleId + '\t' + String(count), REQUEST_TIMEOUT_MS);
    const scrambles = payload.split('\t').filter((s) => s.length > 0);
    return scrambles.join('\n');
}

async function generateScrambleImage(puzzleId, scramble) {
    checkPuzzleId(puzzleId);
    const encoded = Buffer.from(scramble, 'utf8').toString('base64');
    const payload = await request('IMAGE\t' + puzzleId + '\t' + encoded, REQUEST_TIMEOUT_MS);
    return Buffer.from(payload, 'base64').toString('utf8');
}

function shutdown() {
    if (proc) {
        try {
            proc.stdin.write('EXIT\n');
        } catch (e) {
        }
        const p = proc;
        proc = null;
        setTimeout(() => {
            try { p.kill(); } catch (e) {}
        }, 1500);
    }
}

module.exports = {
    WCA_PUZZLE_LABELS,
    generateScramble,
    generateScrambleImage,
    shutdown
};

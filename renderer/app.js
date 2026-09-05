const DEFAULT_SETTINGS = {
    theme: 'clam',
    mode: 'light',
    accent: '#0078d7',
    accent_alpha: '1.0',
    time_precision: 'milli',
    inspect_display: 'decisec',
    inspect_voice_alert: 'off',
    inspect_voice: '',
    timer_input: 'timer',
    stats_order: 'Best,Mo3,Ao5,Ao12,Ao25,Ao50,Ao100,Mean'
};

const STAT_KEYS = ['Mo3', 'Ao5', 'Ao12', 'Ao25', 'Ao50', 'Ao100', 'Mean', 'Best'];

const ACCENT_COLORS = {
    Blue: '#0078d7',
    Green: '#107c10',
    Purple: '#5c2d91',
    Red: '#c42b1c',
    Orange: '#ca5010',
    Teal: '#038387',
    Pink: '#c239b3'
};

const WCA_PUZZLE_LABELS = {
    '222': '2x2x2 Cube',
    '333': '3x3x3 Cube',
    '444': '4x4x4 Cube',
    '555': '5x5x5 Cube',
    '666': '6x6x6 Cube',
    '777': '7x7x7 Cube',
    '333oh': '3x3x3 One-Handed',
    clock: 'Clock',
    minx: 'Megaminx',
    pyram: 'Pyraminx',
    skewb: 'Skewb',
    sq1: 'Square-1',
    '333bf': '3x3x3 Blindfolded',
    '444bf': '4x4x4 Blindfolded',
    '555bf': '5x5x5 Blindfolded',
    '333fm': '3x3x3 Fewest Moves',
    '333mbf': '3x3x3 Multi-Blind'
};

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

const TAB_TITLES = {
    cubes: 'Cube Collection Manager',
    lubes: 'Lube Collection Manager',
    timer: 'Timer',
    settings: 'Settings'
};

const state = {
    settings: {},
    cubes: [],
    lubes: [],
    sessions: [],
    sessionMap: {},
    currentSession: null,
    timesBySession: {},
    solves: [],
    scramble: '',
    scrambleGenerating: false,
    imageVisible: false,
    lastTimeMs: null,
    selectedCubeName: null,
    selectedLubeName: null,
    cubeSort: { col: null, dir: 1 },
    lubeSort: { col: null, dir: 1 },
    solveViewIndex: null,
    statsShownKeys: [],
    statsHiddenKeys: [],
    voices: []
};

function $(sel) {
    return document.querySelector(sel);
}

function $$(sel) {
    return document.querySelectorAll(sel);
}

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'class') {
            node.className = value;
        } else if (key === 'text') {
            node.textContent = value;
        } else if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2), value);
        } else if (value !== undefined && value !== null) {
            node.setAttribute(key, value);
        }
    }
    for (const child of children) {
        if (child) {
            node.appendChild(child);
        }
    }
    return node;
}

function normalizeHexColor(value) {
    let v = String(value).trim().replace(/^#/, '');
    if (v.length === 3) {
        v = v.split('').map((ch) => ch + ch).join('');
    }
    if (v.length !== 6 || /[^0-9a-fA-F]/.test(v)) {
        throw new Error('invalid');
    }
    return '#' + v.toLowerCase();
}

function blendColor(foreground, background, alpha) {
    const fg = [1, 3, 5].map((i) => parseInt(foreground.slice(i, i + 2), 16));
    const bg = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
    const mixed = fg.map((f, i) => Math.round(f * alpha + bg[i] * (1 - alpha)));
    return '#' + mixed.map((m) => m.toString(16).padStart(2, '0')).join('');
}

function hsvToHex(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let rgb;
    switch (i % 6) {
        case 0: rgb = [v, t, p]; break;
        case 1: rgb = [q, v, p]; break;
        case 2: rgb = [p, v, t]; break;
        case 3: rgb = [p, q, v]; break;
        case 4: rgb = [t, p, v]; break;
        default: rgb = [v, p, q];
    }
    return '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

function hueOf(color) {
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) {
        return 0;
    }
    const d = max - min;
    let hue;
    if (max === r) {
        hue = ((g - b) / d) % 6;
    } else if (max === g) {
        hue = (b - r) / d + 2;
    } else {
        hue = (r - g) / d + 4;
    }
    hue = Math.round(((hue * 60) + 360) % 360);
    return hue >= 359 ? 359 : hue;
}

function modePalette(mode, accent, alpha = 1.0) {
    if (mode === 'dark') {
        const bg = '#252526';
        return {
            bg,
            fg: '#e8e8e8',
            field_bg: '#3c3c3c',
            button_bg: '#3c3c3c',
            list_bg: '#1e1e1e',
            sel_bg: blendColor(accent, bg, alpha),
            sel_fg: '#ffffff',
            border: '#555555'
        };
    }
    const bg = '#f0f0f0';
    return {
        bg,
        fg: '#1a1a1a',
        field_bg: '#ffffff',
        button_bg: '#ffffff',
        list_bg: '#ffffff',
        sel_bg: blendColor(accent, bg, alpha),
        sel_fg: '#ffffff',
        border: '#c9c9c9'
    };
}

function accentAlpha() {
    const value = parseFloat(state.settings.accent_alpha);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1.0;
}

function accentDisplayName(color) {
    let normalized;
    try {
        normalized = normalizeHexColor(color);
    } catch (e) {
        return color;
    }
    for (const [name, preset] of Object.entries(ACCENT_COLORS)) {
        if (preset === normalized) {
            return name;
        }
    }
    return normalized;
}

function formatTime(timeMs, precision = 'milli') {
    const totalSeconds = timeMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    const decimals = precision === 'milli' ? 3 : 2;
    if (minutes > 0) {
        return minutes + ':' + seconds.toFixed(decimals).padStart(decimals + 3, '0');
    }
    return seconds.toFixed(decimals);
}

function parseTypedTime(text) {
    text = String(text).trim();
    if (!text) {
        return null;
    }
    if (text.includes(',') && !text.includes('.')) {
        text = text.replace(/,/g, '.');
    }
    try {
        if (text.includes(':')) {
            const [minutesPart, secondsPart] = text.split(':', 2);
            const minutes = parseInt(minutesPart, 10);
            const seconds = parseFloat(secondsPart);
            if (!Number.isFinite(minutes) || !Number.isFinite(seconds) ||
                minutes < 0 || !(seconds >= 0 && seconds < 60)) {
                return null;
            }
            return Math.round((minutes * 60 + seconds) * 1000);
        }
        const value = parseFloat(text);
        if (!Number.isFinite(value) || value < 0) {
            return null;
        }
        return Math.round(value * 1000);
    } catch (e) {
        return null;
    }
}

function parseStatsOrder(value) {
    const parts = value ? String(value).split(',') : [];
    const result = [];
    for (const part of parts) {
        if (STAT_KEYS.includes(part) && !result.includes(part)) {
            result.push(part);
        }
    }
    return result;
}

async function showDialog(type, title, message, detail) {
    try {
        await api.showDialog({ type, title, message, detail });
    } catch (err) {
        console.error(err);
    }
}

const warnBox = (title, message) => showDialog('warning', title, message);
const infoBox = (title, message) => showDialog('info', title, message);
const errorBox = (title, message) => showDialog('error', title, message);
const confirmBox = (title, message, detail) => api.showConfirm({ title, message, detail });

function setStatus(message) {
    $('#statusbar').textContent = message;
}

let modalCloseHandler = null;

function openModal({ title, body, width }) {
    const root = $('#modal-root');
    root.textContent = '';
    const box = el('div', { class: 'modal' });
    if (width) {
        box.style.minWidth = width + 'px';
    }
    box.appendChild(el('h3', { text: title }));
    box.appendChild(body);
    root.appendChild(box);
    root.classList.remove('hidden');
    modalCloseHandler = () => {
        root.classList.add('hidden');
        root.textContent = '';
        modalCloseHandler = null;
    };
    return modalCloseHandler;
}

function closeModal() {
    if (modalCloseHandler) {
        modalCloseHandler();
    }
}

function formRow(labelText, inputEl) {
    return el('div', { class: 'form-row' }, [
        el('label', { text: labelText }),
        inputEl
    ]);
}

function modalButtons(buttons) {
    return el('div', { class: 'modal-buttons' }, buttons.map((btn) =>
        el('button', {
            text: btn.label,
            onclick: async () => {
                if (btn.onClick) {
                    const ok = await btn.onClick();
                    if (!ok) {
                        return;
                    }
                }
                closeModal();
            }
        })
    ));
}

function setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });
}

function activateTab(name) {
    document.querySelectorAll('.tab').forEach((tab) =>
        tab.classList.toggle('active', tab.dataset.tab === name));
    document.querySelectorAll('.page').forEach((page) =>
        page.classList.toggle('active', page.id === 'page-' + name));
    document.title = TAB_TITLES[name] || 'Cubing App';
    if (name === 'cubes') {
        refreshCubes();
    } else if (name === 'lubes') {
        refreshLubes();
    } else if (name === 'timer') {
        refreshTimerData();
    }
}

function tableCellValues(cube) {
    if (cube.kind === 'Bad') {
        return [cube.name, '', '', '', cube.kind];
    }
    return [cube.name, cube.brand, cube.size, cube.adjustments, cube.kind];
}

function renderCubeTable() {
    const tbody = $('#cube-table tbody');
    tbody.textContent = '';
    let rows = state.cubes.slice();
    const { col, dir } = state.cubeSort;
    if (col) {
        rows.sort((a, b) => {
            const va = tableCellValues(a)[['name', 'brand', 'size', 'adjustments', 'kind'].indexOf(col)];
            const vb = tableCellValues(b)[['name', 'brand', 'size', 'adjustments', 'kind'].indexOf(col)];
            return va.localeCompare(vb) * dir;
        });
    }
    for (const cube of rows) {
        const tr = el('tr', {}, tableCellValues(cube).map((value) =>
            el('td', { text: value })));
        tr.addEventListener('click', () => {
            state.selectedCubeName = cube.name;
            tbody.querySelectorAll('tr.selected').forEach((n) => n.classList.remove('selected'));
            tr.classList.add('selected');
        });
        tbody.appendChild(tr);
    }
    $$('#cube-table thead th').forEach((th) => {
        th.classList.toggle('sorted-asc', th.dataset.col === col && dir === 1);
        th.classList.toggle('sorted-desc', th.dataset.col === col && dir === -1);
    });
}

function filterCubes() {
    const term = $('#cube-search').value.toLowerCase();
    if (!term) {
        renderCubeTable();
        return;
    }
    const saved = state.cubes;
    state.cubes = saved.filter((cube) => {
        if (cube.name.toLowerCase().includes(term)) {
            return true;
        }
        if (cube.kind !== 'Bad') {
            return cube.brand.toLowerCase().includes(term) ||
                cube.size.toLowerCase().includes(term) ||
                cube.adjustments.toLowerCase().includes(term) ||
                cube.kind.toLowerCase().includes(term);
        }
        return false;
    });
    renderCubeTable();
    state.cubes = saved;
}

function refreshCubes() {
    $('#cube-search').value = '';
    loadCubesUI();
}

async function loadCubesUI() {
    state.cubes = await api.getCubes();
    renderCubeTable();
    setStatus('Loaded ' + state.cubes.length + ' cubes');
}

function findCubeByName(cubes, name) {
    const target = name.toLowerCase();
    return cubes.find((cube) => cube.name.toLowerCase() === target) || null;
}

function cubeForm(kindInitial) {
    const kindSelect = el('select', {},
        ['Regular', 'Flagship', 'Bad'].map((k) =>
            el('option', { value: k, text: k, selected: k === kindInitial ? '' : null })));
    const inputs = {
        brand: el('input', { type: 'text', autocomplete: 'off' }),
        size: el('input', { type: 'text', autocomplete: 'off' }),
        adjustments: el('input', { type: 'text', autocomplete: 'off' }),
        name: el('input', { type: 'text', autocomplete: 'off' })
    };
    const rows = {
        brand: formRow('Brand:', inputs.brand),
        size: formRow('Size:', inputs.size),
        adjustments: formRow('Adjustments and Features:', inputs.adjustments)
    };
    const body = el('div', {}, [
        formRow('Kind:', kindSelect),
        rows.brand,
        rows.size,
        rows.adjustments,
        formRow('Name:', inputs.name)
    ]);
    const syncFields = () => {
        const bad = kindSelect.value === 'Bad';
        for (const row of Object.values(rows)) {
            row.classList.toggle('hidden', bad);
        }
        if (bad) {
            inputs.name.focus();
        } else {
            inputs.brand.focus();
        }
    };
    kindSelect.addEventListener('change', syncFields);
    setTimeout(() => inputs.brand.focus(), 0);
    return { body, kindSelect, inputs, syncFields };
}

async function validateCubeFields(kindSelect, inputs) {
    const name = inputs.name.value.trim();
    if (!name) {
        await warnBox('Validation Error', 'Name cannot be empty!');
        return null;
    }
    if (kindSelect.value !== 'Bad') {
        const checks = [
            ['brand', 'Brand'],
            ['size', 'Size'],
            ['adjustments', 'Adjustments and Features']
        ];
        for (const [key, label] of checks) {
            if (!inputs[key].value.trim()) {
                await warnBox('Validation Error', label + ' cannot be empty!');
                return null;
            }
        }
    }
    const kind = kindSelect.value;
    if (kind === 'Bad') {
        return { kind: 'Bad', name, brand: '', size: '', adjustments: '' };
    }
    return {
        kind,
        name,
        brand: inputs.brand.value.trim(),
        size: inputs.size.value.trim(),
        adjustments: inputs.adjustments.value.trim()
    };
}

async function addCube() {
    const form = cubeForm('Regular');
    openModal({
        title: 'Add Cube',
        body: form.body,
        width: 430
    });
    modalButtonsAttach([
        {
            label: 'Create',
            onClick: async () => {
                const cube = await validateCubeFields(form.kindSelect, form.inputs);
                if (!cube) {
                    return false;
                }
                const cubes = await api.getCubes();
                if (findCubeByName(cubes, cube.name)) {
                    await errorBox('Add Cube', 'A cube named "' + cube.name + '" already exists.');
                    return false;
                }
                cubes.push(cube);
                await api.saveCubes(dbSortCubes(cubes));
                await loadCubesUI();
                await infoBox('Add Cube', 'Cube saved.');
                setStatus('Loaded ' + state.cubes.length + ' cubes');
                return true;
            }
        },
        { label: 'Cancel' }
    ]);
}

function dbSortCubes(cubes) {
    return cubes.slice().sort((a, b) => {
        const ka = a.kind === 'Bad' ? 1 : 0;
        const kb = b.kind === 'Bad' ? 1 : 0;
        const lineA = (a.kind === 'Bad' ? a.name + '|Bad' : [a.brand, a.size, a.adjustments, a.name, a.kind].join('|')).toLowerCase();
        const lineB = (b.kind === 'Bad' ? b.name + '|Bad' : [b.brand, b.size, b.adjustments, b.name, b.kind].join('|')).toLowerCase();
        return ka !== kb ? ka - kb : lineA < lineB ? -1 : lineA > lineB ? 1 : 0;
    });
}

function modalButtonsAttach(buttons) {
    $('.modal').appendChild(modalButtons(buttons));
}

async function editCube() {
    if (!state.selectedCubeName) {
        await warnBox('Edit Cube', 'Please select a cube to edit.');
        return;
    }
    const cubes = await api.getCubes();
    const cube = findCubeByName(cubes, state.selectedCubeName);
    if (!cube) {
        await errorBox('Edit Cube', 'Cube not found in database.');
        return;
    }
    const isBad = cube.kind === 'Bad';
    const kindInput = el('input', { type: 'text', value: cube.kind, readonly: '' });
    const inputs = {
        brand: el('input', { type: 'text', value: cube.brand || '', autocomplete: 'off' }),
        size: el('input', { type: 'text', value: cube.size || '', autocomplete: 'off' }),
        adjustments: el('input', { type: 'text', value: cube.adjustments || '', autocomplete: 'off' }),
        name: el('input', { type: 'text', value: cube.name, autocomplete: 'off' })
    };
    const rows = [];
    if (!isBad) {
        rows.push(formRow('Brand:', inputs.brand));
        rows.push(formRow('Size:', inputs.size));
        rows.push(formRow('Adjustments and Features:', inputs.adjustments));
    }
    const body = el('div', {}, [
        formRow('Kind:', kindInput),
        ...rows,
        formRow('Name:', inputs.name)
    ]);
    openModal({ title: 'Edit Cube: ' + cube.name, body, width: 430 });
    modalButtonsAttach([
        {
            label: 'Save',
            onClick: async () => {
                const name = inputs.name.value.trim();
                if (!name) {
                    await warnBox('Validation Error', 'Name cannot be empty!');
                    return false;
                }
                if (name.toLowerCase() !== cube.name.toLowerCase() &&
                    findCubeByName(cubes, name)) {
                    await errorBox('Validation Error', 'A cube named "' + name + '" already exists.');
                    return false;
                }
                cube.name = name;
                if (!isBad) {
                    cube.brand = inputs.brand.value.trim();
                    cube.size = inputs.size.value.trim();
                    cube.adjustments = inputs.adjustments.value.trim();
                }
                await api.saveCubes(dbSortCubes(cubes));
                await loadCubesUI();
                await infoBox('Edit Cube', 'Cube updated.');
                state.selectedCubeName = null;
                return true;
            }
        },
        {
            label: 'Cancel',
            onClick: async () => {
                state.selectedCubeName = null;
                return true;
            }
        }
    ]);
}

async function deleteCube() {
    if (!state.selectedCubeName) {
        await warnBox('Delete Cube', 'Please select a cube to delete.');
        return;
    }
    const cubeName = state.selectedCubeName;
    if (!(await confirmBox('Delete Cube', 'Delete "' + cubeName + '"?'))) {
        return;
    }
    const cubes = (await api.getCubes()).filter(
        (cube) => cube.name.toLowerCase() !== cubeName.toLowerCase());
    await api.saveCubes(cubes);
    await loadCubesUI();
    state.selectedCubeName = null;
    await infoBox('Delete Cube', 'Cube deleted.');
}

async function exportCubesCsv() {
    try {
        const result = await api.exportCsv('cubes');
        if (result.ok) {
            await infoBox('Export', 'Successfully exported to ' + result.filePath);
        } else {
            await infoBox('Export', result.message);
        }
    } catch (err) {
        await errorBox('Export Error', 'Failed to export: ' + err.message);
    }
}

function lubeCellValues(lube) {
    return [lube.name, lube.hand_feeling];
}

function renderLubeTable() {
    const tbody = $('#lube-table tbody');
    tbody.textContent = '';
    let rows = state.lubes.slice();
    const { col, dir } = state.lubeSort;
    if (col) {
        rows.sort((a, b) => (a[col] + '').localeCompare(b[col] + '') * dir);
    }
    for (const lube of rows) {
        const tr = el('tr', {}, lubeCellValues(lube).map((value) =>
            el('td', { text: value })));
        tr.addEventListener('click', () => {
            state.selectedLubeName = lube.name;
            tbody.querySelectorAll('tr.selected').forEach((n) => n.classList.remove('selected'));
            tr.classList.add('selected');
        });
        tbody.appendChild(tr);
    }
    $$('#lube-table thead th').forEach((th) => {
        th.classList.toggle('sorted-asc', th.dataset.col === col && dir === 1);
        th.classList.toggle('sorted-desc', th.dataset.col === col && dir === -1);
    });
}

function filterLubes() {
    const term = $('#lube-search').value.toLowerCase();
    if (!term) {
        renderLubeTable();
        return;
    }
    const saved = state.lubes;
    state.lubes = saved.filter((lube) =>
        lube.name.toLowerCase().includes(term) ||
        lube.hand_feeling.toLowerCase().includes(term));
    renderLubeTable();
    state.lubes = saved;
}

function refreshLubes() {
    $('#lube-search').value = '';
    loadLubesUI();
}

async function loadLubesUI() {
    state.lubes = await api.getLubes();
    renderLubeTable();
    setStatus('Loaded ' + state.lubes.length + ' lubes');
}

function findLubeByName(lubes, name) {
    const target = name.toLowerCase();
    return lubes.find((lube) => lube.name.toLowerCase() === target) || null;
}

async function addLube() {
    const nameInput = el('input', { type: 'text', autocomplete: 'off' });
    const feelingInput = el('input', { type: 'text', autocomplete: 'off' });
    const body = el('div', {}, [
        formRow('Name:', nameInput),
        formRow('Hand Feeling:', feelingInput)
    ]);
    openModal({ title: 'Add Lube', body, width: 420 });
    setTimeout(() => nameInput.focus(), 0);
    modalButtonsAttach([
        {
            label: 'Create',
            onClick: async () => {
                const name = nameInput.value.trim();
                if (!name) {
                    await warnBox('Validation Error', 'Name cannot be empty!');
                    return false;
                }
                const handFeeling = feelingInput.value.trim();
                if (!handFeeling) {
                    await warnBox('Validation Error', 'Hand Feeling cannot be empty!');
                    return false;
                }
                const lubes = await api.getLubes();
                if (findLubeByName(lubes, name)) {
                    await errorBox('Add Lube', 'A lube named "' + name + '" already exists.');
                    return false;
                }
                lubes.push({ name, hand_feeling: handFeeling });
                await api.saveLubes(sortLubesDb(lubes));
                await loadLubesUI();
                await infoBox('Add Lube', 'Lube saved.');
                return true;
            }
        },
        { label: 'Cancel' }
    ]);
}

function sortLubesDb(lubes) {
    return lubes.slice().sort((a, b) => {
        const la = (a.name + '|' + a.hand_feeling).toLowerCase();
        const lb = (b.name + '|' + b.hand_feeling).toLowerCase();
        return la < lb ? -1 : la > lb ? 1 : 0;
    });
}

async function editLube() {
    if (!state.selectedLubeName) {
        await warnBox('Edit Lube', 'Please select a lube to edit.');
        return;
    }
    const lubes = await api.getLubes();
    const lube = findLubeByName(lubes, state.selectedLubeName);
    if (!lube) {
        await errorBox('Edit Lube', 'Lube not found in database.');
        return;
    }
    const nameInput = el('input', { type: 'text', value: lube.name, autocomplete: 'off' });
    const feelingInput = el('input', { type: 'text', value: lube.hand_feeling, autocomplete: 'off' });
    const body = el('div', {}, [
        formRow('Name:', nameInput),
        formRow('Hand Feeling:', feelingInput)
    ]);
    openModal({ title: 'Edit Lube: ' + lube.name, body, width: 420 });
    setTimeout(() => nameInput.focus(), 0);
    modalButtonsAttach([
        {
            label: 'Save',
            onClick: async () => {
                const name = nameInput.value.trim();
                if (!name) {
                    await warnBox('Validation Error', 'Name cannot be empty!');
                    return false;
                }
                const handFeeling = feelingInput.value.trim();
                if (!handFeeling) {
                    await warnBox('Validation Error', 'Hand Feeling cannot be empty!');
                    return false;
                }
                if (name.toLowerCase() !== lube.name.toLowerCase() &&
                    findLubeByName(lubes, name)) {
                    await errorBox('Validation Error', 'A lube named "' + name + '" already exists.');
                    return false;
                }
                lube.name = name;
                lube.hand_feeling = handFeeling;
                await api.saveLubes(sortLubesDb(lubes));
                await loadLubesUI();
                await infoBox('Edit Lube', 'Lube updated.');
                state.selectedLubeName = null;
                return true;
            }
        },
        {
            label: 'Cancel',
            onClick: async () => {
                state.selectedLubeName = null;
                return true;
            }
        }
    ]);
}

async function deleteLube() {
    if (!state.selectedLubeName) {
        await warnBox('Delete Lube', 'Please select a lube to delete.');
        return;
    }
    const lubeName = state.selectedLubeName;
    if (!(await confirmBox('Delete Lube', 'Delete "' + lubeName + '"?'))) {
        return;
    }
    const lubes = (await api.getLubes()).filter(
        (lube) => lube.name.toLowerCase() !== lubeName.toLowerCase());
    await api.saveLubes(lubes);
    await loadLubesUI();
    state.selectedLubeName = null;
    await infoBox('Delete Lube', 'Lube deleted.');
}

async function exportLubesCsv() {
    try {
        const result = await api.exportCsv('lubes');
        if (result.ok) {
            await infoBox('Export', 'Successfully exported to ' + result.filePath);
        } else {
            await infoBox('Export', result.message);
        }
    } catch (err) {
        await errorBox('Export Error', 'Failed to export: ' + err.message);
    }
}

const timer = {
    IDLE: 'idle',
    HOLDING: 'holding',
    RUNNING: 'running',
    INSPECTING: 'inspecting',
    state: 'idle',
    holdStarted: 0,
    holdReady: false,
    holdTimeout: null,
    startedAt: 0,
    rafId: null,
    inspectStarted: 0,
    inspectInterval: null,
    spokenMarker: null,
    solvePenalty: 0,
    fgNormal: '#1a1a1a',
    timePrecision: 'milli',
    inspectDisplay: 'decisec',
    voiceAlert: false,
    voiceName: '',
    typeMode: 'timer',
    statsOrder: parseStatsOrder(DEFAULT_SETTINGS.stats_order)
};

function timeLabelEl() {
    return $('#time-label');
}

function setTimeDisplay(text, color) {
    const label = timeLabelEl();
    let fg = color;
    if (fg === undefined) {
        if (timer.state === timer.HOLDING) {
            fg = timer.holdReady ? '#00aa00' : '#999999';
        } else if (timer.state === timer.RUNNING) {
            fg = timer.fgNormal;
        } else {
            fg = timer.fgNormal;
        }
    }
    label.style.color = fg;
    label.textContent = text;
}

function idleText() {
    if (state.lastTimeMs !== null) {
        return formatTime(state.lastTimeMs, timer.timePrecision);
    }
    return timer.timePrecision === 'milli' ? '0.000' : '0.00';
}

function spaceShouldWork(target) {
    if (!$('#page-timer').classList.contains('active')) {
        return false;
    }
    if ($('#modal-root').classList.contains('hidden') === false) {
        return false;
    }
    if (!target) {
        return true;
    }
    return !target.closest('input, textarea, select, button, [contenteditable]');
}

function press() {
    if (timer.typeMode === 'type') {
        return;
    }
    if (timer.state === timer.INSPECTING) {
        startTimingFromInspection();
        return;
    }
    if (timer.state === timer.RUNNING) {
        stopAndRecord();
        return;
    }
    if (timer.state !== timer.IDLE) {
        return;
    }
    timer.state = timer.HOLDING;
    timer.holdReady = false;
    timer.holdStarted = performance.now();
    setTimeDisplay('Hold...');
    timer.holdTimeout = setTimeout(checkHoldReady, 300);
}

function release() {
    if (timer.state !== timer.HOLDING) {
        return;
    }
    clearTimeout(timer.holdTimeout);
    if (timer.holdReady && performance.now() - timer.holdStarted >= 300) {
        startTiming();
    } else {
        timer.state = timer.IDLE;
        setTimeDisplay(idleText());
    }
}

function checkHoldReady() {
    if (timer.state !== timer.HOLDING) {
        return;
    }
    if (performance.now() - timer.holdStarted >= 300) {
        timer.holdReady = true;
        setTimeDisplay('Go!');
    }
}

function startTiming() {
    timer.solvePenalty = 0;
    timer.state = timer.RUNNING;
    timer.startedAt = performance.now();
    tickLoop();
}

function tickLoop() {
    if (timer.state !== timer.RUNNING) {
        return;
    }
    setTimeDisplay(formatTime(Math.round(performance.now() - timer.startedAt), timer.timePrecision));
    timer.rafId = requestAnimationFrame(tickLoop);
}

function stopRunningClock() {
    if (timer.rafId !== null) {
        cancelAnimationFrame(timer.rafId);
        timer.rafId = null;
    }
}

function stopAndRecord() {
    const elapsedMs = Math.round(performance.now() - timer.startedAt);
    timer.state = timer.IDLE;
    stopRunningClock();
    state.lastTimeMs = elapsedMs;
    const penalty = timer.solvePenalty;
    state.solves.push({ timeMs: elapsedMs, penalty, scramble: state.scramble });
    saveTimesAll();
    setTimeDisplay(formatTime(elapsedMs, timer.timePrecision));
    renderSolves();
    refreshStats();
    if (penalty === 'D') {
        setStatus('Solve recorded: DNF');
    } else if (penalty === 2) {
        setStatus('Solve recorded: ' + formatTime(elapsedMs, timer.timePrecision) + ' (+2)');
    } else {
        setStatus('Solve recorded: ' + formatTime(elapsedMs, timer.timePrecision));
    }
    generateScramble();
}

function speak(text, voiceName) {
    if (!('speechSynthesis' in window)) {
        return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (voiceName) {
        const voice = speechSynthesis.getVoices().find((v) => v.name === voiceName);
        if (voice) {
            utterance.voice = voice;
        }
    }
    speechSynthesis.speak(utterance);
}

function cancelSpeech() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}

function startInspection() {
    timer.state = timer.INSPECTING;
    timer.inspectStarted = performance.now();
    timer.spokenMarker = null;
    setStatus('Inspection started - 15 seconds');
    timer.inspectInterval = setInterval(inspectionTick, 50);
}

function cancelInspection() {
    stopInspectionClock();
    if (timer.voiceAlert) {
        cancelSpeech();
    }
    timer.state = timer.IDLE;
    setTimeDisplay(idleText());
    setStatus('Inspection cancelled');
}

function stopInspectionClock() {
    if (timer.inspectInterval !== null) {
        clearInterval(timer.inspectInterval);
        timer.inspectInterval = null;
    }
}

function inspectionNumberText(value) {
    return timer.inspectDisplay === 'sec' ? value.toFixed(0) : value.toFixed(1);
}

function inspectionTick() {
    if (timer.state !== timer.INSPECTING) {
        return;
    }
    const elapsed = (performance.now() - timer.inspectStarted) / 1000;
    let text;
    let fg;
    if (elapsed < 8.0) {
        text = inspectionNumberText(Math.min(elapsed, 8.0));
        fg = '#00aa00';
    } else if (elapsed < 12.0) {
        text = inspectionNumberText(Math.min(elapsed, 12.0));
        fg = 'red';
    } else if (elapsed < 15.0) {
        text = 'Go!!';
        fg = 'red';
    } else if (elapsed < 17.0) {
        text = '+2';
        fg = 'red';
    } else {
        text = 'DNF';
        fg = 'red';
    }
    timeLabelEl().style.color = fg;
    timeLabelEl().textContent = text;
    if (timer.voiceAlert) {
        let marker = null;
        if (elapsed >= 12.0) {
            marker = ['go', '12 seconds'];
        } else if (elapsed >= 8.0) {
            marker = ['eight', '8 seconds'];
        }
        if (marker && marker[0] !== timer.spokenMarker) {
            timer.spokenMarker = marker[0];
            speak(marker[1], timer.voiceName);
        }
    }
}

function startTimingFromInspection() {
    stopInspectionClock();
    if (timer.voiceAlert) {
        cancelSpeech();
    }
    const elapsed = (performance.now() - timer.inspectStarted) / 1000;
    if (elapsed > 17.0) {
        timer.solvePenalty = 'D';
    } else if (elapsed > 15.0) {
        timer.solvePenalty = 2;
    } else {
        timer.solvePenalty = 0;
    }
    timer.state = timer.RUNNING;
    timer.startedAt = performance.now();
    tickLoop();
}

function toggleInspection() {
    if (timer.state === timer.RUNNING || timer.typeMode === 'type') {
        return;
    }
    if (timer.state === timer.INSPECTING) {
        cancelInspection();
    } else {
        startInspection();
    }
}

function cancelActiveTimer() {
    if (timer.state === timer.RUNNING) {
        stopRunningClock();
        timer.state = timer.IDLE;
        setTimeDisplay(idleText());
    } else if (timer.state === timer.INSPECTING) {
        cancelInspection();
    } else if (timer.state === timer.HOLDING) {
        clearTimeout(timer.holdTimeout);
        timer.state = timer.IDLE;
        setTimeDisplay(idleText());
    }
}

function applyInputModeUi() {
    const typed = $('#typed-input');
    const label = timeLabelEl();
    const hint = $('#hint-label');
    const inspectBtn = $('#inspect-btn');
    if (timer.typeMode === 'type') {
        typed.classList.remove('hidden');
        label.classList.add('hidden');
        hint.textContent = 'Type your time in the box (like 12.34 or 1:05.23) and press Enter to record it.';
        inspectBtn.disabled = true;
    } else {
        typed.classList.add('hidden');
        label.classList.remove('hidden');
        hint.textContent =
            'Hold spacebar (or click) to arm, release to start, press again to stop. ' +
            'Inspect: 15s WCA-style inspection (Go!! at 12s, +2 at 15s, DNF at 17s).';
        inspectBtn.disabled = false;
    }
}

function submitTypedTime() {
    const input = $('#typed-input');
    const timeMs = parseTypedTime(input.value);
    if (timeMs === null) {
        setStatus('Invalid time - use format like 12.34 or 1:05.23');
        return;
    }
    state.solves.push({ timeMs, penalty: 0, scramble: state.scramble });
    saveTimesAll();
    state.lastTimeMs = timeMs;
    setTimeDisplay(formatTime(timeMs, timer.timePrecision));
    input.value = '';
    renderSolves();
    refreshStats();
    setStatus('Solve recorded: ' + formatTime(timeMs, timer.timePrecision));
    generateScramble();
}

function effectiveTimes() {
    return state.solves.map((solve) => {
        if (solve.penalty === 2) {
            return solve.timeMs + 2000;
        }
        if (solve.penalty === 'D') {
            return null;
        }
        return solve.timeMs;
    });
}

function averageOf(count) {
    const effective = effectiveTimes();
    if (effective.length < count) {
        return null;
    }
    const window = effective.slice(-count);
    if (count === 3) {
        if (window.some((value) => value === null)) {
            return 'DNF';
        }
        return Math.round(window.reduce((a, b) => a + b, 0) / 3);
    }
    const dnfCount = window.filter((value) => value === null).length;
    if (dnfCount >= 2) {
        return 'DNF';
    }
    const values = window.filter((value) => value !== null).sort((a, b) => a - b);
    const trimmed = values.slice(1, -1);
    return Math.round(trimmed.reduce((a, b) => a + b, 0) / (count - 2));
}

function refreshStats() {
    const effective = effectiveTimes();
    let best = null;
    for (const value of effective) {
        if (value !== null && (best === null || value < best)) {
            best = value;
        }
    }
    const valid = effective.filter((value) => value !== null);
    const mean = valid.length
        ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
        : null;

    const render = (value) => {
        if (value === null) {
            return '--';
        }
        if (value === 'DNF') {
            return 'DNF';
        }
        return formatTime(value, timer.timePrecision);
    };

    const valueFor = (key) => {
        if (key === 'Best') {
            return best;
        }
        if (key === 'Mean') {
            return mean;
        }
        return averageOf(parseInt(key.slice(2), 10));
    };

    const parts = ['Solves: ' + state.solves.length];
    for (const key of timer.statsOrder) {
        parts.push(key + ': ' + render(valueFor(key)));
    }
    $('#stats-line').textContent = parts.join('   ');
}

function renderSolves() {
    const list = $('#solves-list');
    list.textContent = '';
    const reversed = state.solves.slice().reverse();
    reversed.forEach((solve, viewIndex) => {
        let text = formatTime(solve.timeMs, timer.timePrecision);
        if (solve.penalty === 2) {
            text += ' (+2)';
        } else if (solve.penalty === 'D') {
            text = 'DNF';
        }
        const li = el('li', { text });
        li.dataset.viewIndex = viewIndex;
        li.addEventListener('click', () => selectSolveView(viewIndex));
        li.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            selectSolveView(viewIndex);
            showContextMenu(event.clientX, event.clientY);
        });
        if (viewIndex === state.solveViewIndex) {
            li.classList.add('selected');
        }
        list.appendChild(li);
    });
    if (state.solveViewIndex !== null && state.solveViewIndex >= reversed.length) {
        state.solveViewIndex = reversed.length ? reversed.length - 1 : null;
    }
}

function selectSolveView(viewIndex) {
    state.solveViewIndex = viewIndex;
    $('#solves-list').querySelectorAll('li').forEach((li) =>
        li.classList.toggle('selected', Number(li.dataset.viewIndex) === viewIndex));
}

function targetSolveIndex() {
    const reversedLength = state.solves.length;
    if (state.solveViewIndex === null) {
        if (state.solves.length) {
            return state.solves.length - 1;
        }
        return null;
    }
    const index = reversedLength - 1 - state.solveViewIndex;
    return index >= 0 && index < state.solves.length ? index : null;
}

function afterModify() {
    saveTimesAll();
    renderSolves();
    refreshStats();
    timeLabelEl().focus();
}

async function togglePlus2() {
    const index = targetSolveIndex();
    if (index === null) {
        setStatus('No solves to modify.');
        return;
    }
    const solve = state.solves[index];
    if (solve.penalty === 'D') {
        return;
    }
    const wasPenalty = solve.penalty === 2;
    solve.penalty = wasPenalty ? 0 : 2;
    setStatus(wasPenalty
        ? 'Solve ' + formatTime(solve.timeMs, timer.timePrecision) + ' penalty removed'
        : 'Solve ' + formatTime(solve.timeMs, timer.timePrecision) + ' marked +2');
    afterModify();
}

async function toggleDnf() {
    const index = targetSolveIndex();
    if (index === null) {
        setStatus('No solves to modify.');
        return;
    }
    const solve = state.solves[index];
    const wasDnf = solve.penalty === 'D';
    solve.penalty = wasDnf ? 0 : 'D';
    setStatus(wasDnf
        ? 'Solve ' + formatTime(solve.timeMs, timer.timePrecision) + ' DNF removed'
        : 'Solve ' + formatTime(solve.timeMs, timer.timePrecision) + ' marked DNF');
    afterModify();
}

async function deleteSelectedSolve() {
    const index = targetSolveIndex();
    if (index === null) {
        setStatus('No solves to delete.');
        return;
    }
    const solve = state.solves[index];
    state.solves.splice(index, 1);
    setStatus('Solve ' + formatTime(solve.timeMs, timer.timePrecision) + ' deleted');
    afterModify();
}

async function showSelectedScramble() {
    const index = targetSolveIndex();
    if (index === null) {
        setStatus('No solves to show a scramble for.');
        return;
    }
    const solve = state.solves[index];
    let label = formatTime(solve.timeMs, timer.timePrecision);
    if (solve.penalty === 2) {
        label += ' (+2)';
    } else if (solve.penalty === 'D') {
        label = 'DNF';
    }
    if (!solve.scramble) {
        setStatus('No scramble saved for solve ' + label + '.');
        return;
    }
    setScrambleText(solve.scramble);
    fitScrambleText();
    setStatus('Showing scramble for solve ' + label);
}

function saveTimesAll() {
    api.saveTimes(state.timesBySession).catch(async (err) => {
        await errorBox('Database Error', 'Could not write times to database:\n' + err.message);
    });
}

function rebuildSessionSelect() {
    const select = $('#session-select');
    select.textContent = '';
    for (const [name] of state.sessions) {
        select.appendChild(el('option', { value: name, text: name }));
    }
    select.value = state.currentSession;
}

function switchToSession(name) {
    state.currentSession = name;
    state.lastTimeMs = null;
    state.scramble = '';
    state.imageVisible = false;
    hideScrambleImage();
    state.solves = state.timesBySession[name] || [];
    state.solveViewIndex = null;
    rebuildSessionSelect();
    renderSolves();
    refreshStats();
    setTimeDisplay(idleText());
    setStatus('Session changed to ' + name);
    generateScramble();
}

async function addSession() {
    const nameInput = el('input', { type: 'text', autocomplete: 'off' });
    const puzzleLabels = Object.values(WCA_PUZZLE_LABELS).slice().sort();
    const puzzleSelect = el('select', {}, puzzleLabels.map((label) =>
        el('option', { value: label, text: label })));
    puzzleSelect.value = WCA_PUZZLE_LABELS['333'];
    const body = el('div', {}, [
        formRow('Name:', nameInput),
        formRow('Puzzle:', puzzleSelect)
    ]);
    openModal({ title: 'Add Session', body, width: 400 });
    setTimeout(() => nameInput.focus(), 0);
    modalButtonsAttach([
        {
            label: 'Create',
            onClick: async () => {
                const name = nameInput.value.trim();
                if (!name) {
                    await warnBox('Validation Error', 'Name cannot be empty!');
                    return false;
                }
                if (!puzzleSelect.value) {
                    await warnBox('Validation Error', 'Choose a puzzle!');
                    return false;
                }
                if (state.sessions.some(([existing]) => existing.toLowerCase() === name.toLowerCase())) {
                    await warnBox('Add Session', 'A session named "' + name + '" already exists.');
                    return false;
                }
                const puzzleId = Object.keys(WCA_PUZZLE_LABELS).find(
                    (pid) => WCA_PUZZLE_LABELS[pid] === puzzleSelect.value);
                state.sessions.push([name, puzzleId]);
                try {
                    await api.saveSessions(state.sessions);
                } catch (err) {
                    await errorBox('Database Error', 'Could not write sessions to database:\n' + err.message);
                    return false;
                }
                state.sessionMap = Object.fromEntries(state.sessions);
                state.timesBySession[name] = state.timesBySession[name] || [];
                switchToSession(name);
                setStatus('Session "' + name + '" added');
                return true;
            }
        },
        { label: 'Cancel' }
    ]);
}

async function deleteSession() {
    const name = state.currentSession;
    const count = (state.timesBySession[name] || []).length;
    const detail = count ? 'It contains ' + count + ' solve(s).' : '';
    if (!(await confirmBox('Delete Session',
        'Delete session "' + name + '"?',
        (detail ? detail + ' ' : '') + 'All its times will be removed.'))) {
        return;
    }
    state.sessions = state.sessions.filter(([sessionName]) => sessionName !== name);
    try {
        await api.saveSessions(state.sessions);
    } catch (err) {
        await errorBox('Database Error', 'Could not write sessions to database:\n' + err.message);
        return;
    }
    delete state.timesBySession[name];
    saveTimesAll();
    if (!state.sessions.length) {
        state.sessions = DEFAULT_SESSIONS.slice();
        try {
            await api.saveSessions(state.sessions);
        } catch (err) {
            await errorBox('Database Error', 'Could not write sessions to database:\n' + err.message);
            return;
        }
    }
    state.sessionMap = Object.fromEntries(state.sessions);
    switchToSession(state.sessions[0][0]);
    setStatus('Session "' + name + '" deleted');
}

async function refreshTimerData() {
    try {
        state.sessions = await api.getSessions();
        if (!state.sessions.length) {
            state.sessions = DEFAULT_SESSIONS.slice();
            await api.saveSessions(state.sessions);
        }
        state.sessionMap = Object.fromEntries(state.sessions);
        if (!state.sessionMap[state.currentSession]) {
            state.currentSession = state.sessions[0][0];
            state.lastTimeMs = null;
        }
        state.timesBySession = await api.getTimes();
        state.solves = state.timesBySession[state.currentSession] || [];
        state.solveViewIndex = null;
        rebuildSessionSelect();
        renderSolves();
        refreshStats();
        if (!state.scramble) {
            generateScramble();
        }
        setStatus('Timer data refreshed');
    } catch (err) {
        await errorBox('Database Error', 'Could not read timer data:\n' + err.message);
    }
}

function setScrambleText(text) {
    const box = $('#scramble-text');
    box.textContent = text;
}

function fitScrambleText() {
    const box = $('#scramble-text');
    const content = box.textContent.trim();
    if (!content) {
        return;
    }
    const available = Math.max(box.clientWidth - 20, 20);
    if (box.clientWidth <= 1) {
        return;
    }
    const minSize = 9;
    const maxSize = 27;
    let size = 19;
    const measure = (candidate) => {
        box.style.fontSize = candidate + 'px';
        return box.scrollWidth;
    };
    while (size < maxSize && measure(size) <= available) {
        size += 1;
    }
    while (size > minSize && measure(size) > available) {
        size -= 1;
    }
    box.style.fontSize = size + 'px';
}

async function generateScramble() {
    const puzzleId = state.sessionMap[state.currentSession];
    if (!puzzleId || state.scrambleGenerating) {
        return;
    }
    state.scrambleGenerating = true;
    setStatus('Generating scramble for ' + state.currentSession + '...');
    try {
        const scramble = await api.generateScramble(puzzleId);
        state.scramble = scramble;
        if (state.imageVisible) {
            await renderScrambleImage();
        }
        setScrambleText(scramble);
        fitScrambleText();
        setStatus('Scramble generated for ' + state.currentSession);
    } catch (err) {
        const message = err.message || String(err);
        if (/jar|Java|JDK|TNoodle/i.test(message) &&
            /not found|corrupt|not a TNoodle|could not start|was not found|required/i.test(message)) {
            await errorBox('TNoodle Not Found', message);
            setStatus('TNoodle not available');
        } else {
            await errorBox('Scramble Generation Error', 'Failed to generate scramble: ' + message);
            setStatus('Scramble generation failed');
        }
    } finally {
        state.scrambleGenerating = false;
    }
}

function hideScrambleImage() {
    state.scramblePhoto = null;
    const img = $('#scramble-image');
    img.src = '';
    img.classList.add('hidden');
}

function svgToDataUrl(svg) {
    const bytes = new TextEncoder().encode(svg);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return 'data:image/svg+xml;base64,' + btoa(binary);
}

async function renderScrambleImage() {
    const puzzleId = state.sessionMap[state.currentSession];
    try {
        const svg = await api.generateScrambleImage(puzzleId, state.scramble);
        const img = $('#scramble-image');
        img.src = svgToDataUrl(svg);
        img.classList.remove('hidden');
        return true;
    } catch (err) {
        const message = err.message || String(err);
        if (/jar|Java|JDK|TNoodle/i.test(message) &&
            /not found|corrupt|not a TNoodle|could not start|was not found|required/i.test(message)) {
            await errorBox('TNoodle Not Found', message);
            setStatus('TNoodle not available');
        } else {
            await errorBox('Scramble Image Generation Error',
                'Failed to generate scramble image: ' + message);
            setStatus('Scramble image generation failed');
        }
        hideScrambleImage();
        return false;
    }
}

async function toggleScrambleImage() {
    const puzzleId = state.sessionMap[state.currentSession];
    if (!puzzleId || !state.scramble) {
        await warnBox('Show Scramble Image', 'Generate a scramble first.');
        return;
    }
    if (state.imageVisible) {
        state.imageVisible = false;
        hideScrambleImage();
        setStatus('Scramble image hidden');
        return;
    }
    setStatus('Generating scramble image for ' + state.currentSession + '...');
    if (await renderScrambleImage()) {
        state.imageVisible = true;
        setStatus('Scramble image displayed for ' + state.currentSession);
    }
}

function showContextMenu(x, y) {
    const menu = $('#ctx-menu');
    menu.textContent = '';
    menu.appendChild(el('div', { text: '+2', onclick: () => hideContextMenuAndThen(togglePlus2) }));
    menu.appendChild(el('div', { text: 'DNF', onclick: () => hideContextMenuAndThen(toggleDnf) }));
    menu.appendChild(el('div', { text: 'Delete', onclick: () => hideContextMenuAndThen(deleteSelectedSolve) }));
    menu.classList.remove('hidden');
    const maxX = window.innerWidth - menu.offsetWidth - 4;
    const maxY = window.innerHeight - menu.offsetHeight - 4;
    menu.style.left = Math.min(x, maxX) + 'px';
    menu.style.top = Math.min(y, maxY) + 'px';
}

function hideContextMenuAndThen(action) {
    $('#ctx-menu').classList.add('hidden');
    action();
}

function applyAppearance() {
    const mode = state.settings.mode || 'light';
    const accent = state.settings.accent || '#0078d7';
    const alpha = accentAlpha();
    document.body.dataset.mode = mode;
    const palette = modePalette(mode, accent, alpha);
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--sel-bg', palette.sel_bg);
    rootStyle.setProperty('--sel-fg', palette.sel_fg);
    rootStyle.setProperty('--accent-solid', accent);
    timer.fgNormal = palette.fg;
    if (timer.state === timer.IDLE) {
        setTimeDisplay(idleText());
    }
}

function syncAccentControls() {
    const select = $('#accent-select');
    const displayName = accentDisplayName(state.settings.accent);
    if (Object.keys(ACCENT_COLORS).includes(displayName)) {
        select.value = displayName;
    } else {
        select.value = 'Custom...';
    }
    $('#accent-hex').value = normalizeOrRaw(state.settings.accent);
    $('#accent-swatch').style.background = blendColor(
        normalizeOrRaw(state.settings.accent),
        modePalette(state.settings.mode || 'light', '#000000', 1.0).bg,
        accentAlpha()
    );
}

function normalizeOrRaw(value) {
    try {
        return normalizeHexColor(value);
    } catch (e) {
        return value;
    }
}

async function applyAccentChange() {
    try {
        await api.saveSettings(state.settings);
    } catch (err) {
        await errorBox('Database Error', 'Could not write settings:\n' + err.message);
        return;
    }
    applyAppearance();
    syncAccentControls();
    setStatus('Appearance updated');
}

function openColorPicker() {
    const blendBg = modePalette(state.settings.mode || 'light', '#000000', 1.0).bg;
    let currentHex;
    try {
        currentHex = normalizeHexColor(state.settings.accent || '#0078d7');
    } catch (e) {
        currentHex = '#0078d7';
    }
    let currentAlpha = accentAlpha();

    const hexInput = el('input', { type: 'text', value: currentHex, spellcheck: 'false', size: '10' });
    const hueRange = el('input', { type: 'range', min: '0', max: '359', value: String(hueOf(currentHex)) });
    const alphaRange = el('input', { type: 'range', min: '0', max: '100', value: String(Math.round(currentAlpha * 100)) });
    const preview = el('div', { class: 'color-preview' });
    const previewInfo = el('div', { class: 'tip' });

    const alphaNow = () => parseInt(alphaRange.value, 10) / 100;

    const updatePreview = () => {
        let color;
        try {
            color = normalizeHexColor(hexInput.value);
        } catch (e) {
            previewInfo.textContent = 'Invalid hex color';
            return;
        }
        const alpha = alphaNow();
        preview.style.background = blendColor(color, blendBg, alpha);
        previewInfo.textContent = color + ' at ' + Math.round(alpha * 100) + '% opacity over ' + blendBg;
        const hue = hueOf(color);
        if (String(hue) !== hueRange.value) {
            hueRange.value = String(hue);
        }
    };

    hexInput.addEventListener('input', updatePreview);
    hueRange.addEventListener('input', () => {
        hexInput.value = hsvToHex(parseInt(hueRange.value, 10) / 360, 1.0, 0.85);
        updatePreview();
    });
    alphaRange.addEventListener('input', updatePreview);

    const body = el('div', {}, [
        formRow('Hexadecimal:', hexInput),
        formRow('Hue:', hueRange),
        formRow('Opacity:', alphaRange),
        formRow('Preview:', preview),
        previewInfo
    ]);

    openModal({ title: 'Custom Accent Color', body, width: 440 });
    updatePreview();
    setTimeout(() => hexInput.focus(), 0);

    modalButtonsAttach([
        {
            label: 'OK',
            onClick: async () => {
                let picked;
                try {
                    picked = normalizeHexColor(hexInput.value);
                } catch (e) {
                    await warnBox('Invalid Color', 'Enter a hex color like #ff6600 or #f60.');
                    return false;
                }
                picked = { color: picked, alpha: alphaNow() };
                state.settings.accent = picked.color;
                state.settings.accent_alpha = picked.alpha.toFixed(2);
                await applyAccentChange();
                return true;
            }
        },
        {
            label: 'Cancel',
            onClick: async () => {
                syncAccentControls();
                return true;
            }
        }
    ]);
}

function collectTimerSettings() {
    state.settings.time_precision = document.querySelector('input[name="precision"]:checked').value;
    state.settings.inspect_display = document.querySelector('input[name="inspectdisplay"]:checked').value;
    state.settings.timer_input = document.querySelector('input[name="inputmode"]:checked').value;
    state.settings.inspect_voice_alert = $('#voice-alert').checked ? 'on' : 'off';
    let voice = $('#voice-select').value || '';
    if (voice && !state.voices.some((v) => v.name === voice)) {
        voice = '';
    }
    state.settings.inspect_voice = voice;
}

async function applyTimerSettingsFromUi() {
    collectTimerSettings();
    try {
        await api.saveSettings(state.settings);
    } catch (err) {
        await errorBox('Database Error', 'Could not write settings:\n' + err.message);
        return;
    }
    $('#voice-select').disabled =
        !(state.settings.inspect_voice_alert === 'on' && state.voices.length);
    applyTimerSettings(state.settings);
    setStatus('Timer settings updated');
}

function applyTimerSettings(settings) {
    timer.timePrecision = settings.time_precision || 'milli';
    timer.inspectDisplay = settings.inspect_display || 'decisec';
    const mode = settings.timer_input || 'timer';
    const wasEnabled = timer.voiceAlert;
    timer.voiceAlert = settings.inspect_voice_alert === 'on';
    timer.voiceName = settings.inspect_voice || '';
    timer.statsOrder = parseStatsOrder(settings.stats_order || DEFAULT_SETTINGS.stats_order);
    if (timer.statsOrder.length === 0) {
        timer.statsOrder = parseStatsOrder(DEFAULT_SETTINGS.stats_order);
    }
    if (mode !== timer.typeMode) {
        timer.typeMode = mode;
        cancelActiveTimer();
        applyInputModeUi();
    }
    if (wasEnabled && !timer.voiceAlert) {
        cancelSpeech();
    }
    timer.spokenMarker = null;
    renderSolves();
    refreshStats();
    if (timer.state === timer.IDLE) {
        setTimeDisplay(idleText());
    }
}

function populateVoices() {
    if (!('speechSynthesis' in window)) {
        state.voices = [];
    } else {
        const all = speechSynthesis.getVoices();
        const local = all.filter((v) => v.localService);
        state.voices = local.length ? local : all;
    }
    const select = $('#voice-select');
    select.textContent = '';
    for (const voice of state.voices) {
        select.appendChild(el('option', { value: voice.name, text: voice.name }));
    }
    $('#no-voices').classList.toggle('hidden', state.voices.length > 0);
    const saved = state.settings.inspect_voice || '';
    if (saved && state.voices.some((v) => v.name === saved)) {
        select.value = saved;
    } else if (state.voices.length) {
        select.value = state.voices[0].name;
    }
    select.disabled = !(state.settings.inspect_voice_alert === 'on' && state.voices.length > 0);
}

function renderStatsLists() {
    const shown = $('#stats-shown');
    const hidden = $('#stats-hidden');
    shown.textContent = '';
    hidden.textContent = '';
    for (const key of state.statsShownKeys) {
        shown.appendChild(el('option', { value: key, text: key }));
    }
    for (const key of state.statsHiddenKeys) {
        hidden.appendChild(el('option', { value: key, text: key }));
    }
}

function rebuildStatsKeys() {
    const parsed = parseStatsOrder(state.settings.stats_order || DEFAULT_SETTINGS.stats_order);
    state.statsShownKeys = parsed.length ? parsed : parseStatsOrder(DEFAULT_SETTINGS.stats_order);
    state.statsHiddenKeys = STAT_KEYS.filter((key) => !state.statsShownKeys.includes(key));
    renderStatsLists();
}

async function persistStatsOrder() {
    state.settings.stats_order = state.statsShownKeys.join(',');
    try {
        await api.saveSettings(state.settings);
    } catch (err) {
        await errorBox('Database Error', 'Could not write settings:\n' + err.message);
        return;
    }
    applyTimerSettings(state.settings);
    setStatus('Statistics updated');
}

function statsMove(toAction) {
    if (toAction === 'show') {
        const idx = $('#stats-hidden').selectedIndex;
        if (idx < 0) {
            return;
        }
        const key = state.statsHiddenKeys.splice(idx, 1)[0];
        state.statsShownKeys.push(key);
        renderStatsLists();
        persistStatsOrder();
    } else if (toAction === 'hide') {
        const idx = $('#stats-shown').selectedIndex;
        if (idx < 0) {
            return;
        }
        const key = state.statsShownKeys.splice(idx, 1)[0];
        state.statsHiddenKeys.push(key);
        renderStatsLists();
        persistStatsOrder();
    }
}

function statsMoveUp() {
    const idx = $('#stats-shown').selectedIndex;
    if (idx <= 0) {
        return;
    }
    const [key] = state.statsShownKeys.splice(idx, 1);
    state.statsShownKeys.splice(idx - 1, 0, key);
    renderStatsLists();
    $('#stats-shown').selectedIndex = idx - 1;
    persistStatsOrder();
}

function statsMoveDown() {
    const idx = $('#stats-shown').selectedIndex;
    if (idx < 0 || idx >= state.statsShownKeys.length - 1) {
        return;
    }
    const [key] = state.statsShownKeys.splice(idx, 1);
    state.statsShownKeys.splice(idx + 1, 0, key);
    renderStatsLists();
    $('#stats-shown').selectedIndex = idx + 1;
    persistStatsOrder();
}

function syncSettingsControls() {
    const mode = state.settings.mode || 'light';
    $('#mode-light').checked = mode === 'light';
    $('#mode-dark').checked = mode === 'dark';
    document.querySelector(
        'input[name="precision"][value="' + (state.settings.time_precision || 'milli') + '"]'
    ).checked = true;
    document.querySelector(
        'input[name="inspectdisplay"][value="' + (state.settings.inspect_display || 'decisec') + '"]'
    ).checked = true;
    document.querySelector(
        'input[name="inputmode"][value="' + (state.settings.timer_input || 'timer') + '"]'
    ).checked = true;
    $('#voice-alert').checked = state.settings.inspect_voice_alert === 'on';
    populateVoices();
    rebuildStatsKeys();
    syncAccentControls();
}

async function resetSettings() {
    state.settings = Object.assign({}, DEFAULT_SETTINGS);
    try {
        await api.saveSettings(state.settings);
    } catch (err) {
        await errorBox('Database Error', 'Could not write settings:\n' + err.message);
        return;
    }
    syncSettingsControls();
    applyAppearance();
    applyTimerSettings(state.settings);
    setStatus('Settings reset to defaults');
}

function setupSettingsTab() {
    const accentSelect = $('#accent-select');
    for (const name of Object.keys(ACCENT_COLORS)) {
        accentSelect.appendChild(el('option', { value: name, text: name }));
    }
    accentSelect.appendChild(el('option', { value: 'Custom...', text: 'Custom...' }));

    $('#mode-light').addEventListener('change', () => {
        state.settings.mode = 'light';
        applyAccentChange();
    });
    $('#mode-dark').addEventListener('change', () => {
        state.settings.mode = 'dark';
        applyAccentChange();
    });

    accentSelect.addEventListener('change', () => {
        if (accentSelect.value === 'Custom...') {
            openColorPicker();
        } else {
            state.settings.accent = ACCENT_COLORS[accentSelect.value];
            applyAccentChange();
        }
    });

    $('#accent-hex').addEventListener('change', async () => {
        const text = $('#accent-hex').value.trim();
        if (!text) {
            syncAccentControls();
            return;
        }
        try {
            state.settings.accent = normalizeHexColor(text);
        } catch (e) {
            syncAccentControls();
            await warnBox('Invalid Color', 'Enter a hex color like #ff6600, or choose Custom....');
            return;
        }
        applyAccentChange();
    });

    $('#accent-swatch').addEventListener('click', openColorPicker);

    for (const radio of document.querySelectorAll('input[name="precision"], input[name="inspectdisplay"], input[name="inputmode"]')) {
        radio.addEventListener('change', applyTimerSettingsFromUi);
    }

    $('#voice-alert').addEventListener('change', applyTimerSettingsFromUi);
    $('#voice-select').addEventListener('change', applyTimerSettingsFromUi);
    $('#voice-preview').addEventListener('click', () => {
        speak('8 seconds', $('#voice-select').value || '');
    });

$('#stats-show').addEventListener('click', () => statsMove('show'));
$('#stats-hide').addEventListener('click', () => statsMove('hide'));
    $('#stats-up').addEventListener('click', statsMoveUp);
    $('#stats-down').addEventListener('click', statsMoveDown);
    $('#settings-reset').addEventListener('click', resetSettings);
}

function setupTimerEvents() {
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Space' || event.repeat) {
            return;
        }
        if (!spaceShouldWork(event.target)) {
            return;
        }
        event.preventDefault();
        press();
    });
    document.addEventListener('keyup', (event) => {
        if (event.code !== 'Space') {
            return;
        }
        if (!spaceShouldWork(event.target)) {
            return;
        }
        event.preventDefault();
        release();
    });

    const label = timeLabelEl();
    label.addEventListener('mousedown', (event) => {
        event.preventDefault();
        press();
    });
    label.addEventListener('mouseup', () => release());

    $('#typed-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitTypedTime();
        }
    });

    $('#inspect-btn').addEventListener('click', toggleInspection);

    $('#scramble-new').addEventListener('click', generateScramble);
    $('#scramble-image-btn').addEventListener('click', toggleScrambleImage);
    $('#timer-refresh').addEventListener('click', refreshTimerData);
    $('#session-add').addEventListener('click', addSession);
    $('#session-delete').addEventListener('click', deleteSession);
    $('#session-select').addEventListener('change', (event) => {
        const name = event.target.value;
        if (!state.sessionMap[name]) {
            return;
        }
        switchToSession(name);
    });

    $('#solve-plus2').addEventListener('click', togglePlus2);
    $('#solve-dnf').addEventListener('click', toggleDnf);
    $('#solve-delete').addEventListener('click', deleteSelectedSolve);
    $('#solve-scramble').addEventListener('click', showSelectedScramble);

    $('#solves-list').addEventListener('keydown', (event) => {
        if (event.key === 'Delete') {
            event.preventDefault();
            deleteSelectedSolve();
        }
    });

    window.addEventListener('resize', fitScrambleText);
    document.addEventListener('click', (event) => {
        const menu = $('#ctx-menu');
        if (!menu.classList.contains('hidden') && !menu.contains(event.target)) {
            menu.classList.add('hidden');
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            $('#ctx-menu').classList.add('hidden');
            closeModal();
        }
    });
    window.addEventListener('blur', () => {
        if (timer.state === timer.HOLDING) {
            clearTimeout(timer.holdTimeout);
            timer.state = timer.IDLE;
            setTimeDisplay(idleText());
        }
    });
}

function setupCollectionEvents() {
    $('#cube-add').addEventListener('click', addCube);
    $('#cube-edit').addEventListener('click', editCube);
    $('#cube-delete').addEventListener('click', deleteCube);
    $('#cube-refresh').addEventListener('click', refreshCubes);
    $('#cube-export').addEventListener('click', exportCubesCsv);
    $('#cube-search').addEventListener('input', filterCubes);

    $('#lube-add').addEventListener('click', addLube);
    $('#lube-edit').addEventListener('click', editLube);
    $('#lube-delete').addEventListener('click', deleteLube);
    $('#lube-refresh').addEventListener('click', refreshLubes);
    $('#lube-export').addEventListener('click', exportLubesCsv);
    $('#lube-search').addEventListener('input', filterLubes);

    $$('#cube-table thead th').forEach((th) => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (state.cubeSort.col === col) {
                state.cubeSort.dir *= -1;
            } else {
                state.cubeSort = { col, dir: 1 };
            }
            renderCubeTable();
        });
    });

    $$('#lube-table thead th').forEach((th) => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (state.lubeSort.col === col) {
                state.lubeSort.dir *= -1;
            } else {
                state.lubeSort = { col, dir: 1 };
            }
            renderLubeTable();
        });
    });
}

async function boot() {
    try {
        state.settings = Object.assign({}, DEFAULT_SETTINGS, await api.getSettings());
    } catch (err) {
        await errorBox('Database Error', 'Could not read settings:\n' + err.message);
        state.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
    try {
        await api.migrateIfNeeded();
    } catch (err) {
        console.error(err);
    }
    try {
        state.sessions = await api.getSessions();
        if (!state.sessions.length) {
            state.sessions = DEFAULT_SESSIONS.slice();
            await api.saveSessions(state.sessions);
        }
        state.sessionMap = Object.fromEntries(state.sessions);
        const preferred = state.sessions.find(([, pid]) => pid === '333');
        state.currentSession = preferred ? preferred[0] : state.sessions[0][0];
        state.timesBySession = await api.getTimes();
        state.solves = state.timesBySession[state.currentSession] || [];
    } catch (err) {
        await errorBox('Database Error', 'Could not read timer data:\n' + err.message);
        state.sessions = DEFAULT_SESSIONS.slice();
        state.sessionMap = Object.fromEntries(state.sessions);
        state.currentSession = '3x3';
        state.timesBySession = {};
        state.solves = [];
    }

    rebuildSessionSelect();
    setupTabs();
    setupCollectionEvents();
    setupTimerEvents();
    setupSettingsTab();
    syncSettingsControls();
    applyAppearance();
    applyTimerSettings(state.settings);

    try {
        await loadCubesUI();
        await loadLubesUI();
    } catch (err) {
        await errorBox('Database Error', 'Could not read collections:\n' + err.message);
    }

    renderSolves();
    refreshStats();
    setTimeDisplay(idleText());

    if ('speechSynthesis' in window) {
        speechSynthesis.onvoiceschanged = populateVoices;
        populateVoices();
    }

    document.title = TAB_TITLES.cubes;
    setStatus('Ready');
}

boot();

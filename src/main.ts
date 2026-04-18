// ─── Types ───────────────────────────────────────────────────────────────────
type Move      = -1 | 0 | 1;
type SimResult = 'accepted' | 'rejected' | 'halted' | 'max_steps' | 'error';
type SimMode   = 'local' | 'server';

interface TransitionRule { write: string; move: Move; next: string; }
interface TransitionMap  { [key: string]: TransitionRule; }

interface StepLog {
  step: number; state: string; head: number;
  read: string; written: string; move: string; nextState: string;
}
interface SimulateResponse {
  steps: StepLog[]; finalState: string; finalTape: string[];
  result: SimResult; totalSteps: number; message?: string;
}
interface StepResponse {
  tape: string[]; head: number; state: string; written: number;
  log: StepLog; result?: Exclude<SimResult, 'max_steps'>;
}
interface Preset {
  id: string; name: string; description: string; input: string;
  transitions: TransitionMap; acceptStates: string[]; rejectStates: string[];
}

// ─── Config ───────────────────────────────────────────────────────────────────
// Use relative path for Vercel, but allow localhost for dev
let API_URL = '/api';
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
   // If you are running the backend separately on 3001, otherwise /api works with 'vercel dev'
   if (!window.location.port || window.location.port === '5500' || window.location.port === '3000') {
      API_URL = 'http://localhost:3001/api';
   }
}

// ─── Machine State ────────────────────────────────────────────────────────────
let tape:        string[]      = [];
let head:        number        = 0;
let state:       string        = 'q0';
let steps:       number        = 0;
let running:     boolean       = false;
let intervalId:  any           = null;
let speed:       number        = 500;
let lastWritten: number        = -1;
let simMode:     SimMode       = 'local';

// Playback state for server-run mode
let serverSteps: StepLog[]     = [];
let serverFinalTape: string[]  = [];
let serverFinalState: string   = '';
let serverResult: SimResult    = 'halted';
let playbackIdx: number        = 0;

let transitions:  TransitionMap = {};
let acceptStates: string[]      = ['accept', 'halt'];
let rejectStates: string[]      = ['reject'];

// ─── Preset Definitions ───────────────────────────────────────────────────────
const LOCAL_PRESETS: Record<string, Preset> = {
  flipBits: {
    id: 'flipBits', name: 'Flip All Bits',
    description: 'Flips every bit (0↔1) then halts.',
    input: '1011',
    transitions: {
      'q0_0': { write: '1', move:  1, next: 'q0' },
      'q0_1': { write: '0', move:  1, next: 'q0' },
      'q0__': { write: '_', move:  0, next: 'halt' },
    },
    acceptStates: ['halt'], rejectStates: [],
  },
  incrementBinary: {
    id: 'incrementBinary', name: 'Increment Binary',
    description: 'Increments a binary number by 1.',
    input: '1011',
    transitions: {
      'q0_0': { write: '0', move:  1, next: 'q0' },
      'q0_1': { write: '1', move:  1, next: 'q0' },
      'q0__': { write: '_', move: -1, next: 'q1' },
      'q1_1': { write: '0', move: -1, next: 'q1' },
      'q1_0': { write: '1', move:  0, next: 'halt' },
      'q1__': { write: '1', move:  0, next: 'halt' },
    },
    acceptStates: ['halt'], rejectStates: [],
  },
  equalAB: {
    id: 'equalAB', name: 'Accept aⁿbⁿ',
    description: 'Accepts strings of the form aⁿbⁿ (equal number of a\'s and b\'s).',
    input: 'aaabbb',
    transitions: {
      'q0_a': { write: 'X', move:  1, next: 'q1' },
      'q0_Y': { write: 'Y', move:  1, next: 'q3' },
      'q0__': { write: '_', move:  0, next: 'reject' },
      'q1_a': { write: 'a', move:  1, next: 'q1' },
      'q1_Y': { write: 'Y', move:  1, next: 'q1' },
      'q1_b': { write: 'Y', move: -1, next: 'q2' },
      'q1__': { write: '_', move:  0, next: 'reject' },
      'q2_a': { write: 'a', move: -1, next: 'q2' },
      'q2_Y': { write: 'Y', move: -1, next: 'q2' },
      'q2_X': { write: 'X', move:  1, next: 'q0' },
      'q3_Y': { write: 'Y', move:  1, next: 'q3' },
      'q3__': { write: '_', move:  0, next: 'accept' },
      'q3_b': { write: 'b', move:  0, next: 'reject' },
    },
    acceptStates: ['accept'], rejectStates: ['reject'],
  },
  palindrome: {
    id: 'palindrome', name: 'Accept Palindromes',
    description: 'Accepts binary palindromes (e.g. 10101).',
    input: '10101',
    transitions: {
      'q0_0': { write: 'X', move:  1, next: 'q1' },
      'q0_1': { write: 'X', move:  1, next: 'q2' },
      'q0_X': { write: 'X', move:  0, next: 'accept' },
      'q0__': { write: '_', move:  0, next: 'accept' },
      'q1_0': { write: '0', move:  1, next: 'q1' },
      'q1_1': { write: '1', move:  1, next: 'q1' },
      'q1_X': { write: 'X', move: -1, next: 'q5' },
      'q1__': { write: '_', move: -1, next: 'q5' },
      'q2_0': { write: '0', move:  1, next: 'q2' },
      'q2_1': { write: '1', move:  1, next: 'q2' },
      'q2_X': { write: 'X', move: -1, next: 'q6' },
      'q2__': { write: '_', move: -1, next: 'q6' },
      'q5_0': { write: 'X', move: -1, next: 'q3' },
      'q5_1': { write: '1', move:  0, next: 'reject' },
      'q5_X': { write: 'X', move:  0, next: 'accept' },
      'q6_1': { write: 'X', move: -1, next: 'q3' },
      'q6_0': { write: '0', move:  0, next: 'reject' },
      'q6_X': { write: 'X', move:  0, next: 'accept' },
      'q3_0': { write: '0', move: -1, next: 'q3' },
      'q3_1': { write: '1', move: -1, next: 'q3' },
      'q3_X': { write: 'X', move:  1, next: 'q0' },
      'q3__': { write: '_', move:  1, next: 'q0' },
    },
    acceptStates: ['accept'], rejectStates: ['reject'],
  },
  custom: {
    id: 'custom', name: '✏️ Custom Code', description: 'Rules: state_symbol: write,move,next',
    input: '', transitions: {}, acceptStates: ['accept','halt'], rejectStates: ['reject'],
  },
};

// ─── DOM Initializer ──────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  populatePresetSelect();
  doLoadPreset();
  checkServerHealth();
});

function populatePresetSelect(): void {
  const sel = document.getElementById('presetSelect') as HTMLSelectElement;
  if (!sel) return;
  sel.innerHTML = Object.entries(LOCAL_PRESETS).map(([id, p]) =>
    `<option value="${id}">${p.name}</option>`
  ).join('');
}

// ─── Health Check ─────────────────────────────────────────────────────────────
async function checkServerHealth(): Promise<void> {
  const indicator = document.getElementById('serverIndicator');
  if (!indicator) return;
  try {
    const r = await fetch(`${API_URL}/presets`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      indicator.className = 'server-dot online';
      indicator.title = 'Backend Online';
      setModeAvailability(true);
    } else { throw new Error(); }
  } catch (err) {
    indicator.className = 'server-dot offline';
    indicator.title = 'Backend Offline — Local Mode Only';
    setModeAvailability(false);
    if (simMode === 'server') doSwitchMode('local');
  }
}

function setModeAvailability(online: boolean): void {
  const serverBtn = document.getElementById('modeServer') as HTMLButtonElement | null;
  if (serverBtn) serverBtn.disabled = !online;
}

// ─── Mode & Presets ────────────────────────────────────────────────────────────
function doSwitchMode(mode: SimMode): void {
  simMode = mode;
  document.getElementById('modeLocal')?.classList.toggle('active', mode === 'local');
  document.getElementById('modeServer')?.classList.toggle('active', mode === 'server');
  showToast(`Engine: ${mode === 'local' ? 'Local Browser' : 'Cloud Compute'}`, 'info');
}
(window as any).switchMode = doSwitchMode;

function doLoadPreset(): void {
  const sel = document.getElementById('presetSelect') as HTMLSelectElement;
  if (!sel) return;
  const key = sel.value;
  const preset = LOCAL_PRESETS[key];
  if (!preset) return;

  transitions = { ...preset.transitions };
  acceptStates = [...preset.acceptStates];
  rejectStates = [...preset.rejectStates];

  const inputEl = document.getElementById('inputString') as HTMLInputElement;
  const editorEl = document.getElementById('transitionEditor') as HTMLTextAreaElement;
  if (inputEl) inputEl.value = preset.input;
  if (editorEl) editorEl.value = transitionsToText(transitions);

  (window as any).initialize();
  updateTransitionTable();
}
(window as any).loadPreset = doLoadPreset;

// ─── Actions ──────────────────────────────────────────────────────────────────
(window as any).applyTransitions = function(): void {
  const editor = document.getElementById('transitionEditor') as HTMLTextAreaElement;
  if (!editor) return;
  transitions = parseTransitions(editor.value);
  updateTransitionTable();
  showToast('Transitions Applied ✅', 'success');
  (window as any).initialize();
};

(window as any).savePresetToServer = async function(): Promise<void> {
  if (simMode === 'local' && (document.getElementById('serverIndicator')?.classList.contains('offline'))) {
      showToast('Server is offline — cannot save.', 'error');
      return;
  }
  const name = prompt('Name your machine:');
  if (!name) return;
  try {
    const r = await fetch(`${API_URL}/presets`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name, transitions, acceptStates, rejectStates,
        input: (document.getElementById('inputString') as HTMLInputElement).value
      }),
    });
    if (r.ok) showToast(`Saved to Cloud: ${name} ☁️`, 'success');
    else {
      const d = await r.json();
      showToast(d.error || 'Save failed', 'error');
    }
  } catch {
    showToast('Network error — save failed.', 'error');
  }
};

function parseTransitions(text: string): TransitionMap {
  const result: TransitionMap = {};
  text.split('\n').forEach(line => {
    line = line.split('#')[0].trim(); // Remove comments
    if (!line) return;
    const [keyPart, valPart] = line.split(':').map(s => s.trim());
    if (!keyPart || !valPart) return;
    const key = keyPart.replace(/\s/g, '');
    const [write, moveStr, next] = valPart.split(',').map(s => s.trim());
    if (!write || !moveStr || !next) return;
    const move = moveStr.toUpperCase() === 'R' ? 1 : moveStr.toUpperCase() === 'L' ? -1 : 0;
    result[key] = { write, move: move as Move, next };
  });
  return result;
}

function transitionsToText(t: TransitionMap): string {
  return Object.entries(t).map(([k, v]) => {
    const mv = v.move === 1 ? 'R' : v.move === -1 ? 'L' : 'N';
    return `${k}: ${v.write},${mv},${v.next}`;
  }).join('\n');
}

// ─── Core Simulator ───────────────────────────────────────────────────────────
(window as any).initialize = function(): void {
  (window as any).pause();
  const inputEl = document.getElementById('inputString') as HTMLInputElement;
  const input = inputEl ? inputEl.value.trim() : '';
  tape = ['_', ...input.split(''), '_'];
  head = 1;
  state = 'q0';
  steps = 0;
  lastWritten = -1;
  serverSteps = [];
  playbackIdx = 0;

  clearLog();
  hideResult();
  updateStatus('LOADED', '');
  render();
  updateInfoBar();
  setButtonStates(false);
};

(window as any).resetMachine = function(): void {
  (window as any).initialize();
  showToast('Simulator Reset', 'info');
};

function localStep(): void {
  if (tape.length === 0) return;
  if (isTerminal(state)) { handleTerminal(); return; }

  const symbol = tape[head] || '_';
  const key = `${state}_${symbol}`;
  const action = transitions[key];

  if (!action) {
    addLog(steps, state, symbol, '—', '—', 'REJECT');
    showResult('rejected', `❌ REJECTED: No rule for (${state}, ${symbol})`);
    updateStatus('REJECTED', 'rejected');
    state = 'reject';
    (window as any).pause();
    return;
  }

  addLog(steps, state, symbol, action.write, action.move === 1 ? 'R' : action.move === -1 ? 'L' : 'N', action.next);

  tape[head] = action.write;
  lastWritten = head;
  head += action.move;
  state = action.next;
  steps++;

  if (head < 0) { tape.unshift('_'); head = 0; }
  if (head >= tape.length) { tape.push('_'); }

  render();
  updateInfoBar();
  if (isTerminal(state)) handleTerminal();
}

async function serverStep(): Promise<void> {
  try {
    const r = await fetch(`${API_URL}/simulate/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tape, head, state, transitions, acceptStates, rejectStates }),
    });
    const data = await r.json() as StepResponse;
    tape = data.tape;
    head = data.head;
    state = data.state;
    lastWritten = data.written;
    steps++;

    addLog(data.log.step, data.log.state, data.log.read, data.log.written, data.log.move, data.log.nextState);
    render();
    updateInfoBar();

    if (data.result) {
       handleTerminal();
       (window as any).pause();
    }
  } catch {
    showToast('Server Error — Switching to Local', 'error');
    doSwitchMode('local');
    localStep();
  }
}

(window as any).step = function(): void {
  if (simMode === 'server') serverStep();
  else localStep();
};

(window as any).run = function(): void {
  if (running) return;
  if (tape.length <= 2 && (document.getElementById('inputString') as HTMLInputElement).value) {
      (window as any).initialize();
  }
  if (isTerminal(state)) return;

  if (simMode === 'server') {
     serverRun();
     return;
  }

  running = true;
  setButtonStates(true);
  updateStatus('RUNNING', 'running');
  intervalId = setInterval(() => {
    if (isTerminal(state)) { (window as any).pause(); handleTerminal(); }
    else localStep();
  }, speed);
};

async function serverRun(): Promise<void> {
  const input = (document.getElementById('inputString') as HTMLInputElement).value.trim();
  try {
    updateStatus('THINKING...', 'running');
    const r = await fetch(`${API_URL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, transitions, acceptStates, rejectStates, maxSteps: 1000 }),
    });
    const data = await r.json() as SimulateResponse;
    serverSteps = data.steps;
    serverFinalTape = data.finalTape;
    serverFinalState = data.finalState;
    serverResult = data.result;
    playbackIdx = 0;

    // Reset for playback
    tape = ['_', ...input.split(''), '_'];
    head = 1; state = 'q0'; steps = 0; lastWritten = -1;

    running = true;
    setButtonStates(true);
    updateStatus('PLAYBACK', 'running');
    intervalId = setInterval(() => {
      if (playbackIdx >= serverSteps.length) {
        tape = [...serverFinalTape];
        state = serverFinalState;
        render(); updateInfoBar();
        showResult(serverResult, data.message || 'Halted');
        updateStatus(serverResult.toUpperCase(), serverResult);
        (window as any).pause();
        return;
      }
      const log = serverSteps[playbackIdx++];
      addLog(log.step, log.state, log.read, log.written, log.move, log.nextState);
      tape[log.head] = log.written !== '—' ? log.written : tape[log.head];
      lastWritten = log.head;
      head = log.head + (log.move === 'R' ? 1 : log.move === 'L' ? -1 : 0);
      state = log.nextState;
      steps = log.step + 1;
      if (head < 0) { tape.unshift('_'); head = 0; }
      if (head >= tape.length) { tape.push('_'); }
      render(); updateInfoBar();
    }, speed);
  } catch {
    showToast('Server Error', 'error');
    doSwitchMode('local');
  }
}

(window as any).pause = function(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  running = false;
  setButtonStates(false);
  if (!isTerminal(state)) updateStatus('PAUSED', '');
};

// ─── UI Rendering ─────────────────────────────────────────────────────────────
function render(): void {
  const tapeEl = document.getElementById('tape');
  if (!tapeEl) return;
  tapeEl.innerHTML = '';

  tape.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = 'cell';
    if (cell === '_') div.classList.add('blank');
    if (idx === head) div.classList.add('head');
    if (idx === lastWritten && idx !== head) div.classList.add('just-written');
    div.textContent = cell;
    tapeEl.appendChild(div);
  });

  const wrapper = document.querySelector('.tape-scroll-wrapper') as HTMLElement;
  const headCell = tapeEl.children[head] as HTMLElement;
  if (headCell && wrapper) {
    const target = headCell.offsetLeft - (wrapper.clientWidth / 2) + (headCell.offsetWidth / 2);
    wrapper.scrollTo({ left: target, behavior: 'smooth' });
    const arrow = document.getElementById('headArrow');
    if (arrow) {
      const arrowPos = headCell.offsetLeft + (headCell.offsetWidth / 2) - wrapper.scrollLeft;
      arrow.style.left = `${arrowPos}px`;
    }
  }
}

function updateInfoBar(): void {
  setText('stateDisplay', state);
  setText('headDisplay', String(head));
  setText('stepsDisplay', String(steps));
  const sym = tape[head] || '_';
  setText('lastReadDisplay', sym === '_' ? '⬜' : sym);
}

function updateTransitionTable(): void {
  const wrap = document.getElementById('transitionTableDisplay');
  if (!wrap) return;
  const res = Object.entries(transitions);
  if (!res.length) {
    wrap.innerHTML = '<p class="label-hint">No rules defined.</p>';
    return;
  }
  let h = `<table class="tt"><thead><tr><th>Rule</th><th>Write</th><th>Move</th><th>Next</th></tr></thead><tbody>`;
  res.forEach(([k, v]) => {
    h += `<tr><td>${k}</td><td>${v.write}</td><td>${v.move === 1 ? 'R' : 'L'}</td><td>${v.next}</td></tr>`;
  });
  wrap.innerHTML = h + '</tbody></table>';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isTerminal(s: string): boolean {
  return acceptStates.includes(s) || rejectStates.includes(s) || s === 'halt' || s === 'accept' || s === 'reject';
}

function handleTerminal(): void {
  const isAccept = acceptStates.includes(state) || state === 'accept';
  const res = isAccept ? 'accepted' : 'rejected';
  showResult(res, `${isAccept ? '✅ ACCEPTED' : '❌ REJECTED'} in ${steps} steps`);
  updateStatus(res.toUpperCase(), res);
}

function addLog(s: number, st: string, r: string, w: string, m: string, next: string): void {
  const log = document.getElementById('computationLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span>${s}</span><span>${st}</span><span>${r}</span><span>${w}</span><span>${m} → ${next}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  setText('logCount', `${s + 1} steps`);
}

function clearLog(): void {
  const log = document.getElementById('computationLog');
  if (log) log.innerHTML = '';
  setText('logCount', '0 steps');
}

function showResult(cls: string, msg: string): void {
  const b = document.getElementById('resultBanner');
  if (b) { b.className = `result-banner ${cls}`; b.textContent = msg; }
}

function hideResult(): void {
  const b = document.getElementById('resultBanner');
  if (b) b.className = 'result-banner hidden';
}

function updateStatus(txt: string, cls: string): void {
  const b = document.getElementById('statusBadge');
  if (b) { b.textContent = txt; b.className = `status-badge ${cls}`; }
}

function setButtonStates(run: boolean): void {
  (document.getElementById('runBtn') as any).disabled = run;
  (document.getElementById('pauseBtn') as any).disabled = !run;
  (document.getElementById('stepBtn') as any).disabled = run;
}

(window as any).updateSpeed = function(v: string): void {
  speed = parseInt(v);
  setText('speedLabel', `${v}ms`);
  if (running) { (window as any).pause(); (window as any).run(); }
};

function setText(id: string, v: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function showToast(m: string, t: string): void {
  const d = document.createElement('div');
  d.className = `toast ${t}`;
  d.style.cssText = `position:fixed;bottom:20px;right:20px;background:#333;color:#fff;padding:10px 20px;border-radius:10px;z-index:9999;border-left:5px solid ${t === 'success' ? '#4ade80' : '#f87171'}`;
  d.textContent = m;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3000);
}

// ─── Types (mirrored from backend) ───────────────────────────────────────────
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
// ─── Config ───────────────────────────────────────────────────────────────────
const API_URL = '/api';

// ─── Machine State ────────────────────────────────────────────────────────────
let tape:        string[]      = [];
let head:        number        = 0;
let state:       string        = 'q0';
let steps:       number        = 0;
let running:     boolean       = false;
let intervalId:  ReturnType<typeof setInterval> | null = null;
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
    description: 'Accepts strings of the form aⁿbⁿ.',
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
  incrementUnary: {
    id: 'incrementUnary', name: 'Increment Unary',
    description: 'Appends one extra 1 to a unary number.',
    input: '111',
    transitions: {
      'q0_1': { write: '1', move:  1, next: 'q0' },
      'q0__': { write: '1', move:  0, next: 'halt' },
    },
    acceptStates: ['halt'], rejectStates: [],
  },
  palindrome: {
    id: 'palindrome', name: 'Accept Palindromes',
    description: 'Accepts binary palindromes by marking outermost pairs.',
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
    id: 'custom', name: '✏️ Custom', description: 'Write your own rules below.',
    input: '', transitions: {}, acceptStates: ['accept','halt'], rejectStates: ['reject'],
  },
};

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  populatePresetSelect();
  doLoadPreset();
  checkServerHealth();
});

function populatePresetSelect(): void {
  const sel = document.getElementById('presetSelect') as HTMLSelectElement;
  sel.innerHTML = Object.entries(LOCAL_PRESETS).map(([id, p]) =>
    `<option value="${id}">${p.name}</option>`
  ).join('');
}

// ─── Server Health Check ──────────────────────────────────────────────────────
async function checkServerHealth(): Promise<void> {
  const indicator = document.getElementById('serverIndicator');
  if (!indicator) return;
  try {
    // Increased timeout to 5s to allow for Vercel Cold Starts
    const r = await fetch(`${API_URL}/presets`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      indicator.className   = 'server-dot online';
      indicator.title       = 'Backend online (Vercel Functions)';
      setModeAvailability(true);
    } else {
      console.warn('Server responded with error:', r.status);
      throw new Error();
    }
  } catch (err) {
    console.error('API health check failed:', err);
    indicator.className = 'server-dot offline';
    indicator.title     = 'Backend offline — Using local engine';
    setModeAvailability(false);
    if (simMode === 'server') doSwitchMode('local');
  }
}

function setModeAvailability(online: boolean): void {
  const serverBtn = document.getElementById('modeServer') as HTMLButtonElement | null;
  if (serverBtn) serverBtn.disabled = !online;
}

// ─── Mode Toggle ──────────────────────────────────────────────────────────────
function doSwitchMode(mode: SimMode): void {
  simMode = mode;
  document.getElementById('modeLocal')!.classList.toggle('active', mode === 'local');
  document.getElementById('modeServer')!.classList.toggle('active', mode === 'server');
  showToast(`Mode: ${mode === 'local' ? '🖥️ Local engine' : '☁️ Server engine'}`, 'info');
}
(window as any).switchMode = doSwitchMode;

// ─── Preset Loader ────────────────────────────────────────────────────────────
function doLoadPreset(): void {
  const key    = (document.getElementById('presetSelect') as HTMLSelectElement).value;
  const preset = LOCAL_PRESETS[key];
  if (!preset) return;

  transitions  = { ...preset.transitions };
  acceptStates = [...preset.acceptStates];
  rejectStates = [...preset.rejectStates];

  (document.getElementById('inputString') as HTMLInputElement).value = preset.input;
  (document.getElementById('transitionEditor') as HTMLTextAreaElement).value =
    transitionsToText(transitions);

  resetMachine();
  updateTransitionTable();
  updatePresetsFromServer();
}
(window as any).loadPreset = doLoadPreset;

async function updatePresetsFromServer(): Promise<void> {
  try {
    const r = await fetch(`${API_URL}/presets`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return;
    const data = await r.json() as { presets: Preset[] };
    // Merge server presets into select if any custom ones exist
    const sel = document.getElementById('presetSelect') as HTMLSelectElement;
    const customServerPresets = data.presets.filter(p => p.id.startsWith('custom_'));
    customServerPresets.forEach(p => {
      if (!sel.querySelector(`option[value="${p.id}"]`)) {
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = `☁️ ${p.name}`;
        sel.appendChild(opt);
        LOCAL_PRESETS[p.id] = p;
      }
    });
  } catch { /* server offline, skip */ }
}

// ─── Transition Editor ────────────────────────────────────────────────────────
(window as any).applyTransitions = function(): void {
  const text = (document.getElementById('transitionEditor') as HTMLTextAreaElement).value;
  transitions = parseTransitions(text);
  updateTransitionTable();
  showToast('Transitions applied ✅', 'success');
  resetMachine();
};

(window as any).savePresetToServer = async function(): Promise<void> {
  const name = prompt('Preset name:');
  if (!name) return;
  try {
    const r = await fetch(`${API_URL}/presets`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name, description: 'Custom preset',
        input: (document.getElementById('inputString') as HTMLInputElement).value,
        transitions, acceptStates, rejectStates,
      }),
    });
    const data = await r.json();
    if (r.ok) showToast(`Saved to server as "${name}" (id: ${data.id}) ☁️`, 'success');
    else      showToast(`Save failed: ${data.error}`, 'error');
  } catch (err: any) {
    console.error('Save error:', err);
    showToast(`Server unreachable or not supported in this deployment.`, 'error');
  }
};

function parseTransitions(text: string): TransitionMap {
  const result: TransitionMap = {};
  for (const raw of text.split('\n')) {
    const line  = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key   = line.slice(0, colon).trim().replace(/\s/g, '');
    const parts = line.slice(colon + 1).trim().split(',').map(s => s.trim());
    if (parts.length < 3) continue;
    const write  = parts[0];
    const mv     = parts[1].toUpperCase();
    const next   = parts[2];
    const move   = mv === 'R' ? 1 : mv === 'L' ? -1 : 0;
    result[key]  = { write, move: move as Move, next };
  }
  return result;
}

function transitionsToText(t: TransitionMap): string {
  return Object.entries(t).map(([k, v]) => {
    const mv = v.move === 1 ? 'R' : v.move === -1 ? 'L' : 'N';
    return `${k}: ${v.write},${mv},${v.next}`;
  }).join('\n');
}

function updateTransitionTable(): void {
  const wrap    = document.getElementById('transitionTableDisplay')!;
  const entries = Object.entries(transitions);
  if (!entries.length) {
    wrap.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;padding:8px">No transitions defined.</p>';
    return;
  }
  let html = `<table class="tt"><thead><tr>
    <th>Key</th><th>State</th><th>Read</th><th>Write</th><th>Move</th><th>Next State</th>
  </tr></thead><tbody>`;
  for (const [key, v] of entries) {
    const parts  = key.split('_');
    const st     = parts[0];
    const sym    = parts.slice(1).join('_') || '_';
    const mvStr  = v.move === 1 ? '→ R' : v.move === -1 ? '← L' : '● N';
    const nxtCls = acceptStates.includes(v.next) ? 'tt-next'
                 : (rejectStates.includes(v.next) || v.next === 'reject') ? 'tt-halt'
                 : 'tt-next';
    html += `<tr>
      <td class="tt-state">${esc(key)}</td>
      <td class="tt-state">${esc(st)}</td>
      <td class="tt-symbol">${esc(sym)}</td>
      <td class="tt-write">${esc(v.write)}</td>
      <td class="tt-move">${mvStr}</td>
      <td class="${nxtCls}">${esc(v.next)}</td>
    </tr>`;
  }
  wrap.innerHTML = html + '</tbody></table>';
}

// ─── Machine Operations ───────────────────────────────────────────────────────
(window as any).initialize = function(): void {
  pauseMachine();
  const input = (document.getElementById('inputString') as HTMLInputElement).value.trim();
  tape  = ['_', ...input.split(''), '_'];
  head  = 1; state = 'q0'; steps = 0; lastWritten = -1;
  serverSteps = []; playbackIdx = 0;
  clearLog(); hideResult();
  updateStatus('LOADED', '');
  render(); updateInfoBar(); setButtonStates(false);
};

function resetMachine(): void {
  pauseMachine();
  tape = []; head = 0; state = 'q0'; steps = 0; lastWritten = -1;
  serverSteps = []; playbackIdx = 0;
  (document.getElementById('tape') as HTMLElement).innerHTML = '';
  clearLog(); hideResult();
  updateStatus('READY', '');
  updateInfoBar(); setButtonStates(false);
}

// ── LOCAL Step ────────────────────────────────────────────────────────────────
function localStep(): void {
  if (!tape.length) { (window as any).initialize(); return; }

  if (isTerminal(state)) { handleTerminal(); return; }

  const symbol = tape[head] ?? '_';
  const key    = `${state}_${symbol}`;
  const action = transitions[key];

  if (!action) {
    addLog(steps, state, symbol, '—', '—', `No transition for "${key}"`);
    showResult('rejected', `❌ REJECTED — no transition for (${state}, "${symbol}") after ${steps} steps`);
    updateStatus('REJECTED', 'rejected');
    state = 'reject';
    pauseMachine();
    return;
  }

  addLog(steps, state, symbol, action.write,
    action.move === 1 ? 'R' : action.move === -1 ? 'L' : 'N', action.next);

  tape[head] = action.write;
  lastWritten = head;
  head  += action.move;
  state  = action.next;
  steps++;

  if (head < 0)              { tape.unshift('_'); head = 0; }
  if (head >= tape.length)   { tape.push('_'); }

  render(); updateInfoBar();
  if (isTerminal(state)) handleTerminal();
}

// ── SERVER Step (stateless API call) ─────────────────────────────────────────
async function serverStep(): Promise<void> {
  if (!tape.length) { (window as any).initialize(); return; }
  if (isTerminal(state)) { handleTerminal(); return; }

  try {
    const r = await fetch(`${API_URL}/simulate/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tape, head, state, transitions, acceptStates, rejectStates }),
    });
    const data = await r.json() as StepResponse;
    tape        = data.tape;
    head        = data.head;
    state       = data.state;
    lastWritten = data.written;
    steps++;

    addLog(data.log.step, data.log.state, data.log.read,
           data.log.written, data.log.move, data.log.nextState);
    render(); updateInfoBar();

    if (data.result) {
      showResult(data.result,
        `${data.result === 'accepted' ? '✅ ACCEPTED' : '❌ REJECTED'} — "${state}" after ${steps} steps`);
      updateStatus(data.result.toUpperCase(), data.result === 'accepted' ? 'accepted' : 'rejected');
      pauseMachine();
    }
  } catch {
    showToast('Server unreachable — switching to local engine.', 'error');
    doSwitchMode('local');
    localStep();
  }
}

// ── SERVER Run (bulk simulate, then play back) ────────────────────────────────
async function serverRun(): Promise<void> {
  if (!tape.length) (window as any).initialize();
  updateStatus('RUNNING', 'running');
  setButtonStates(true);

  const input = (document.getElementById('inputString') as HTMLInputElement).value.trim();
  try {
    const r = await fetch(`${API_URL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, transitions, acceptStates, rejectStates, maxSteps: 2000 }),
    });
    const data = await r.json() as SimulateResponse;
    serverSteps      = data.steps;
    serverFinalTape  = data.finalTape;
    serverFinalState = data.finalState;
    serverResult     = data.result;
    playbackIdx      = 0;

    // Reset to initial tape for visual playback
    tape  = ['_', ...input.split(''), '_'];
    head  = 1; state = 'q0'; steps = 0; lastWritten = -1;

    // Play back each step visually
    running = true;
    intervalId = setInterval(() => {
      if (playbackIdx >= serverSteps.length) {
        // Playback done — show final result
        tape  = [...serverFinalTape];
        head  = serverFinalState === 'halt' || acceptStates.includes(serverFinalState) ? head : head;
        state = serverFinalState;
        render(); updateInfoBar();
        showResult(serverResult, data.message ?? '');
        updateStatus(serverResult.toUpperCase().replace('_', ' '), mapResultCls(serverResult));
        pauseMachine();
        return;
      }
      const log = serverSteps[playbackIdx++];
      addLog(log.step, log.state, log.read, log.written, log.move, log.nextState);

      // Reconstruct tape state for the frame
      if (playbackIdx <= serverSteps.length) {
        tape[log.head] = log.written !== '—' ? log.written : tape[log.head];
        lastWritten    = log.head;
        head           = log.head + (log.move === 'R' ? 1 : log.move === 'L' ? -1 : 0);
        state          = log.nextState;
        steps          = log.step + 1;
        if (head < 0)             { tape.unshift('_'); head = 0; }
        if (head >= tape.length)  { tape.push('_'); }
      }
      render(); updateInfoBar();
    }, speed);

  } catch {
    showToast('Server unreachable — falling back to local engine.', 'error');
    doSwitchMode('local');
    (window as any).run();
  }
}

// ── Public Button Handlers ────────────────────────────────────────────────────
(window as any).step = function(): void {
  if (simMode === 'server') serverStep();
  else                      localStep();
};

(window as any).run = function(): void {
  if (running) return;
  if (!tape.length) (window as any).initialize();
  if (isTerminal(state)) return;

  if (simMode === 'server') { serverRun(); return; }

  running = true;
  setButtonStates(true);
  updateStatus('RUNNING', 'running');
  intervalId = setInterval(() => {
    if (isTerminal(state)) { pauseMachine(); handleTerminal(); }
    else                   { localStep(); }
  }, speed);
};

(window as any).pause = function(): void { pauseMachine(); };

(window as any).resetMachine = function(): void { resetMachine(); };

function pauseMachine(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  running = false;
  setButtonStates(false);
  if (!isTerminal(state)) updateStatus('PAUSED', '');
}

(window as any).updateSpeed = function(val: string): void {
  speed = parseInt(val, 10);
  (document.getElementById('speedLabel') as HTMLElement).textContent = `${val}ms`;
  if (running) { pauseMachine(); (window as any).run(); }
};

(window as any).clearLog = function(): void { clearLog(); };

// ─── Render ───────────────────────────────────────────────────────────────────
function render(): void {
  const tapeEl = document.getElementById('tape') as HTMLElement;
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

  requestAnimationFrame(() => {
    const wrapper  = document.querySelector('.tape-scroll-wrapper') as HTMLElement;
    const headCell = tapeEl.children[head] as HTMLElement | undefined;
    if (headCell && wrapper) {
      const target = headCell.offsetLeft - wrapper.clientWidth / 2 + headCell.offsetWidth / 2;
      wrapper.scrollTo({ left: target, behavior: 'smooth' });
      const arrow     = document.getElementById('headArrow') as HTMLElement;
      const arrowLeft = headCell.offsetLeft + headCell.offsetWidth / 2 - wrapper.scrollLeft;
      arrow.style.left = `${arrowLeft}px`;
    }
  });
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function isTerminal(s: string): boolean {
  return acceptStates.includes(s) || rejectStates.includes(s) || s === 'halt' || s === 'reject';
}

function handleTerminal(): void {
  const r = acceptStates.includes(state) ? 'accepted'
          : (rejectStates.includes(state) || state === 'reject') ? 'rejected'
          : 'halted';
  const icon = r === 'accepted' ? '✅ ACCEPTED' : r === 'rejected' ? '❌ REJECTED' : '⏹ HALTED';
  showResult(r as SimResult, `${icon} — state "${state}" after ${steps} steps`);
  updateStatus(r.toUpperCase(), mapResultCls(r as SimResult));
  pauseMachine();
}

function mapResultCls(r: SimResult): string {
  return r === 'accepted' ? 'accepted' : r === 'rejected' ? 'rejected' : 'halted';
}

function updateInfoBar(): void {
  setText('stateDisplay', state || '—');
  setText('headDisplay',  tape.length ? String(head) : '—');
  setText('stepsDisplay', String(steps));
  const sym = tape.length ? tape[head] : '—';
  setText('lastReadDisplay', sym === '_' ? '⬜' : sym || '—');
}

function addLog(step: number, st: string, read: string, write: string, move: string, note: string): void {
  const log = document.getElementById('computationLog')!;

  if (!log.children.length) {
    const hdr = document.createElement('div');
    hdr.className = 'log-entry log-header-row';
    hdr.innerHTML = `<span>#</span><span>STATE</span><span>READ</span><span>WRITE</span><span>MOVE → NEXT</span>`;
    log.appendChild(hdr);
  }
  const row = document.createElement('div');
  row.className = 'log-entry';
  row.innerHTML = `
    <span class="step-no">${step}</span>
    <span class="log-state">${esc(st)}</span>
    <span class="log-read">${esc(String(read))}</span>
    <span class="log-write">${esc(String(write))}</span>
    <span class="log-move">${esc(move)} <span style="color:var(--text-dim)">${esc(note)}</span></span>
  `;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  (document.getElementById('logCount') as HTMLElement).textContent =
    `${step + 1} step${step > 0 ? 's' : ''}`;
}

function clearLog(): void {
  (document.getElementById('computationLog') as HTMLElement).innerHTML = '';
  (document.getElementById('logCount') as HTMLElement).textContent = '0 steps';
}

function showResult(type: SimResult | string, msg: string): void {
  const el = document.getElementById('resultBanner')!;
  el.className = `result-banner ${type}`;
  el.textContent = msg;
}

function hideResult(): void {
  document.getElementById('resultBanner')!.className = 'result-banner hidden';
}

function updateStatus(label: string, cls: string): void {
  const badge = document.getElementById('statusBadge')!;
  badge.textContent = label;
  badge.className   = 'status-badge' + (cls ? ` ${cls}` : '');
}

function setButtonStates(isRunning: boolean): void {
  (document.getElementById('runBtn')   as HTMLButtonElement).disabled = isRunning;
  (document.getElementById('pauseBtn') as HTMLButtonElement).disabled = !isRunning;
  (document.getElementById('stepBtn')  as HTMLButtonElement).disabled = isRunning;
}

function setText(id: string, val: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(s: string): string {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const colors: Record<string, { bg: string; border: string; color: string }> = {
    success: { bg:'rgba(74,222,128,0.15)',  border:'rgba(74,222,128,0.4)',  color:'#4ade80' },
    error:   { bg:'rgba(248,113,113,0.15)', border:'rgba(248,113,113,0.4)', color:'#f87171' },
    info:    { bg:'rgba(108,99,255,0.15)',  border:'rgba(108,99,255,0.4)',  color:'#a78bfa' },
  };
  const c = colors[type];
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${c.bg};border:1px solid ${c.border};color:${c.color};
    padding:12px 20px;border-radius:10px;font-size:0.85rem;font-weight:600;
    font-family:Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.4);
    backdrop-filter:blur(12px);animation:slideInToast 0.3s cubic-bezier(0.34,1.56,0.64,1);
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

const _style = document.createElement('style');
_style.textContent = `@keyframes slideInToast{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`;
document.head.appendChild(_style);

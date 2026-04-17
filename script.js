// ─── STATE ───────────────────────────────────────────────────────────────────
let tape       = [];
let head       = 0;
let state      = 'q0';
let steps      = 0;
let running    = false;
let intervalId = null;
let speed      = 500;
let lastWritten= -1;

// ─── PRESET MACHINES ─────────────────────────────────────────────────────────
const PRESETS = {
  flipBits: {
    description: "Flips every bit (0→1, 1→0) then halts.",
    input: "1011",
    transitions: {
      "q0_0": { write: "1", move:  1, next: "q0" },
      "q0_1": { write: "0", move:  1, next: "q0" },
      "q0__": { write: "_", move:  0, next: "halt" }
    },
    acceptStates: ["halt"]
  },

  incrementBinary: {
    description: "Increments a binary number by 1 (scans right, adds from right).",
    input: "1011",
    transitions: {
      // Scan right to find end
      "q0_0": { write: "0", move:  1, next: "q0" },
      "q0_1": { write: "1", move:  1, next: "q0" },
      "q0__": { write: "_", move: -1, next: "q1" },
      // Add carry from right
      "q1_1": { write: "0", move: -1, next: "q1" },
      "q1_0": { write: "1", move:  0, next: "halt" },
      "q1__": { write: "1", move:  0, next: "halt" }
    },
    acceptStates: ["halt"]
  },

  equalAB: {
    description: "Accepts strings of form aⁿbⁿ (equal a's followed by equal b's). Uses symbols X/Y as markers.",
    input: "aaabbb",
    transitions: {
      // Mark one 'a' as X and scan right for first 'b', mark as Y
      "q0_a": { write: "X", move:  1, next: "q1" },
      "q0_Y": { write: "Y", move:  1, next: "q3" },
      "q0__": { write: "_", move:  0, next: "reject" },

      // Move right past a's and Y's to find first b
      "q1_a": { write: "a", move:  1, next: "q1" },
      "q1_Y": { write: "Y", move:  1, next: "q1" },
      "q1_b": { write: "Y", move: -1, next: "q2" },
      "q1__": { write: "_", move:  0, next: "reject" },

      // Move left back to start
      "q2_a": { write: "a", move: -1, next: "q2" },
      "q2_Y": { write: "Y", move: -1, next: "q2" },
      "q2_X": { write: "X", move:  1, next: "q0" },

      // Verify all b's are consumed
      "q3_Y": { write: "Y", move:  1, next: "q3" },
      "q3__": { write: "_", move:  0, next: "accept" },
      "q3_b": { write: "b", move:  0, next: "reject" }
    },
    acceptStates: ["accept"],
    rejectStates: ["reject"]
  },

  copyBits: {
    description: "Copies a bit string: input '101' → '101 101'. Uses C as cursor, 0→x, 1→y markers.",
    input: "101",
    transitions: {
      // Init: move to separator
      "q0_0": { write: "0", move:  1, next: "q0" },
      "q0_1": { write: "1", move:  1, next: "q0" },
      "q0__": { write: "_", move:  1, next: "q1" },
      // Append a second copy (simplified: just scan and print again)
      "q1__": { write: "_", move: -1, next: "q2" },
      "q2_0": { write: "0", move: -1, next: "q2" },
      "q2_1": { write: "1", move: -1, next: "q2" },
      "q2__": { write: "_", move:  0, next: "halt" }
    },
    acceptStates: ["halt"]
  },

  custom: {
    description: "Write your own transition rules in the editor.",
    input: "",
    transitions: {},
    acceptStates: ["accept","halt"]
  }
};

// ─── ACTIVE TRANSITIONS ───────────────────────────────────────────────────────
let transitions  = {};
let acceptStates = ["accept","halt"];
let rejectStates = ["reject"];

// ─── INIT ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadPreset();
  updateTransitionTable();
});

// ─── PRESET LOADER ───────────────────────────────────────────────────────────
function loadPreset() {
  const key    = document.getElementById('presetSelect').value;
  const preset = PRESETS[key];
  if (!preset) return;

  transitions  = { ...preset.transitions };
  acceptStates = preset.acceptStates || ["accept","halt"];
  rejectStates = preset.rejectStates || ["reject"];

  document.getElementById('inputString').value = preset.input || '';
  document.getElementById('transitionEditor').value = transitionsToText(transitions);

  resetMachine();
  updateTransitionTable();
}

// ─── PARSE TRANSITION TEXT ────────────────────────────────────────────────────
// Format per line: q0_0: 1,R,q1   OR   q0_0: 1,1,q1  (1=right,-1=left,0=stay)
function parseTransitions(text) {
  const result = {};
  const lines  = text.split('\n');
  for (let raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key   = line.slice(0, colon).trim().replace(/\s/g,'');
    const parts = line.slice(colon+1).trim().split(',').map(s=>s.trim());
    if (parts.length < 3) continue;
    const write = parts[0];
    let   move  = parts[1].toUpperCase();
    const next  = parts[2];
    move = move==='R' ? 1 : move==='L' ? -1 : move==='N' || move==='S' ? 0 : parseInt(move,10);
    result[key] = { write, move, next };
  }
  return result;
}

function transitionsToText(t) {
  return Object.entries(t).map(([k,v]) => {
    const mvStr = v.move===1?'R': v.move===-1?'L':'N';
    return `${k}: ${v.write},${mvStr},${v.next}`;
  }).join('\n');
}

function applyTransitions() {
  const text = document.getElementById('transitionEditor').value;
  transitions = parseTransitions(text);
  updateTransitionTable();
  showToast('Transitions applied ✅', 'success');
  resetMachine();
}

function updateTransitionTable() {
  const wrap = document.getElementById('transitionTableDisplay');
  const entries = Object.entries(transitions);
  if (entries.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;padding:8px">No transitions defined.</p>';
    return;
  }
  let html = `<table class="tt">
    <thead><tr>
      <th>Key (State_Symbol)</th>
      <th>State</th><th>Read</th><th>Write</th><th>Move</th><th>Next State</th>
    </tr></thead><tbody>`;
  for (const [key, v] of entries) {
    const parts  = key.split('_');
    const st     = parts[0];
    const sym    = parts.slice(1).join('_');
    const mvStr  = v.move===1?'→ R': v.move===-1?'← L':'● N';
    const nxtCls = (acceptStates.includes(v.next)) ? 'tt-next' :
                   (rejectStates.includes(v.next) || v.next==='reject') ? 'tt-halt' : 'tt-next';
    html += `<tr>
      <td class="tt-state">${escHtml(key)}</td>
      <td class="tt-state">${escHtml(st)}</td>
      <td class="tt-symbol">${escHtml(sym||'_')}</td>
      <td class="tt-write">${escHtml(v.write)}</td>
      <td class="tt-move">${mvStr}</td>
      <td class="${nxtCls}">${escHtml(v.next)}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ─── MACHINE OPERATIONS ───────────────────────────────────────────────────────
function initialize() {
  pause();
  const input = document.getElementById('inputString').value.trim();
  tape  = ['_', ...input.split(''), '_'];
  head  = 1;
  state = 'q0';
  steps = 0;
  lastWritten = -1;

  clearLog();
  hideResult();
  updateStatus('LOADED', '');
  render();
  updateInfoBar();
  setButtonStates(false);
}

function resetMachine() {
  pause();
  tape  = [];
  head  = 0;
  state = 'q0';
  steps = 0;
  lastWritten = -1;

  document.getElementById('tape').innerHTML = '';
  document.getElementById('headArrow').style.left = '50%';
  clearLog();
  hideResult();
  updateStatus('READY', '');
  updateInfoBar();
  setButtonStates(false);
}

function step() {
  if (!tape.length) { initialize(); return; }

  // Check terminal states
  if (acceptStates.includes(state)) {
    showResult('accepted', `✅ ACCEPTED — halted in state "${state}" after ${steps} steps`);
    updateStatus('ACCEPTED', 'accepted');
    pause();
    return;
  }
  if (rejectStates.includes(state) || state === 'reject') {
    showResult('rejected', `❌ REJECTED — halted in state "${state}" after ${steps} steps`);
    updateStatus('REJECTED', 'rejected');
    pause();
    return;
  }
  if (state === 'halt') {
    showResult('halted', `⏹ HALTED — machine stopped after ${steps} steps`);
    updateStatus('HALTED', 'halted');
    pause();
    return;
  }

  const symbol = tape[head];
  const key    = `${state}_${symbol}`;
  const action = transitions[key];

  if (!action) {
    addLog(steps, state, symbol, '—', '—', `No transition for key "${key}"`);
    showResult('rejected', `❌ REJECTED — no transition for (${state}, "${symbol}") after ${steps} steps`);
    updateStatus('REJECTED', 'rejected');
    state = 'reject';
    pause();
    return;
  }

  const prevState = state;
  addLog(steps, state, symbol, action.write, action.move===1?'R': action.move===-1?'L':'N', action.next);

  tape[head] = action.write;
  lastWritten = head;
  head += action.move;
  state = action.next;
  steps++;

  // Expand tape
  if (head < 0)              { tape.unshift('_'); head = 0; }
  if (head >= tape.length)   { tape.push('_'); }

  render();
  updateInfoBar();

  // Check terminal after move
  if (acceptStates.includes(state)) {
    addLog(steps, state, '—', '—', '—', '→ ACCEPT');
    showResult('accepted', `✅ ACCEPTED — halted in accept state "${state}" after ${steps} steps`);
    updateStatus('ACCEPTED', 'accepted');
    pause();
  } else if (rejectStates.includes(state) || state === 'reject') {
    addLog(steps, state, '—', '—', '—', '→ REJECT');
    showResult('rejected', `❌ REJECTED — halted in reject state "${state}" after ${steps} steps`);
    updateStatus('REJECTED', 'rejected');
    pause();
  } else if (state === 'halt') {
    addLog(steps, state, '—', '—', '—', '→ HALT');
    showResult('halted', `⏹ HALTED — machine stopped after ${steps} steps`);
    updateStatus('HALTED', 'halted');
    pause();
  }
}

function run() {
  if (running) return;
  if (!tape.length) initialize();
  if (acceptStates.includes(state) || rejectStates.includes(state) || state==='halt' || state==='reject') return;

  running = true;
  setButtonStates(true);
  updateStatus('RUNNING', 'running');

  intervalId = setInterval(() => {
    if (acceptStates.includes(state) || rejectStates.includes(state) ||
        state === 'halt' || state === 'reject') {
      pause();
    } else {
      step();
    }
  }, speed);
}

function pause() {
  clearInterval(intervalId);
  intervalId = null;
  running    = false;
  setButtonStates(false);
  if (!acceptStates.includes(state) && !rejectStates.includes(state) &&
      state !== 'halt' && state !== 'reject') {
    updateStatus('PAUSED', '');
  }
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  const tapeEl = document.getElementById('tape');
  tapeEl.innerHTML = '';

  const CELL_W  = 56; // 52px cell + 4px gap
  const VISIBLE = 11; // approx visible cells
  const offset  = Math.max(0, head - Math.floor(VISIBLE / 2));

  tape.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = 'cell';
    if (cell === '_') div.classList.add('blank');
    if (idx === head) div.classList.add('head');
    if (idx === lastWritten && idx !== head) div.classList.add('just-written');
    div.textContent = cell;
    tapeEl.appendChild(div);
  });

  // Scroll head into view
  requestAnimationFrame(() => {
    const wrapper  = document.querySelector('.tape-scroll-wrapper');
    const headCell = tapeEl.children[head];
    if (headCell && wrapper) {
      const cellLeft   = headCell.offsetLeft;
      const cellW      = headCell.offsetWidth;
      const wrapW      = wrapper.clientWidth;
      const scrollTarget = cellLeft - (wrapW / 2) + (cellW / 2);
      wrapper.scrollTo({ left: scrollTarget, behavior: 'smooth' });

      // Position arrow
      const arrow = document.getElementById('headArrow');
      const arrowLeft = cellLeft + cellW / 2 - wrapper.scrollLeft;
      arrow.style.left = arrowLeft + 'px';
    }
  });
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
function updateInfoBar() {
  setText('stateDisplay', state || '—');
  setText('headDisplay', tape.length ? head : '—');
  setText('stepsDisplay', steps);
  const sym = tape.length ? tape[head] : '—';
  setText('lastReadDisplay', sym === '_' ? '⬜' : (sym || '—'));
}

function addLog(step, st, read, write, move, note) {
  const log = document.getElementById('computationLog');

  if (log.children.length === 0) {
    const header = document.createElement('div');
    header.className = 'log-entry log-header-row';
    header.innerHTML = `<span>#</span><span>STATE</span><span>READ</span><span>WRITE</span><span>MOVE</span>`;
    log.appendChild(header);
  }

  const row = document.createElement('div');
  row.className = 'log-entry';
  row.innerHTML = `
    <span class="step-no">${step}</span>
    <span class="log-state">${escHtml(st)}</span>
    <span class="log-read">${escHtml(String(read))}</span>
    <span class="log-write">${escHtml(String(write))}</span>
    <span class="log-move">${escHtml(String(move))} <span style="color:var(--text-dim)">${escHtml(String(note))}</span></span>
  `;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;

  document.getElementById('logCount').textContent = `${step + 1} step${step>0?'s':''}`;
}

function clearLog() {
  const log = document.getElementById('computationLog');
  log.innerHTML = '';
  document.getElementById('logCount').textContent = '0 steps';
}

function showResult(type, msg) {
  const el = document.getElementById('resultBanner');
  el.className = `result-banner ${type}`;
  el.textContent = msg;
}
function hideResult() {
  document.getElementById('resultBanner').className = 'result-banner hidden';
}

function updateStatus(label, cls) {
  const badge = document.getElementById('statusBadge');
  badge.textContent = label;
  badge.className   = 'status-badge' + (cls ? ` ${cls}` : '');
}

function setButtonStates(isRunning) {
  document.getElementById('runBtn').disabled   = isRunning;
  document.getElementById('pauseBtn').disabled = !isRunning;
  document.getElementById('stepBtn').disabled  = isRunning;
}

function updateSpeed(val) {
  speed = parseInt(val, 10);
  document.getElementById('speedLabel').textContent = `${val}ms`;
  if (running) { pause(); run(); }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type='info') {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${type==='success'?'rgba(74,222,128,0.15)':'rgba(108,99,255,0.15)'};
    border:1px solid ${type==='success'?'rgba(74,222,128,0.4)':'rgba(108,99,255,0.4)'};
    color:${type==='success'?'#4ade80':'#a78bfa'};
    padding:12px 20px;border-radius:10px;font-size:0.85rem;font-weight:600;
    font-family:Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.4);
    backdrop-filter:blur(12px);
    animation:slideInToast 0.3s cubic-bezier(0.34,1.56,0.64,1);
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// Inject toast keyframe
const styleEl = document.createElement('style');
styleEl.textContent = `@keyframes slideInToast{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`;
document.head.appendChild(styleEl);
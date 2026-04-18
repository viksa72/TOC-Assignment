// ─── Shared Types for Turing Machine Backend ─────────────────────────────────

export type Move = -1 | 0 | 1;
export type SimResult = 'accepted' | 'rejected' | 'halted' | 'max_steps' | 'error';

// One row in the transition function δ(state, symbol) → (write, move, nextState)
export interface TransitionRule {
  write: string;
  move: Move;
  next: string;
}

// Full transition table: key = "state_symbol"
export interface TransitionMap {
  [key: string]: TransitionRule;
}

// ─── API Request/Response shapes ─────────────────────────────────────────────

export interface SimulateRequest {
  input: string;
  transitions: TransitionMap;
  acceptStates: string[];
  rejectStates: string[];
  maxSteps?: number;        // default 1000
}

export interface StepLog {
  step: number;
  state: string;
  head: number;
  read: string;
  written: string;
  move: string;             // 'R' | 'L' | 'N'
  nextState: string;
}

export interface SimulateResponse {
  steps: StepLog[];
  finalState: string;
  finalTape: string[];
  result: SimResult;
  totalSteps: number;
  message?: string;
}

// Single-step request (stateless — client sends full machine state)
export interface StepRequest {
  tape: string[];
  head: number;
  state: string;
  transitions: TransitionMap;
  acceptStates: string[];
  rejectStates: string[];
}

export interface StepResponse {
  tape: string[];
  head: number;
  state: string;
  written: number;          // index of cell that was written
  log: StepLog;
  result?: Exclude<SimResult, 'max_steps'>;
}

// ─── Preset shape ─────────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  name: string;
  description: string;
  input: string;
  transitions: TransitionMap;
  acceptStates: string[];
  rejectStates: string[];
}

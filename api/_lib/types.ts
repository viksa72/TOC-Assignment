// Shared types for Vercel serverless functions — mirrored from server/src/types.ts
export type Move      = -1 | 0 | 1;
export type SimResult = 'accepted' | 'rejected' | 'halted' | 'max_steps' | 'error';

export interface TransitionRule { write: string; move: Move; next: string; }
export interface TransitionMap  { [key: string]: TransitionRule; }

export interface SimulateRequest {
  input: string;
  transitions: TransitionMap;
  acceptStates: string[];
  rejectStates: string[];
  maxSteps?: number;
}

export interface StepLog {
  step: number; state: string; head: number;
  read: string; written: string; move: string; nextState: string;
}

export interface SimulateResponse {
  steps: StepLog[]; finalState: string; finalTape: string[];
  result: SimResult; totalSteps: number; message?: string;
}

export interface StepRequest {
  tape: string[]; head: number; state: string;
  transitions: TransitionMap; acceptStates: string[]; rejectStates: string[];
}

export interface StepResponse {
  tape: string[]; head: number; state: string; written: number;
  log: StepLog; result?: Exclude<SimResult, 'max_steps'>;
}

export interface Preset {
  id: string; name: string; description: string; input: string;
  transitions: TransitionMap; acceptStates: string[]; rejectStates: string[];
}

/** Strips unknown keys and coerces move to -1 | 0 | 1 */
export function sanitiseTransitions(raw: Record<string, unknown>): TransitionMap {
  const out: TransitionMap = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val && typeof val === 'object') {
      const v = val as Record<string, unknown>;
      const mv = Number(v['move']);
      out[key] = {
        write: String(v['write'] ?? '_'),
        move:  (mv === 1 ? 1 : mv === -1 ? -1 : 0) as Move,
        next:  String(v['next']  ?? 'halt'),
      };
    }
  }
  return out;
}

export function resultMessage(result: string, state: string, steps: number): string {
  switch (result) {
    case 'accepted':  return `✅ Accepted — halted in "${state}" after ${steps} steps.`;
    case 'rejected':  return `❌ Rejected — halted in "${state}" after ${steps} steps.`;
    case 'halted':    return `⏹  Halted in "${state}" after ${steps} steps.`;
    case 'max_steps': return `⚠️ Exceeded ${steps} step limit — possible infinite loop.`;
    default:          return `Unknown result in "${state}" after ${steps} steps.`;
  }
}

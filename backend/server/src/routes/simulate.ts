import { Router, Request, Response } from 'express';
import { TuringMachine } from '../engine/turingMachine';
import {
  SimulateRequest,
  SimulateResponse,
  StepRequest,
  StepResponse,
  TransitionMap,
  Move,
} from '../types';

const router = Router();

// ── POST /api/simulate ────────────────────────────────────────────────────────
// Run a complete simulation server-side; returns every step log + final tape.
router.post('/simulate', (req: Request, res: Response): void => {
  const body = req.body as Partial<SimulateRequest>;

  if (typeof body.input !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "input" field.' });
    return;
  }
  if (!body.transitions || typeof body.transitions !== 'object') {
    res.status(400).json({ error: 'Missing or invalid "transitions" field.' });
    return;
  }

  const input        = body.input;
  const transitions  = sanitiseTransitions(body.transitions);
  const acceptStates = Array.isArray(body.acceptStates) ? body.acceptStates : ['accept', 'halt'];
  const rejectStates = Array.isArray(body.rejectStates) ? body.rejectStates : ['reject'];
  const maxSteps     = typeof body.maxSteps === 'number' ? body.maxSteps : 1000;

  try {
    const tm = new TuringMachine(input, transitions, acceptStates, rejectStates);
    const { logs, result } = tm.run(maxSteps);

    const response: SimulateResponse = {
      steps:      logs,
      finalState: tm.getState(),
      finalTape:  tm.getTape(),
      result,
      totalSteps: tm.getSteps(),
      message:    resultMessage(result, tm.getState(), tm.getSteps()),
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: 'Simulation engine error.', detail: String(err) });
  }
});

// ── POST /api/step ────────────────────────────────────────────────────────────
// Execute a single step given full machine state (stateless endpoint).
router.post('/step', (req: Request, res: Response): void => {
  const body = req.body as Partial<StepRequest>;

  if (!Array.isArray(body.tape) || typeof body.head !== 'number' || typeof body.state !== 'string') {
    res.status(400).json({ error: 'Missing tape, head, or state fields.' });
    return;
  }
  if (!body.transitions || typeof body.transitions !== 'object') {
    res.status(400).json({ error: 'Missing transitions.' });
    return;
  }

  const { tape, head, state } = body;
  const transitions  = sanitiseTransitions(body.transitions);
  const acceptStates = Array.isArray(body.acceptStates) ? body.acceptStates : ['accept', 'halt'];
  const rejectStates = Array.isArray(body.rejectStates) ? body.rejectStates : ['reject'];

  try {
    // Reconstruct machine from the snapshot (skip re-parsing input)
    const tm = new TuringMachine('', transitions, acceptStates, rejectStates);
    // Inject snapshot state
    (tm as any).tape  = [...tape];
    (tm as any).head  = head;
    (tm as any).state = state;

    const wasAt = head;
    const log   = tm.step();

    if (!log) {
      // Already terminal
      const result = tm.getResult();
      const response: StepResponse = {
        tape:    tm.getTape(),
        head:    tm.getHead(),
        state:   tm.getState(),
        written: wasAt,
        log:     {
          step: 0, state, head,
          read: '—', written: '—', move: '—', nextState: state,
        },
        result: result ?? undefined,
      };
      res.json(response);
      return;
    }

    const response: StepResponse = {
      tape:    tm.getTape(),
      head:    tm.getHead(),
      state:   tm.getState(),
      written: wasAt,
      log,
      result:  tm.getResult() ?? undefined,
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: 'Step error.', detail: String(err) });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip unknown keys and coerce move to -1 | 0 | 1 */
function sanitiseTransitions(raw: Record<string, any>): TransitionMap {
  const out: TransitionMap = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val && typeof val === 'object') {
      const move = Number(val.move);
      out[key] = {
        write: String(val.write ?? '_'),
        move:  (move === 1 ? 1 : move === -1 ? -1 : 0) as Move,
        next:  String(val.next ?? 'halt'),
      };
    }
  }
  return out;
}

function resultMessage(result: string, state: string, steps: number): string {
  switch (result) {
    case 'accepted':  return `✅ Accepted — halted in "${state}" after ${steps} steps.`;
    case 'rejected':  return `❌ Rejected — halted in "${state}" after ${steps} steps.`;
    case 'halted':    return `⏹ Halted in "${state}" after ${steps} steps.`;
    case 'max_steps': return `⚠️ Exceeded ${steps} step limit — possible infinite loop.`;
    default:          return `Unknown result in "${state}" after ${steps} steps.`;
  }
}

export default router;

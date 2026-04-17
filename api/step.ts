import { VercelRequest, VercelResponse } from '@vercel/node';
import { TuringMachine } from './_lib/turingMachine';
import { StepRequest, StepResponse, sanitiseTransitions } from './_lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as Partial<StepRequest>;

  if (!Array.isArray(body.tape) || typeof body.head !== 'number' || typeof body.state !== 'string') {
    return res.status(400).json({ error: 'Missing tape, head, or state fields.' });
  }
  if (!body.transitions || typeof body.transitions !== 'object') {
    return res.status(400).json({ error: 'Missing transitions.' });
  }

  const { tape, head, state } = body;
  const transitions = sanitiseTransitions(body.transitions as Record<string, unknown>);
  const acceptStates = Array.isArray(body.acceptStates) ? body.acceptStates : ['accept', 'halt'];
  const rejectStates = Array.isArray(body.rejectStates) ? body.rejectStates : ['reject'];

  try {
    const tm = new TuringMachine('', transitions, acceptStates, rejectStates);
    tm.injectSnapshot(tape, head, state);

    const wasAt = head;
    const log = tm.step();

    if (!log) {
      const result = tm.getResult();
      const response: StepResponse = {
        tape: tm.getTape(),
        head: tm.getHead(),
        state: tm.getState(),
        written: wasAt,
        log: {
          step: 0, state, head,
          read: '—', written: '—', move: '—', nextState: state,
        },
        result: result ?? undefined,
      };
      return res.status(200).json(response);
    }

    const response: StepResponse = {
      tape: tm.getTape(),
      head: tm.getHead(),
      state: tm.getState(),
      written: wasAt,
      log,
      result: tm.getResult() ?? undefined,
    };

    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ error: 'Step error.', detail: String(err) });
  }
}

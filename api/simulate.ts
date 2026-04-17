import { VercelRequest, VercelResponse } from '@vercel/node';
import { TuringMachine } from './_lib/turingMachine';
import { SimulateRequest, SimulateResponse, sanitiseTransitions, resultMessage } from './_lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as Partial<SimulateRequest>;

  if (typeof body.input !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "input" field.' });
  }
  if (!body.transitions || typeof body.transitions !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid "transitions" field.' });
  }

  const input = body.input;
  const transitions = sanitiseTransitions(body.transitions as Record<string, unknown>);
  const acceptStates = Array.isArray(body.acceptStates) ? body.acceptStates : ['accept', 'halt'];
  const rejectStates = Array.isArray(body.rejectStates) ? body.rejectStates : ['reject'];
  const maxSteps = typeof body.maxSteps === 'number' ? body.maxSteps : 1000;

  try {
    const tm = new TuringMachine(input, transitions, acceptStates, rejectStates);
    const { logs, result } = tm.run(maxSteps);

    const response: SimulateResponse = {
      steps: logs,
      finalState: tm.getState(),
      finalTape: tm.getTape(),
      result,
      totalSteps: tm.getSteps(),
      message: resultMessage(result, tm.getState(), tm.getSteps()),
    };

    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ error: 'Simulation engine error.', detail: String(err) });
  }
}

import { Router, Request, Response } from 'express';
import { presets } from '../data/presets';
import { Preset } from '../types';

const router = Router();

// In-memory store for user-saved custom presets (session-scoped)
const customPresets: Map<string, Preset> = new Map();

// ── GET /api/presets ──────────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response): void => {
  const all = [...presets, ...Array.from(customPresets.values())];
  res.json({ presets: all });
});

// ── GET /api/presets/:id ──────────────────────────────────────────────────────
router.get('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const found =
    presets.find(p => p.id === id) ??
    customPresets.get(id);

  if (!found) {
    res.status(404).json({ error: `Preset "${id}" not found.` });
    return;
  }
  res.json(found);
});

// ── POST /api/presets ─────────────────────────────────────────────────────────
// Save a custom preset (persisted for the lifetime of the server process).
router.post('/', (req: Request, res: Response): void => {
  const body = req.body as Partial<Preset>;

  if (!body.name || !body.transitions) {
    res.status(400).json({ error: 'Preset must have at least "name" and "transitions".' });
    return;
  }

  const id = `custom_${Date.now()}`;
  const preset: Preset = {
    id,
    name:         body.name,
    description:  body.description ?? '',
    input:        body.input ?? '',
    transitions:  body.transitions,
    acceptStates: body.acceptStates ?? ['accept', 'halt'],
    rejectStates: body.rejectStates ?? ['reject'],
  };

  customPresets.set(id, preset);
  res.status(201).json({ id, message: 'Preset saved.' });
});

// ── DELETE /api/presets/:id ───────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  if (presets.find(p => p.id === id)) {
    res.status(403).json({ error: 'Cannot delete built-in presets.' });
    return;
  }
  if (!customPresets.has(id)) {
    res.status(404).json({ error: `Preset "${id}" not found.` });
    return;
  }
  customPresets.delete(id);
  res.json({ message: 'Preset deleted.' });
});

export default router;

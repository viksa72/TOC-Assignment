import { TransitionMap, StepLog, SimResult } from '../types';

export class TuringMachine {
  private tape: string[];
  private head: number;
  private state: string;
  private transitions: TransitionMap;
  private acceptStates: Set<string>;
  private rejectStates: Set<string>;
  private stepCount: number;

  constructor(
    input: string,
    transitions: TransitionMap,
    acceptStates: string[],
    rejectStates: string[]
  ) {
    this.tape        = ['_', ...input.split(''), '_'];
    this.head        = 1;
    this.state       = 'q0';
    this.transitions = transitions;
    this.acceptStates = new Set(acceptStates);
    this.rejectStates = new Set([...rejectStates, 'reject']);
    this.stepCount   = 0;
  }

  // ── Snapshot helpers ────────────────────────────────────────────────────────
  getTape():  string[] { return [...this.tape]; }
  getHead():  number   { return this.head; }
  getState(): string   { return this.state; }
  getSteps(): number   { return this.stepCount; }

  isTerminal(): boolean {
    return (
      this.acceptStates.has(this.state) ||
      this.rejectStates.has(this.state) ||
      this.state === 'halt'
    );
  }

  getResult(): Exclude<SimResult, 'max_steps' | 'error'> | null {
    if (this.acceptStates.has(this.state)) return 'accepted';
    if (this.rejectStates.has(this.state)) return 'rejected';
    if (this.state === 'halt')             return 'halted';
    return null;
  }

  // ── Execute one transition ──────────────────────────────────────────────────
  step(): StepLog | null {
    if (this.isTerminal()) return null;

    const symbol = this.tape[this.head] ?? '_';
    const key    = `${this.state}_${symbol}`;
    const action = this.transitions[key];

    if (!action) {
      const log: StepLog = {
        step:      this.stepCount,
        state:     this.state,
        head:      this.head,
        read:      symbol,
        written:   '—',
        move:      '—',
        nextState: 'reject',
      };
      this.state = 'reject';
      return log;
    }

    const moveStr = action.move === 1 ? 'R' : action.move === -1 ? 'L' : 'N';
    const log: StepLog = {
      step:      this.stepCount,
      state:     this.state,
      head:      this.head,
      read:      symbol,
      written:   action.write,
      move:      moveStr,
      nextState: action.next,
    };

    // Apply transition
    this.tape[this.head] = action.write;
    this.head += action.move;
    this.state = action.next;
    this.stepCount++;

    // Expand infinite tape
    if (this.head < 0)                  { this.tape.unshift('_'); this.head = 0; }
    if (this.head >= this.tape.length)  { this.tape.push('_'); }

    return log;
  }

  // ── Run until terminal or maxSteps ─────────────────────────────────────────
  run(maxSteps = 1000): {
    logs:   StepLog[];
    result: SimResult;
  } {
    const logs: StepLog[] = [];

    while (!this.isTerminal() && this.stepCount < maxSteps) {
      const log = this.step();
      if (log) logs.push(log);
    }

    const exceeded = this.stepCount >= maxSteps && !this.isTerminal();
    const result: SimResult = exceeded
      ? 'max_steps'
      : (this.getResult() ?? 'halted');

    return { logs, result };
  }
}

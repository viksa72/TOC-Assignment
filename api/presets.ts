import { VercelRequest, VercelResponse } from '@vercel/node';
import { Preset } from './_lib/types';

// Mirroring the presets from the backend
const presets: Preset[] = [
  {
    id: 'flipBits',
    name: 'Flip All Bits',
    description: 'Scans right and flips every bit (0→1, 1→0), then halts.',
    input: '1011',
    transitions: {
      'q0_0': { write: '1', move: 1, next: 'q0' },
      'q0_1': { write: '0', move: 1, next: 'q0' },
      'q0__': { write: '_', move: 0, next: 'halt' },
    },
    acceptStates: ['halt'],
    rejectStates: [],
  },
  {
    id: 'incrementBinary',
    name: 'Increment Binary Number',
    description: 'Increments a binary number by 1 (ripple-carry from the right).',
    input: '1011',
    transitions: {
      'q0_0': { write: '0', move: 1, next: 'q0' },
      'q0_1': { write: '1', move: 1, next: 'q0' },
      'q0__': { write: '_', move: -1, next: 'q1' },
      'q1_1': { write: '0', move: -1, next: 'q1' },
      'q1_0': { write: '1', move: 0, next: 'halt' },
      'q1__': { write: '1', move: 0, next: 'halt' },
    },
    acceptStates: ['halt'],
    rejectStates: [],
  },
  {
    id: 'equalAB',
    name: 'Accept aⁿbⁿ',
    description: 'Accepts strings of the form aⁿbⁿ (equal a\'s then b\'s). Uses X/Y as markers.',
    input: 'aaabbb',
    transitions: {
      'q0_a': { write: 'X', move: 1, next: 'q1' },
      'q0_Y': { write: 'Y', move: 1, next: 'q3' },
      'q0__': { write: '_', move: 0, next: 'reject' },
      'q1_a': { write: 'a', move: 1, next: 'q1' },
      'q1_Y': { write: 'Y', move: 1, next: 'q1' },
      'q1_b': { write: 'Y', move: -1, next: 'q2' },
      'q1__': { write: '_', move: 0, next: 'reject' },
      'q2_a': { write: 'a', move: -1, next: 'q2' },
      'q2_Y': { write: 'Y', move: -1, next: 'q2' },
      'q2_X': { write: 'X', move: 1, next: 'q0' },
      'q3_Y': { write: 'Y', move: 1, next: 'q3' },
      'q3__': { write: '_', move: 0, next: 'accept' },
      'q3_b': { write: 'b', move: 0, next: 'reject' },
    },
    acceptStates: ['accept'],
    rejectStates: ['reject'],
  },
  {
    id: 'incrementUnary',
    name: 'Increment Unary Number',
    description: 'Appends one extra 1 to a unary number (111 → 1111).',
    input: '111',
    transitions: {
      'q0_1': { write: '1', move: 1, next: 'q0' },
      'q0__': { write: '1', move: 0, next: 'halt' },
    },
    acceptStates: ['halt'],
    rejectStates: [],
  },
  {
    id: 'palindrome',
    name: 'Accept Palindromes (0/1)',
    description: 'Accepts binary palindromes by marking outermost matching symbols.',
    input: '10101',
    transitions: {
      'q0_0': { write: 'X', move: 1, next: 'q1' },
      'q0_1': { write: 'X', move: 1, next: 'q2' },
      'q0_X': { write: 'X', move: 0, next: 'accept' },
      'q0__': { write: '_', move: 0, next: 'accept' },
      'q1_0': { write: '0', move: 1, next: 'q1' },
      'q1_1': { write: '1', move: 1, next: 'q1' },
      'q1_X': { write: 'X', move: -1, next: 'q5' },
      'q1__': { write: '_', move: -1, next: 'q5' },
      'q2_0': { write: '0', move: 1, next: 'q2' },
      'q2_1': { write: '1', move: 1, next: 'q2' },
      'q2_X': { write: 'X', move: -1, next: 'q6' },
      'q2__': { write: '_', move: -1, next: 'q6' },
      'q5_0': { write: 'X', move: -1, next: 'q3' },
      'q5_1': { write: '1', move: 0, next: 'reject' },
      'q5_X': { write: 'X', move: 0, next: 'accept' },
      'q6_1': { write: 'X', move: -1, next: 'q3' },
      'q6_0': { write: '0', move: 0, next: 'reject' },
      'q6_X': { write: 'X', move: 0, next: 'accept' },
      'q3_0': { write: '0', move: -1, next: 'q3' },
      'q3_1': { write: '1', move: -1, next: 'q3' },
      'q3_X': { write: 'X', move: 1, next: 'q0' },
      'q3__': { write: '_', move: 1, next: 'q0' },
    },
    acceptStates: ['accept'],
    rejectStates: ['reject'],
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ presets });
  }
  
  // Note: Saving presets server-side is not supported in simple Vercel Functions 
  // (unless using a database like Redis/MongoDB). For this demo, we'll return an error.
  if (req.method === 'POST') {
    return res.status(501).json({ error: 'Saving presets is not supported in this serverless deployment.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

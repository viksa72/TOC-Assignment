import { Preset } from '../types';

// Built-in preset machines — mirrored from frontend
export const presets: Preset[] = [
  {
    id: 'flipBits',
    name: 'Flip All Bits',
    description: 'Scans right and flips every bit (0→1, 1→0), then halts.',
    input: '1011',
    transitions: {
      'q0_0': { write: '1', move:  1, next: 'q0' },
      'q0_1': { write: '0', move:  1, next: 'q0' },
      'q0__': { write: '_', move:  0, next: 'halt' },
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
      'q0_0': { write: '0', move:  1, next: 'q0' },
      'q0_1': { write: '1', move:  1, next: 'q0' },
      'q0__': { write: '_', move: -1, next: 'q1' },
      'q1_1': { write: '0', move: -1, next: 'q1' },
      'q1_0': { write: '1', move:  0, next: 'halt' },
      'q1__': { write: '1', move:  0, next: 'halt' },
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
    acceptStates: ['accept'],
    rejectStates: ['reject'],
  },
  {
    id: 'incrementUnary',
    name: 'Increment Unary Number',
    description: 'Appends one extra 1 to a unary number (111 → 1111).',
    input: '111',
    transitions: {
      'q0_1': { write: '1', move:  1, next: 'q0' },
      'q0__': { write: '1', move:  0, next: 'halt' },
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
      // Start: mark first 0
      'q0_0': { write: 'X', move:  1, next: 'q1' },
      // Start: mark first 1
      'q0_1': { write: 'X', move:  1, next: 'q2' },
      // Single symbol or empty → accept
      'q0_X': { write: 'X', move:  0, next: 'accept' },
      'q0__': { write: '_', move:  0, next: 'accept' },
      // Seek right end for matching 0
      'q1_0': { write: '0', move:  1, next: 'q1' },
      'q1_1': { write: '1', move:  1, next: 'q1' },
      'q1_X': { write: 'X', move: -1, next: 'q5' },
      'q1__': { write: '_', move: -1, next: 'q5' },
      // Seek right end for matching 1
      'q2_0': { write: '0', move:  1, next: 'q2' },
      'q2_1': { write: '1', move:  1, next: 'q2' },
      'q2_X': { write: 'X', move: -1, next: 'q6' },
      'q2__': { write: '_', move: -1, next: 'q6' },
      // Found right end — check for 0
      'q5_0': { write: 'X', move: -1, next: 'q3' },
      'q5_1': { write: '1', move:  0, next: 'reject' },
      'q5_X': { write: 'X', move:  0, next: 'accept' },
      // Found right end — check for 1
      'q6_1': { write: 'X', move: -1, next: 'q3' },
      'q6_0': { write: '0', move:  0, next: 'reject' },
      'q6_X': { write: 'X', move:  0, next: 'accept' },
      // Walk back to leftmost X
      'q3_0': { write: '0', move: -1, next: 'q3' },
      'q3_1': { write: '1', move: -1, next: 'q3' },
      'q3_X': { write: 'X', move:  1, next: 'q0' },
      'q3__': { write: '_', move:  1, next: 'q0' },
    },
    acceptStates: ['accept'],
    rejectStates: ['reject'],
  },
];

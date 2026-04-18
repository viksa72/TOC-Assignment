# ⚙️ Turing Machine Simulator
### Theory of Computation — Interactive Visualizer

A premium, interactive web-based **Turing Machine Simulator** built for Theory of Computation (TOC) exploration. This tool allows you to visualize state transitions, tape movements, and computation logs in real-time.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Type](https://img.shields.io/badge/Project-Educational-orange.svg)

---

## 🚀 Features

- **Dual-Engine Support**:
  - **🖥️ Local Mode**: Runs entirely in the browser using high-performance TypeScript logic.
  - **☁️ Server Mode**: Connects to an Express.js backend for complex cloud-simulated runs.
- **Interactive Tape**: Smoothly animated infinite tape with automatic scrolling to focus on the read/write head.
- **Pre-set Machines**:
  - **Flip All Bits**: Logic for bitwise inversion.
  - **Increment Binary**: Adds 1 to any binary number.
  - **Accept aⁿbⁿ**: A classic context-free language visualizer.
  - **Palindrome Detector**: Detects binary palindromes via zig-zag marking.
- **Custom Rule Editor**: Write your own Turing patterns using professional syntax: `state_symbol: write, move, nextState`.
- **Live Computation Log**: Detailed step-by-step audit of ogni transition, state, and tape modification.
- **Responsive Layout**: Designed with a glassmorphic aesthetic that adapts to desktop and tablet viewports.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Vanilla), TypeScript (ES2020)
- **Backend**: Node.js, Express.js, TypeScript
- **Deployment**: Vercel Serverless Functions
- **Styling**: Modern dark glassmorphism with high-contrast UI tokens.

---

## 📦 Local Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/viksa72/TOC-Assignment.git
   cd TOC-Assignment
   ```

2. **Install dependencies**:
   ```bash
   npm run setup
   ```

3. **Run the Backend (Optional)**:
   If you want to use "Server Mode" locally:
   ```bash
   npm run dev:server
   ```

4. **Run the Frontend**:
   Open `index.html` using **Live Server** in VS Code or any static hosting tool.

---

## ☁️ Deployment

This project is optimized for deployment on **Vercel**.

1. Connect your GitHub repository to Vercel.
2. Vercel will automatically detect the `package.json` and build the TypeScript frontend.
3. The backend routes located in `/api` will be deployed as serverless functions.

---

## ✍️ Transition Syntax
To create your own rules, use the following format:
`current_state` + `_` + `read_symbol` **:** `write_symbol` **,** `Direction(R/L/N)` **,** `next_state`

**Example (A simple bit flipper):**
```text
q0_0: 1,R,q0
q0_1: 0,R,q0
q0__: _,N,halt
```

---

## 📜 License
Distribute under the MIT License. See `LICENSE` for more information.

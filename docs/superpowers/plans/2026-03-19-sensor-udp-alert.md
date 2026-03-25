# Sensor UDP Alert Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a UDP-to-WebSocket sensor bridge and an auto-opening sensor location popup to the CCTV demo app, with editable bridge settings in the web UI.

**Architecture:** A Node bridge listens for UDP sensor packets and rebroadcasts them over WebSocket to the browser. The React page maintains a separate sensor connection alongside CCTV, normalizes sensor events, and renders an automatic top-view sensor alert popup without disturbing the core two-panel CCTV stage.

**Tech Stack:** React, TypeScript, Vite, Emotion, Node.js `dgram`, Node.js `ws`, Vitest, Testing Library

---

### Task 1: Add sensor domain types and parsers

**Files:**
- Create: `cctv-poc/sensorTypes.ts`
- Create: `cctv-poc/sensorParsing.ts`
- Create: `cctv-poc/__tests__/sensorParsing.test.ts`

- [ ] **Step 1: Write the failing parser tests**
- [ ] **Step 2: Run `pnpm vitest run cctv-poc/__tests__/sensorParsing.test.ts` and verify failure**
- [ ] **Step 3: Implement minimal sensor normalization types and parser helpers**
- [ ] **Step 4: Run `pnpm vitest run cctv-poc/__tests__/sensorParsing.test.ts` and verify pass**
- [ ] **Step 5: Commit if git is available**

### Task 2: Add sensor alert popup component

**Files:**
- Create: `cctv-poc/SensorAlertModal.tsx`
- Create: `cctv-poc/__tests__/SensorAlertModal.test.tsx`

- [ ] **Step 1: Write failing component tests for map rendering, triggered sensor highlight, and message display**
- [ ] **Step 2: Run `pnpm vitest run cctv-poc/__tests__/SensorAlertModal.test.tsx` and verify failure**
- [ ] **Step 3: Implement minimal sensor popup UI**
- [ ] **Step 4: Run `pnpm vitest run cctv-poc/__tests__/SensorAlertModal.test.tsx` and verify pass**
- [ ] **Step 5: Commit if git is available**

### Task 3: Integrate sensor bridge connection into the POC page

**Files:**
- Modify: `ExcavatorCctvPocPage.tsx`
- Create: `cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`

- [ ] **Step 1: Write failing integration tests for sensor bridge URL settings and popup triggering**
- [ ] **Step 2: Run `pnpm vitest run cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx` and verify failure**
- [ ] **Step 3: Implement sensor connection state, localStorage, popup timers, and modal integration**
- [ ] **Step 4: Run `pnpm vitest run cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx` and verify pass**
- [ ] **Step 5: Run targeted regression tests for existing CCTV parsing and UI flows**
- [ ] **Step 6: Commit if git is available**

### Task 4: Add UDP bridge runtime

**Files:**
- Create: `sensor-bridge/server.js`
- Create: `sensor-bridge/README.md`
- Create: `sensor-bridge/__tests__/server.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for UDP message parse and WebSocket rebroadcast behavior**
- [ ] **Step 2: Run `pnpm vitest run sensor-bridge/__tests__/server.test.js` and verify failure**
- [ ] **Step 3: Implement minimal UDP bridge server and npm scripts**
- [ ] **Step 4: Run `pnpm vitest run sensor-bridge/__tests__/server.test.js` and verify pass**
- [ ] **Step 5: Document bridge startup and sample payloads in `sensor-bridge/README.md`**
- [ ] **Step 6: Commit if git is available**

### Task 5: Full verification

**Files:**
- Modify: `package.json` only if verification scripts need to be exposed

- [ ] **Step 1: Run `pnpm vitest run`**
- [ ] **Step 2: Run `pnpm build`**
- [ ] **Step 3: Manually smoke test CCTV layout and sensor popup behavior if local runtime is available**
- [ ] **Step 4: Summarize verification evidence and remaining gaps**

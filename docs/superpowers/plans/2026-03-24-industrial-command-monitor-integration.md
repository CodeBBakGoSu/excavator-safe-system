# Industrial Command Monitor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current root UI with the `Industrial Command v4.2` visual shell while preserving the existing CCTV, sensor, popup, and log behavior as the authoritative implementation.

**Architecture:** Keep the root Vite app as the only runnable application. Extract the current runtime behavior out of `ExcavatorCctvPocPage.tsx` into a reusable monitor runtime hook, then rebuild the UI around it with a Tailwind-based industrial command shell, action-oriented bottom bar, settings modal, field-state modal, hazard modal, and log viewer. The design-source folder is treated as a migration source only and removed after verification.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, existing parsing/runtime modules, Tailwind CSS v4, motion, lucide-react

---

## Planned File Structure

### Keep

- `cctv-poc/frameParsing.ts`
- `cctv-poc/sensorParsing.ts`
- `cctv-poc/types.ts`
- `frontend-state/frontendStateParsing.ts`
- `frontend-state/frontendStateTypes.ts`
- `sensor-bridge/server.js`

### Create

- `src/features/industrial-command/runtime/useIndustrialMonitorRuntime.ts`
- `src/features/industrial-command/components/IndustrialCommandShell.tsx`
- `src/features/industrial-command/components/CommandHeader.tsx`
- `src/features/industrial-command/components/BottomActionBar.tsx`
- `src/features/industrial-command/components/MonitorSection.tsx`
- `src/features/industrial-command/components/MonitorTile.tsx`
- `src/features/industrial-command/components/TelemetrySection.tsx`
- `src/features/industrial-command/components/SettingsModal.tsx`
- `src/features/industrial-command/components/FieldStateModal.tsx`
- `src/features/industrial-command/components/HazardModal.tsx`
- `src/features/industrial-command/components/LogsModal.tsx`
- `src/features/industrial-command/components/CommandIcons.tsx`
- `src/features/industrial-command/index.ts`
- `src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
- `src/features/industrial-command/__tests__/SettingsModal.test.tsx`

### Modify

- `package.json`
- `vite.config.ts`
- `src/main.tsx`
- `src/App.tsx`
- `src/styles.css`
- `src/__tests__/App.test.tsx`

### Remove After Migration

- `ExcavatorCctvPocPage.tsx`
- `cctv-poc/CctvPocTile.tsx`
- `cctv-poc/CctvPocAlertModal.tsx`
- `frontend-state/FrontendStateSnapshotModal.tsx`
- `/Users/hong-gihyeon/dev/excavator-safe-system/Industrial Command v4.2`

### Notes

- If any removed component still holds behavior that is not fully migrated, keep it until its replacement is verified and only then delete it.
- The workspace is currently not a Git repository, so commit steps are documented as optional follow-ups instead of required checkpoints.

### Task 1: Prepare the Root App to Host the Imported Design System

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/main.tsx`
- Modify: `src/styles.css`
- Create: `src/features/industrial-command/components/CommandIcons.tsx`
- Test: `src/__tests__/App.test.tsx`

- [ ] **Step 1: Write a failing shell smoke test for the new top header and bottom action bar**

```tsx
import { render, screen } from '@testing-library/react';
import App from '../App';

test('renders the industrial command shell with a gear button and bottom action bar', () => {
  render(<App />);

  expect(screen.getByText('Industrial Command v4.2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '연결' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '로그 보기' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the shell test to verify it fails for the right reason**

Run: `npm test -- src/__tests__/App.test.tsx`
Expected: FAIL because the current `App` still renders the old shell text and does not contain the new command header or bottom actions.

- [ ] **Step 3: Add the design-system dependencies and global theme wiring**

Implementation notes:

```json
{
  "dependencies": {
    "motion": "^12.x"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.x",
    "tailwindcss": "^4.x"
  }
}
```

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

```css
/* src/styles.css */
@import "tailwindcss";

@theme {
  --font-sans: "IBM Plex Sans KR", "Pretendard", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --color-background: #121416;
  --color-surface: #1a1c1e;
  --color-surface-low: #1e2022;
  --color-surface-high: #282a2c;
  --color-surface-highest: #333537;
  --color-primary: #4b8eff;
  --color-secondary: #adcbda;
  --color-tertiary: #ffba38;
  --color-error: #ffb4ab;
  --color-on-surface: #e2e2e5;
  --color-on-surface-variant: #c1c6d7;
  --color-outline: #414755;
}
```

- [ ] **Step 4: Create the icon wrapper and replace the old `App` entry with a minimal industrial shell**

Implementation notes:

```tsx
// src/App.tsx
import { IndustrialCommandShell } from './features/industrial-command';

export default function App() {
  return <IndustrialCommandShell />;
}
```

The initial shell can be static for this step as long as it renders:

- top title
- gear button
- placeholder monitor area
- bottom action bar with the approved `A` interaction model

- [ ] **Step 5: Re-run the shell smoke test**

Run: `npm test -- src/__tests__/App.test.tsx`
Expected: PASS

- [ ] **Step 6: Run a production build sanity check**

Run: `npm run build`
Expected: PASS with Tailwind styles compiled into the root app.

- [ ] **Step 7: Optional commit checkpoint**

Skip if unchanged: workspace is not a Git repository.
If a repository is initialized later, use: `git add package.json vite.config.ts src/main.tsx src/styles.css src/App.tsx src/features/industrial-command/components/CommandIcons.tsx src/__tests__/App.test.tsx && git commit -m "feat: add industrial command shell foundation"`

### Task 2: Extract the Existing Runtime Logic into a Reusable Monitor Hook

**Files:**
- Create: `src/features/industrial-command/runtime/useIndustrialMonitorRuntime.ts`
- Modify: `ExcavatorCctvPocPage.tsx`
- Modify: `cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`
- Test: `cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`
- Test: `cctv-poc/__tests__/frameParsing.test.ts`
- Test: `cctv-poc/__tests__/sensorParsing.test.ts`

- [ ] **Step 1: Write a failing runtime extraction regression test**

Add a focused test that mounts a thin consumer of `useIndustrialMonitorRuntime` and verifies:

- stored sensor URL is applied
- snapshot popup state opens on incoming frontend-state payload
- sensor logs are appended

Sketch:

```tsx
test('runtime hook exposes sensor snapshot popup state and log actions', () => {
  const result = render(<RuntimeProbe />);
  // interact with probe API or exposed buttons
  expect(screen.getByText('센서 대기')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused runtime test to verify it fails**

Run: `npm test -- cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`
Expected: FAIL because the runtime hook does not exist yet.

- [ ] **Step 3: Move the stateful logic out of `ExcavatorCctvPocPage.tsx` into `useIndustrialMonitorRuntime.ts`**

The hook should own:

- WS URL draft and saved value state
- sensor URL draft and saved value state
- popup duration state
- reconnect timers
- runtime map state
- sensor snapshot state
- log state and save handlers
- connection/disconnection/apply-settings methods

Suggested API:

```ts
export function useIndustrialMonitorRuntime() {
  return {
    channels,
    runtimeMap,
    focusedChannelId,
    setFocusedChannelId,
    popupChannelId,
    closeHazardPopup,
    sensorPopupOpen,
    closeSensorPopup,
    sensorSnapshot,
    activeRiskCount,
    cctvLogs,
    sensorLogs,
    activeLogViewer,
    openLogViewer,
    closeLogViewer,
    wsDraft,
    setWsDraft,
    sensorBridgeDraft,
    setSensorBridgeDraft,
    popupDurationMs,
    setPopupDurationMs,
    sensorPopupDurationMs,
    setSensorPopupDurationMs,
    applyWsUrl,
    applySensorBridgeUrl,
    connectAll,
    disconnectAll,
    openLatestSensorSnapshot,
    saveLogsToServer,
    statusSummary,
  };
}
```

- [ ] **Step 4: Keep `ExcavatorCctvPocPage.tsx` as a temporary adapter until the new shell is ready**

Minimal temporary implementation:

```tsx
export default function ExcavatorCctvPocPage() {
  const runtime = useIndustrialMonitorRuntime();
  return <LegacyAdapter runtime={runtime} />;
}
```

This protects existing tests while the new presentation layer is being built.

- [ ] **Step 5: Re-run the existing runtime regression suite**

Run: `npm test -- cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`
Expected: PASS

Run: `npm test -- cctv-poc/__tests__/frameParsing.test.ts cctv-poc/__tests__/sensorParsing.test.ts`
Expected: PASS

- [ ] **Step 6: Optional commit checkpoint**

Skip if unchanged: workspace is not a Git repository.
If a repository is initialized later, use: `git add Excavat* cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx src/features/industrial-command/runtime/useIndustrialMonitorRuntime.ts && git commit -m "refactor: extract industrial monitor runtime"`

### Task 3: Build the Live Monitor Surface with Real CCTV Data

**Files:**
- Create: `src/features/industrial-command/components/IndustrialCommandShell.tsx`
- Create: `src/features/industrial-command/components/CommandHeader.tsx`
- Create: `src/features/industrial-command/components/BottomActionBar.tsx`
- Create: `src/features/industrial-command/components/MonitorSection.tsx`
- Create: `src/features/industrial-command/components/MonitorTile.tsx`
- Create: `src/features/industrial-command/components/TelemetrySection.tsx`
- Create: `src/features/industrial-command/index.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
- Test: `src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`

- [ ] **Step 1: Write a failing integration test for live monitor rendering**

Test behaviors:

- two monitor tiles render from runtime channel config
- the active risk summary pill reflects runtime data
- the bottom action bar is visible while monitor tiles remain on screen

Sketch:

```tsx
test('keeps the CCTV monitor visible while rendering runtime summaries and bottom actions', () => {
  render(<IndustrialCommandShell runtime={mockRuntime} />);
  expect(screen.getByText('CH-01')).toBeInTheDocument();
  expect(screen.getByText('CH-02')).toBeInTheDocument();
  expect(screen.getByText('위험 1채널')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '현장 상태' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the monitor integration test to verify it fails**

Run: `npm test -- src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
Expected: FAIL because the live monitor components do not exist yet.

- [ ] **Step 3: Implement the shell and header with the imported design language**

Required output:

- industrial top header
- right-aligned gear button
- compact health/status pills
- no top tabs

Keep the header presentational and pass state through props.

- [ ] **Step 4: Implement `MonitorSection` and `MonitorTile` using real runtime data**

Each tile must render:

- channel badge
- connection badge
- current frame image or empty placeholder
- real frame/FPS values
- real alert summary
- SVG overlay boxes for tracked detections

Use the current overlay normalization logic instead of duplicating bounding-box math.

- [ ] **Step 5: Implement `TelemetrySection` with current aggregated values**

Render:

- system log summary from the focused channel
- total detected object count
- latest source id / frame info

- [ ] **Step 6: Wire the root `App` to the new shell using `useIndustrialMonitorRuntime`**

Minimal composition:

```tsx
export function IndustrialCommandShell() {
  const runtime = useIndustrialMonitorRuntime();
  return (
    <>
      <CommandHeader runtime={runtime} />
      <MonitorSection runtime={runtime} />
      <TelemetrySection runtime={runtime} />
      <BottomActionBar runtime={runtime} />
    </>
  );
}
```

- [ ] **Step 7: Re-run the monitor integration test**

Run: `npm test -- src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
Expected: PASS

- [ ] **Step 8: Optional commit checkpoint**

Skip if unchanged: workspace is not a Git repository.
If a repository is initialized later, use: `git add src/App.tsx src/features/industrial-command && git commit -m "feat: render industrial monitor shell with runtime data"`

### Task 4: Replace the Old Popups with the New Settings, Field-State, Hazard, and Logs Overlays

**Files:**
- Create: `src/features/industrial-command/components/SettingsModal.tsx`
- Create: `src/features/industrial-command/components/FieldStateModal.tsx`
- Create: `src/features/industrial-command/components/HazardModal.tsx`
- Create: `src/features/industrial-command/components/LogsModal.tsx`
- Modify: `src/features/industrial-command/components/IndustrialCommandShell.tsx`
- Modify: `src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
- Create: `src/features/industrial-command/__tests__/SettingsModal.test.tsx`
- Test: `src/features/industrial-command/__tests__/SettingsModal.test.tsx`
- Test: `src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`

- [ ] **Step 1: Write a failing settings test for the gear button workflow**

Test behaviors:

- clicking the gear opens settings
- editing CCTV and sensor URLs updates the drafts
- applying settings calls the runtime apply methods
- popup duration fields are persisted in local storage

Sketch:

```tsx
test('opens settings from the gear icon and applies websocket and popup settings', async () => {
  render(<IndustrialCommandShell runtime={mockRuntime} />);
  await user.click(screen.getByRole('button', { name: /settings/i }));
  expect(screen.getByLabelText('CCTV WebSocket URL')).toHaveValue('ws://...');
  expect(screen.getByLabelText('위험 팝업 시간(ms)')).toHaveValue(2000);
});
```

- [ ] **Step 2: Run the settings test to verify it fails**

Run: `npm test -- src/features/industrial-command/__tests__/SettingsModal.test.tsx`
Expected: FAIL because the settings modal does not exist yet.

- [ ] **Step 3: Implement `SettingsModal` and wire it to the gear icon**

Fields:

- CCTV WebSocket URL
- sensor bridge WebSocket URL
- 위험 팝업 시간(ms)
- 현장 상태 팝업 시간(ms)

Behavior:

- validate URLs with existing validators
- keep drafts editable
- apply without leaving the current monitor view

- [ ] **Step 4: Implement `FieldStateModal` with real snapshot data inside the imported map layout**

Preserve:

- projected worker points
- danger/caution rings
- worker list ordering
- empty-state message

Replace the design-source sample text with real values from `sensorSnapshot`.

- [ ] **Step 5: Implement `HazardModal` with real popup behavior and channel frame data**

Preserve:

- auto-open on risk events
- close after configured duration
- manual dismiss
- current image and current event summary

- [ ] **Step 6: Implement `LogsModal` and bottom-bar actions**

Bottom-bar actions should open:

- field-state modal
- hazard viewer
- logs modal

Connection action should trigger the runtime’s connect methods using saved settings.

- [ ] **Step 7: Re-run the settings and overlay integration tests**

Run: `npm test -- src/features/industrial-command/__tests__/SettingsModal.test.tsx src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
Expected: PASS

- [ ] **Step 8: Re-run the legacy sensor flow tests to ensure behavior survived the UI swap**

Run: `npm test -- cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`
Expected: PASS or update the test expectations to target the new shell while preserving the same behavior.

- [ ] **Step 9: Optional commit checkpoint**

Skip if unchanged: workspace is not a Git repository.
If a repository is initialized later, use: `git add src/features/industrial-command/__tests__ src/features/industrial-command/components && git commit -m "feat: add industrial settings and overlay workflows"`

### Task 5: Remove Temporary Legacy UI and Clean Up the Project Structure

**Files:**
- Modify: `src/__tests__/App.test.tsx`
- Remove: `ExcavatorCctvPocPage.tsx`
- Remove: `cctv-poc/CctvPocTile.tsx`
- Remove: `cctv-poc/CctvPocAlertModal.tsx`
- Remove: `frontend-state/FrontendStateSnapshotModal.tsx`
- Remove: `/Users/hong-gihyeon/dev/excavator-safe-system/Industrial Command v4.2`
- Test: `src/__tests__/App.test.tsx`
- Test: `npm test`

- [ ] **Step 1: Write or update the final root-app regression test**

The final root test should assert:

- top tabs are absent
- the bottom action bar is present
- the gear button exists
- the CCTV monitor remains the primary visible surface

Sketch:

```tsx
test('renders a single-screen monitor without duplicated tab navigation', () => {
  render(<App />);
  expect(screen.queryByText('MONITOR')).not.toBeInTheDocument();
  expect(screen.queryByText('TELEMETRY')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '연결' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the root regression test to verify it fails until cleanup is complete**

Run: `npm test -- src/__tests__/App.test.tsx`
Expected: FAIL if any temporary legacy adapter content is still leaking through.

- [ ] **Step 3: Remove the temporary legacy presentation files once the new shell fully owns the UI**

Delete only after the new shell is wired and tested:

- `ExcavatorCctvPocPage.tsx`
- `cctv-poc/CctvPocTile.tsx`
- `cctv-poc/CctvPocAlertModal.tsx`
- `frontend-state/FrontendStateSnapshotModal.tsx`

If any shared logic still lives in these files, move it first.

- [ ] **Step 4: Remove the absorbed design-source folder**

Delete:

- `/Users/hong-gihyeon/dev/excavator-safe-system/Industrial Command v4.2`

Only do this after:

- styles are ported
- components are migrated
- the root build passes

- [ ] **Step 5: Run the full verification suite**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Document any intentional follow-up cleanup**

Examples:

- remove now-unused Emotion dependencies if no longer referenced
- collapse obsolete runtime adapter helpers
- remove dead test fixtures left over from the transition

- [ ] **Step 7: Optional final commit checkpoint**

Skip if unchanged: workspace is not a Git repository.
If a repository is initialized later, use: `git add -A && git commit -m "feat: integrate industrial command monitor UI"`

## Verification Checklist

- `npm test -- src/__tests__/App.test.tsx`
- `npm test -- src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
- `npm test -- src/features/industrial-command/__tests__/SettingsModal.test.tsx`
- `npm test -- cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`
- `npm test -- cctv-poc/__tests__/frameParsing.test.ts cctv-poc/__tests__/sensorParsing.test.ts`
- `npm test`
- `npm run build`

## Risks to Watch During Execution

- Tailwind v4 integration may conflict with legacy global CSS if the old shell styles are left in place.
- The runtime extraction is the highest regression-risk step because the existing behavior lives in one large component.
- Removing legacy files too early can break popup behavior or tests that still depend on them.

## Review Note

This workspace is not a Git repository, and the current session was not explicitly authorized for sub-agent delegation. Because of that, the usual plan review subagent loop was not run here. If you want, execution can still proceed inline in this session against this plan.

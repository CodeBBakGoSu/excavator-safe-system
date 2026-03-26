# CCTV Hazard Popup Stability + Debounce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CCTV hazard experience stable for operators by reducing alert chatter, keeping the popup open through genuine danger, and ensuring popup contents render from a coherent risk snapshot instead of flickering frame-by-frame.

**Architecture:** Separate raw incoming CCTV frames from operator-facing presentation state. Keep `latestFrame` as the raw stream record, introduce debounced alert qualification in the runtime hook, and render the popup from a sticky risk snapshot that updates only on qualifying risk frames. Use asymmetric hysteresis: stricter rules to open, simpler rules to stay open, and time-based release to close.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind CSS v4

---

## Observed Evidence From Runtime Logs

These findings come from the saved runtime log at `runtime-logs/CCTV Log Mar 25 2026.txt`:

- The file covers about 27 seconds, from `2026. 3. 25. 17시 40분 57초` to `2026. 3. 25. 17시 41분 24초`.
- It contains `198` CCTV frame-log entries in that window, around `7-9` total frame events per second across channels.
- Mapped channel counts were:
  - `CH-01`: `51`
  - `CH-02`: `39`
  - `CH-04`: `52`
  - `UNMAPPED`: `56`
- Risk/no-risk alternation is noisy. Example streak distribution from the same log:
  - `CH-01`: `7` risk streaks, `6` of them are single-frame streaks
  - `CH-02`: `9` risk streaks, `6` of them are single-frame streaks
  - `CH-04`: `8` risk streaks, `5` of them are single-frame streaks
- Some frames also arrive without image data: `12` total frames had no `image_jpeg_base64`, including `3` risk frames.

## Root Cause Hypothesis

The current UI instability is likely not one single bug but the combination of three behaviors:

1. **Popup open/close logic is tied too closely to raw frame-level risk flicker.**
   - The runtime currently updates channel state on every frame and opens the popup from raw `risk` frames.
   - With many single-frame risk spikes in the March 25, 2026 log, the operator sees alert state churn even when the underlying hazard signal is noisy.

2. **Popup content is bound to live channel state instead of a stable hazard snapshot.**
   - [useIndustrialMonitorRuntime.ts](/Users/hong-gihyeon/dev/excavator-safe-system/src/features/industrial-command/runtime/useIndustrialMonitorRuntime.ts) currently writes both `latestFrame` and `visualFrame` from every incoming frame.
   - [HazardModal.tsx](/Users/hong-gihyeon/dev/excavator-safe-system/src/features/industrial-command/components/HazardModal.tsx) renders from `runtime.latestFrame`.
   - Result: the popup can stay visible while its detail text/image/object boxes switch to a later normal or image-missing frame, which makes the contents feel broken or inconsistent.

3. **The app has no hysteresis between "open hazard", "keep showing hazard", and "close hazard".**
   - A safety UI usually needs asymmetric rules:
     - harder to open than to stay open
     - easier to stay open during continuing danger
     - slower to close than a single normal frame

## Recommended Debounce Strategy

### Recommendation

Use a **windowed hysteresis model**, not a strict "2 consecutive frames only" gate.

Recommended open rule per channel:

- Open the popup when **2 of the last 3 channel frames** are `risk`
- Or open immediately for a clearly severe frame if there is an unambiguous high-severity signal available during implementation, such as:
  - `highlight.tone === 'red'`
  - a `topEventKo` pattern equivalent to `매우높음` or `초근접`

Recommended sustain rule:

- Once the popup is open, **any qualifying risk frame refreshes the close timer**
- A single normal frame must **not** replace the popup contents and must **not** close the popup immediately

Recommended close rule:

- Close only when no qualifying risk frame has refreshed the popup for `popupDurationMs`

### Why This Is Better Than Strict 2 Consecutive Frames

Strict `2 consecutive risk frames` is simple, but it is brittle:

- one dropped/normal frame between two noisy risk frames prevents opening forever
- at low per-channel FPS it can add too much latency
- it does not solve the popup-content flicker by itself

`2 of last 3` is more forgiving and better matches the log pattern we observed on March 25, 2026, where many channels oscillate `risk -> normal -> risk` in short bursts.

### Timing Guidance

If the live environment is truly `3-4 FPS per channel`, then:

- `2 consecutive` means roughly `250-700 ms` confirmation delay
- `2 of last 3` means roughly `500-1000 ms` to stabilize while tolerating one noisy frame

If the saved March 25, 2026 runtime log is closer to reality for this deployment, mapped channels behaved more like roughly `1.4-1.9 FPS per channel`, so any frame-count-based gate introduces more delay. In that case:

- `2 of last 3 within 1500 ms` is safer than plain consecutive counting
- immediate bypass for clearly severe frames becomes more important

## Planned State Changes

### Existing Raw State To Keep

- `latestFrame`: raw most recent parsed frame for the channel
- `currentImage`: most recent renderable image source if present

### New Or Clarified Presentation State

Add an explicit popup-oriented snapshot state in [useIndustrialMonitorRuntime.ts](/Users/hong-gihyeon/dev/excavator-safe-system/src/features/industrial-command/runtime/useIndustrialMonitorRuntime.ts), for example:

- `popupChannelId`
- `popupSnapshotFrame`
- `popupSnapshotImage`
- `popupOpenedAtMs`
- `lastQualifiedRiskAtMs`

Optional helper state per channel:

- recent alert decisions or timestamps for the rolling `2 of 3` window
- `qualifiedRiskStreak` or `recentRiskSamples`

### Rendering Rule

[HazardModal.tsx](/Users/hong-gihyeon/dev/excavator-safe-system/src/features/industrial-command/components/HazardModal.tsx) should render from the popup snapshot, not directly from the live channel runtime frame.

That means:

- opening the popup captures the best current risk frame/image/details
- later normal frames do not wipe out popup copy or boxes while the popup is still active
- a later qualifying risk frame may refresh the snapshot if it has better data

## Planned File Structure

### Modify

- `src/features/industrial-command/runtime/useIndustrialMonitorRuntime.ts`
- `src/features/industrial-command/components/IndustrialCommandShell.tsx`
- `src/features/industrial-command/components/HazardModal.tsx`
- `src/styles.css`
- `src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
- `src/features/industrial-command/__tests__/HazardModal.test.tsx`
- `cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`

### Keep As-Is Unless Required

- `src/features/industrial-command/components/MonitorTile.tsx`
- `src/features/industrial-command/components/SettingsModal.tsx`

## Task 1: Lock The Real Failure Modes With Regression Tests

**Files:**
- Modify: `src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx`
- Modify: `cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx`
- Modify: `src/features/industrial-command/__tests__/HazardModal.test.tsx`

- [ ] **Step 1: Add a regression test for noisy risk flicker**

Simulate a per-channel sequence like:

```text
normal, normal, risk, normal, risk, normal
```

Expected:

- popup does not open on the first isolated risk if the debounce gate is not met
- popup opens once the `2 of last 3` threshold is met

- [ ] **Step 2: Add a regression test for sustained risk after opening**

Simulate:

```text
risk, risk, risk, normal, risk
```

Expected:

- popup stays open
- timer refreshes on later qualifying risk frames
- the original timeout does not close the popup early

- [ ] **Step 3: Add a regression test for sticky popup content**

Simulate:

1. a qualifying risk frame with image, summary, and overlay boxes
2. a later normal frame while popup is still open
3. a later frame without image data

Expected:

- popup still shows the captured hazard summary
- popup still shows the captured risk image
- popup does not render empty/default copy just because the newest raw frame is incomplete

- [ ] **Step 4: Add a regression test for manual dismiss semantics**

Expected:

- manual close clears the visible popup immediately
- later qualifying risk frames may reopen the popup
- old timers from the previous popup instance cannot close the reopened popup

- [ ] **Step 5: Run the targeted tests and verify they fail first**

Run:

```bash
npm test -- src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx
npm test -- cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx
npm test -- src/features/industrial-command/__tests__/HazardModal.test.tsx
```

Expected: FAIL on the newly added expectations

## Task 2: Add Debounced Risk Qualification In The Runtime Hook

**Files:**
- Modify: `src/features/industrial-command/runtime/useIndustrialMonitorRuntime.ts`

- [ ] **Step 1: Introduce per-channel rolling risk qualification**

Implement a lightweight rolling window per channel. One acceptable shape:

```ts
type RiskSample = {
  atMs: number;
  isRisk: boolean;
  severity: 'normal' | 'risk';
};
```

Keep only the recent `3` samples or samples within a small time window such as `1500 ms`.

- [ ] **Step 2: Implement a single qualification helper**

Example design:

```ts
function qualifiesForPopupOpen(samples: RiskSample[]) {
  return samples.filter((sample) => sample.isRisk).length >= 2;
}
```

If implementation exposes a clean severe-signal flag, add:

```ts
if (isImmediateSevereFrame(frame)) return true;
```

- [ ] **Step 3: Keep raw state and popup state separate**

On every frame:

- continue updating `latestFrame`
- continue updating per-channel raw image if present
- only update popup state when the frame qualifies for popup open or popup refresh

- [ ] **Step 4: Refresh the popup timer only from qualified risk frames**

Do not refresh on normal frames.

Once popup is open for a channel:

- later qualified risk frames refresh timer
- later non-qualified normal frames do not overwrite popup snapshot

## Task 3: Introduce Sticky Popup Snapshot Rendering

**Files:**
- Modify: `src/features/industrial-command/runtime/useIndustrialMonitorRuntime.ts`
- Modify: `src/features/industrial-command/components/IndustrialCommandShell.tsx`
- Modify: `src/features/industrial-command/components/HazardModal.tsx`

- [ ] **Step 1: Return popup snapshot data from the runtime hook**

Expose a popup payload object instead of making the shell reconstruct it from current channel runtime only.

Example shape:

```ts
type PopupSnapshot = {
  channelId: number;
  channelLabel: string;
  channelTitle: string;
  frame: FrameSnapshot;
  imageSrc: string | null;
  summary: string;
};
```

- [ ] **Step 2: Teach the shell to pass snapshot-based props**

[IndustrialCommandShell.tsx](/Users/hong-gihyeon/dev/excavator-safe-system/src/features/industrial-command/components/IndustrialCommandShell.tsx) should prefer the popup snapshot payload when rendering [HazardModal.tsx](/Users/hong-gihyeon/dev/excavator-safe-system/src/features/industrial-command/components/HazardModal.tsx).

- [ ] **Step 3: Make the modal render from the snapshot payload**

Avoid reading directly from `runtime.latestFrame` for popup details.

Expected result:

- popup headline, event chips, detail cards, image, and overlay boxes all describe the same risk moment
- incomplete later frames do not corrupt the popup contents

## Task 4: Strengthen The Visual Treatment Without Hurting Readability

**Files:**
- Modify: `src/features/industrial-command/components/HazardModal.tsx`
- Modify: `src/styles.css`
- Modify: `src/features/industrial-command/__tests__/HazardModal.test.tsx`

- [ ] **Step 1: Add a test hook for emphasized risk-shell styling**

Test for:

- larger dialog shell class
- dedicated flashing/glow class on risk state

- [ ] **Step 2: Increase popup scale and typography**

Change:

- wider max width than current `max-w-6xl`
- stronger heading scale
- clearer summary block

- [ ] **Step 3: Add border/glow flashing, not full-content flicker**

In [src/styles.css](/Users/hong-gihyeon/dev/excavator-safe-system/src/styles.css):

- animate shell border/glow only
- keep text opacity stable
- add `prefers-reduced-motion` fallback

## Task 5: Verification

- [ ] **Step 1: Run focused regression tests**

```bash
npm test -- src/features/industrial-command/__tests__/IndustrialCommandApp.test.tsx
npm test -- cctv-poc/__tests__/ExcavatorCctvPocPage.sensor.test.tsx
npm test -- src/features/industrial-command/__tests__/HazardModal.test.tsx
npm test -- src/features/industrial-command/__tests__/SettingsModal.test.tsx
```

- [ ] **Step 2: Run full verification**

```bash
npm test
npm run build
```

- [ ] **Step 3: Run manual replay verification**

Manual checks:

- replay the saved CCTV data used to reproduce the issue
- verify isolated one-frame risk blips do not instantly open the popup
- verify genuine continuing danger opens the popup within the chosen debounce delay
- verify popup content stays coherent while the popup is visible
- verify popup closes only after the configured quiet period
- verify the stronger visual treatment is noticeable but readable

## Recommended Defaults

Use these defaults first unless testing shows unacceptable latency:

- open rule: `2 of last 3` risk frames per channel
- rolling qualification window: `<= 1500 ms`
- immediate bypass: yes, but only for clearly severe frames if a clean signal exists
- sustain: refresh timer on every qualified risk frame
- close: existing `popupDurationMs`, counting from the last qualified risk frame
- popup rendering source: sticky snapshot captured from the last qualified risk frame with usable image/details

## Risks To Watch

- If the open gate is too strict, real hazards may feel delayed.
- If the open gate is too loose, the popup will still chatter.
- If popup snapshot state is not isolated from raw channel state, the content inconsistency bug will survive even after debounce is added.
- If severe-frame bypass is derived from brittle string matching alone, behavior may drift when upstream message wording changes.

## Review Notes

- The previous plan fixed popup duration but not popup coherence.
- The March 25, 2026 log strongly suggests that single-frame risk spikes are common enough that pure frame-by-frame rendering will remain unstable.
- The recommended direction is therefore:
  - debounce for opening
  - sticky snapshot for popup rendering
  - timer refresh for sustain
  - time-based quiet period for close

# Industrial Command Monitor Integration Design

## Overview

This design integrates the visual language from `Industrial Command v4.2` into the existing excavator safety monitor while preserving the current runtime behavior as the source of truth. The final product runs only from the root project at `/Users/hong-gihyeon/dev/excavator-safe-system`.

The design folder is treated as a visual source only. Existing CCTV, sensor, popup, reconnect, and log-saving behavior remains authoritative unless a visual adaptation is required.

## Goals

- Preserve the `Industrial Command v4.2` look and feel as closely as practical.
- Remove the duplicated top and bottom tab systems and replace them with a single bottom action bar.
- Expand the CCTV monitor to a fixed four-slot matrix with equal-size viewports.
- Keep the current application behavior for:
  - CCTV WebSocket connection and reconnect
  - sensor bridge connection and reconnect
  - CCTV frame parsing and overlay rendering
  - sensor snapshot parsing
  - hazard popup timing
  - runtime log viewing and saving
- Add a settings surface opened from the top-right gear icon.
- Add an RTSP-controlled third-quadrant monitor fed through an HLS bridge.
- Consolidate the project into one root app and remove the absorbed design-source folder after migration.

## Non-Goals

- Rebuilding the backend or sensor bridge protocol
- Adding multiple dashboard pages or restoring tabbed navigation
- Changing the existing domain logic for hazard detection beyond wiring it into the new UI
- Creating a second app or preserving `Industrial Command v4.2` as a separately runnable package
- Building a low-latency WebRTC streaming stack for the RTSP monitor in this phase

## User Experience

### Main Screen

The application becomes a single industrial command dashboard with:

- a compact top header using the design-source styling
- a permanent four-slot monitor area
- telemetry summary cards below the CCTV tiles
- a bottom action bar used for quick actions instead of section switching

The main CCTV view stays visible at all times. Actions such as viewing field state, logs, or recent hazards open overlays or focused panels rather than replacing the main monitor.

### Bottom Action Bar

The bottom bar is action-oriented, not tab-oriented. Initial actions:

- `연결`: connect or reconnect CCTV and sensor streams using the saved settings
- `현장 상태`: open the field-state modal populated from the latest sensor snapshot
- `위험 기록`: open a hazard-focused viewer using the existing alert data
- `로그 보기`: open runtime logs for CCTV and sensor streams

The exact labels may be tuned during implementation for space and clarity, but the interaction model remains action-first.

### Settings

The gear icon opens a settings modal or side panel with configurable runtime values:

- CCTV WebSocket URL
- sensor bridge WebSocket URL
- third-quadrant RTSP URL
- RTSP stream start/stop controls surfaced through the web UI
- CCTV risk popup duration
- sensor state popup duration retained for compatibility with existing saved settings
- reconnect behavior values if the current implementation supports exposing them safely

Settings persist to local storage using the existing storage keys where possible to preserve continuity. Applying settings immediately affects future connections and popup behavior.

## Functional Design

### Runtime State Source of Truth

The current root-project runtime logic remains authoritative. This includes:

- `ExcavatorCctvPocPage.tsx` state and connection flow
- `cctv-poc/frameParsing.ts`
- `cctv-poc/sensorParsing.ts`
- `frontend-state/frontendStateParsing.ts`

The new UI should consume these behaviors through extracted hooks or feature-level components rather than reimplementing the logic from scratch.

### CCTV Tiles

The monitor matrix renders four equal slots. Two slots continue to use the current CCTV WebSocket-fed frame snapshots, the third quadrant is reserved for the RTSP-fed stream, and the fourth slot remains a matching reserve viewport until an additional live source is introduced. Each non-RTSP CCTV slot renders:

- live image if available
- placeholder if not connected
- current connection label
- channel label
- frame number
- FPS
- alert summary
- overlay boxes for tracked detections

The tile visuals come from the design source, but displayed values come from current runtime state.

Clicking a tile opens the enlarged hazard/detail modal for that channel, using the current popup data and current image.

For the RTSP slot:

- the browser does not connect to RTSP directly
- the bridge accepts the RTSP URL from the web settings UI
- the bridge runs an HLS conversion pipeline and exposes an `.m3u8` playlist plus segments
- the frontend displays the HLS output inside the third quadrant and shows clear stream state when the bridge is idle, starting, or failed
- frame overlays and AI metadata are not synthesized for the RTSP slot in this phase

### Hazard Popup

The current auto-popup behavior on `risk` events remains. The visual treatment changes to align with the industrial command hazard modal style.

The popup still:

- opens automatically on qualifying risk frames
- can be dismissed manually
- closes after the configured popup duration
- uses real runtime image and real parsed event data

### Field-State Modal

The existing frontend-state snapshot remains the data source for the map view.

The modal adopts the industrial command field-map layout, but the following remain real:

- worker list
- worker danger/caution/safe status
- worker positions projected from actual sensor data
- excavator-centered safety radius visualization
- snapshot timestamp and system status

If no snapshot has been received yet, the modal shows an empty-state message rather than sample workers.

Sensor log ingestion must not auto-open the field-state modal. The field-state view is manual-only from the bottom action bar so operators are not interrupted while logs are streaming at high frequency. The existing sensor popup duration setting may remain visible for storage compatibility, but it no longer triggers automatic opening behavior in this phase.

### Logs

Existing runtime log collections remain intact:

- CCTV logs
- sensor logs

The log viewer uses the new design language but preserves:

- separated log streams
- chronological accumulation with a scrollable reading area
- save-to-server behavior
- action result feedback

The modal layout should keep action controls visible while logs grow rapidly:

- download/save buttons remain pinned in each log section header
- the scrolling region is constrained to the log list body
- long-running streams remain readable even when entries are appended every 100 ms

### Connection Controls

The old top-row direct buttons are re-expressed in the new layout. The user still needs a fast way to:

- connect using saved addresses
- disconnect if needed
- view current health/status

If the bottom action bar cannot comfortably carry every control, the remaining connection-specific actions can stay in the top header area as compact controls, provided the primary interaction model still matches the approved action-bar approach.

RTSP control is settings-driven in this phase. Operators configure the RTSP source and explicitly start or stop the HLS bridge from the settings surface instead of relying on automatic background behavior.

## Information Architecture

### Proposed Feature Structure

The integrated app should move toward a feature-oriented structure under `src`:

- `src/app`
  - app shell and composition
- `src/features/monitor`
  - monitor layout
  - CCTV tile presentation
  - telemetry summary cards
- `src/features/settings`
  - settings modal
  - local-storage-backed form state
- `src/features/logs`
  - log action area
  - log viewer modal
- `src/features/field-state`
  - field-state modal presentation
- `src/features/hazards`
  - hazard popup presentation
- `src/lib/runtime` or equivalent
  - extracted shared runtime hooks/state orchestration built from existing logic

Existing parsing modules can stay near their current locations if moving them would add unnecessary migration risk.

## Migration Strategy

### Preferred Approach

Use the design shell as presentation and adapt the existing runtime behavior into it.

This means:

- reusing current functional logic
- replacing placeholder text and sample data with live values
- keeping the final app in the current root project
- absorbing only the necessary visual components and styles from `Industrial Command v4.2`
- extending the existing bridge process to expose HLS assets and RTSP control endpoints rather than introducing a separate streaming service

### Folder Cleanup

Once the integrated app is running from the root project:

- remove duplicate entry points that are no longer needed
- remove absorbed design-source files
- remove dead sample-data code
- keep only one runnable Vite application

The `Industrial Command v4.2` folder should be deleted only after the new root app is verified to contain the required styles and components.

## Error Handling

- Invalid WebSocket URLs continue to show validation feedback before connecting.
- Failed connections continue to surface status messages in the UI.
- Invalid RTSP URLs show validation feedback before the bridge is started.
- RTSP bridge startup or FFmpeg failures surface actionable UI state without breaking the other three monitor slots.
- Empty sensor state continues to show a safe empty state instead of placeholder fake data.
- Log save failures continue to surface actionable error text.
- Missing frames or images continue to show placeholders without breaking layout.

## Testing Strategy

Implementation should follow TDD where practical for behavior changes. Minimum coverage targets:

- existing parsing tests stay green
- settings form tests for applying popup duration and socket URLs
- settings and runtime tests for configuring the RTSP bridge and surfacing stream state
- UI tests for:
  - rendering four monitor slots into the new monitor shell
  - displaying the RTSP HLS player in the third quadrant
  - opening the settings surface from the gear icon
  - opening field-state and log overlays from bottom actions
  - preserving empty-state behavior when no stream data exists
  - keeping sensor snapshots manual-only instead of auto-opening on log ingress
  - keeping log download controls visible while the log body scrolls

## Risks

- The design source uses a different styling stack than the current root project, so style integration must avoid partial or conflicting systems.
- The current runtime logic lives in a large component, so extraction into reusable units may introduce regressions if not covered by tests.
- Removing the design folder too early could make it harder to recover visual details during migration.
- Persisting RTSP URLs in local storage may expose embedded camera credentials if operators paste credentialed URLs directly.

## Open Decisions Resolved

- The app uses a single-screen monitor layout.
- Top tabs are removed.
- The bottom bar becomes action-oriented.
- The top-right gear opens settings.
- Existing functional behavior takes priority over any sample behavior from the design source.
- The design folder is absorbed and then deleted after successful migration.

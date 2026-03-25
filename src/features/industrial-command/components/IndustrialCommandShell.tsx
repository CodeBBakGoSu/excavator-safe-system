import { useState } from 'react';
import { type ChannelRuntimeState } from '../../../../cctv-poc/types';
import {
  EMPTY_INDUSTRIAL_MONITOR_RUNTIME,
  INDUSTRIAL_MONITOR_CHANNELS,
  type IndustrialMonitorRuntime,
} from '../runtime/useIndustrialMonitorRuntime';
import { CommandHeader } from './CommandHeader';
import { FieldStateModal } from './FieldStateModal';
import { HazardModal } from './HazardModal';
import { LogsModal } from './LogsModal';
import { MonitorSection } from './MonitorSection';
import { SettingsModal } from './SettingsModal';
import { TelemetrySection } from './TelemetrySection';

function getAlertSummary(runtime: ChannelRuntimeState) {
  return (
    runtime.visualFrame.topEventKo ||
    runtime.visualFrame.combinedKo ||
    runtime.visualFrame.eventsKo[0] ||
    '실시간 위험 이벤트 대기'
  );
}

function getFocusedRuntime(runtime: IndustrialMonitorRuntime) {
  return runtime.runtimeMap[runtime.focusedChannelId] ?? EMPTY_INDUSTRIAL_MONITOR_RUNTIME;
}

export function IndustrialCommandShell({ runtime }: { runtime: IndustrialMonitorRuntime }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const channels = INDUSTRIAL_MONITOR_CHANNELS.map((channel) => ({
    channel,
    runtime: runtime.runtimeMap[channel.id] ?? EMPTY_INDUSTRIAL_MONITOR_RUNTIME,
    isFocused: runtime.focusedChannelId === channel.id,
  }));

  const connectedCount = channels.filter(({ runtime: channelRuntime }) => channelRuntime.connectionStatus === 'connected').length;
  const focusedChannel =
    channels.find(({ channel }) => channel.id === runtime.focusedChannelId) ?? channels[0];
  const focusedRuntime = getFocusedRuntime(runtime);
  const popupChannel =
    runtime.popupChannelId != null ? channels.find(({ channel }) => channel.id === runtime.popupChannelId) ?? null : null;
  const popupRuntime = popupChannel?.runtime ?? EMPTY_INDUSTRIAL_MONITOR_RUNTIME;
  const highestRiskChannel =
    channels.find(({ runtime: channelRuntime }) => channelRuntime.alertTier === 'risk') ??
    channels.find(({ runtime: channelRuntime }) => channelRuntime.alertTier === 'caution') ??
    focusedChannel;
  const activeRiskSummary = highestRiskChannel ? getAlertSummary(highestRiskChannel.runtime) : '실시간 위험 이벤트 대기';
  const totalObjectCount = channels.reduce(
    (count, { runtime: channelRuntime }) => count + channelRuntime.visualFrame.objects.length,
    0
  );
  const latestFocusedLog = [...runtime.cctvLogs]
    .reverse()
    .find((entry) => entry.summary.includes(focusedChannel.channel.channel));
  const latestSourceLabel = focusedRuntime.visualFrame.sourceId || '-';
  const latestFrameLabel = `FRAME ${focusedRuntime.visualFrame.frameIndex ?? '--'} · ${focusedRuntime.incomingFps} FPS`;
  const cameraDisconnectDisabled = !channels.some(
    ({ runtime: channelRuntime, channel }) =>
      channel.sourceType === 'cctv' && channelRuntime.connectionStatus !== 'idle'
  );
  const sensorDisconnectDisabled = runtime.sensorConnectionStatus === 'idle';

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <div className="mx-auto flex min-h-dvh max-w-[1920px] flex-col px-1.5 pb-3 pt-2 sm:px-2 lg:px-2.5">
        <CommandHeader
          activeRiskSummary={activeRiskSummary}
          cameraConnectDisabled={!runtime.wsUrl}
          cameraDisconnectDisabled={cameraDisconnectDisabled}
          connectedCount={connectedCount}
          focusedChannelLabel={focusedChannel.channel.channel}
          onConnectCamera={() => {
            if (runtime.wsUrl) runtime.connectSocket(runtime.wsUrl);
          }}
          onConnectSensor={() => {
            if (runtime.sensorBridgeUrl) runtime.connectSensorSocket(runtime.sensorBridgeUrl);
          }}
          onDisconnectCamera={runtime.disconnectSocket}
          onDisconnectSensor={runtime.disconnectSensorSocket}
          onOpenFieldState={runtime.openSensorSnapshotPreview}
          onOpenHazard={() => runtime.openChannelPopup(runtime.focusedChannelId)}
          onOpenLogs={() => setLogsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          riskTone={highestRiskChannel?.runtime.alertTier ?? 'normal'}
          sensorConnectDisabled={!runtime.sensorBridgeUrl}
          sensorDisconnectDisabled={sensorDisconnectDisabled}
          totalCount={channels.length}
        />

        <main className="grid flex-1 grid-cols-1 gap-2 lg:gap-2.5">
          <MonitorSection
            bboxVisible={runtime.bboxVisible}
            channels={channels}
            onFocusChannel={runtime.focusChannel}
            onImageLoad={runtime.updateChannelImageNaturalSize}
            overlayDisplayMode={runtime.overlayDisplayMode}
            rtspPlaybackUrl={runtime.rtspPlaybackUrl}
            rtspStreamMessage={runtime.rtspStreamMessage}
            rtspStreamStatus={runtime.rtspStreamStatus}
          />
          <TelemetrySection
            focusedChannelLabel={`${focusedChannel.channel.channel} ${focusedChannel.channel.title}`}
            latestFrameLabel={latestFrameLabel}
            latestSourceLabel={latestSourceLabel}
            systemLogDetail={
              latestFocusedLog?.detail ||
              focusedRuntime.visualFrame.combinedKo ||
              '집계된 시스템 로그가 없어 실시간 프레임 요약을 표시합니다.'
            }
            systemLogSummary={latestFocusedLog?.summary || getAlertSummary(focusedRuntime)}
            totalObjectCount={totalObjectCount}
          />
        </main>
      </div>

      <SettingsModal
        applySensorBridgeUrl={runtime.applySensorBridgeUrl}
        applyWsUrl={runtime.applyWsUrl}
        configMessage={runtime.configMessage}
        onClose={() => setSettingsOpen(false)}
        open={settingsOpen}
        popupDurationMs={runtime.popupDurationMs}
        applyRtspUrl={runtime.applyRtspUrl}
        sensorBridgeDraft={runtime.sensorBridgeDraft}
        sensorSettingsMessage={runtime.sensorSettingsMessage}
        sensorPopupDurationMs={runtime.sensorPopupDurationMs}
        rtspStreamMessage={runtime.rtspStreamMessage}
        rtspStreamStatus={runtime.rtspStreamStatus}
        rtspUrlDraft={runtime.rtspUrlDraft}
        bboxVisible={runtime.bboxVisible}
        overlayDisplayMode={runtime.overlayDisplayMode}
        setPopupDurationMs={runtime.setPopupDurationMs}
        setSensorPopupDurationMs={runtime.setSensorPopupDurationMs}
        startRtspStream={runtime.startRtspStream}
        stopRtspStream={runtime.stopRtspStream}
        updateBboxVisible={runtime.updateBboxVisible}
        updateOverlayDisplayMode={runtime.updateOverlayDisplayMode}
        updateSensorBridgeDraft={runtime.updateSensorBridgeDraft}
        updateRtspUrlDraft={runtime.updateRtspUrlDraft}
        updateWsDraft={runtime.updateWsDraft}
        wsDraft={runtime.wsDraft}
      />

      <FieldStateModal
        message={runtime.fieldStateMessage}
        onClose={runtime.closeSensorPopup}
        open={runtime.sensorPopupOpen}
        snapshot={runtime.sensorSnapshot}
      />

      <HazardModal
        channelLabel={popupChannel?.channel.channel ?? focusedChannel.channel.channel}
        channelTitle={popupChannel?.channel.title ?? focusedChannel.channel.title}
        bboxVisible={runtime.bboxVisible}
        onClose={runtime.closeChannelPopup}
        overlayDisplayMode={runtime.overlayDisplayMode}
        open={popupChannel !== null}
        runtime={popupRuntime}
        summary={popupChannel ? getAlertSummary(popupRuntime) : getAlertSummary(focusedRuntime)}
      />

      <LogsModal
        cctvLogs={runtime.cctvLogs}
        logActionMessage={runtime.logActionMessage}
        onClose={() => setLogsOpen(false)}
        open={logsOpen}
        saveLogsToServer={runtime.saveLogsToServer}
        savingLogType={runtime.savingLogType}
        sensorLogs={runtime.sensorLogs}
      />
    </div>
  );
}

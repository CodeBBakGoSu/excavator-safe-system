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
  const popupSnapshot = runtime.popupSnapshot;
  const highestRiskChannel =
    channels.find(({ runtime: channelRuntime }) => channelRuntime.alertTier === 'risk') ??
    channels.find(({ runtime: channelRuntime }) => channelRuntime.alertTier === 'caution') ??
    focusedChannel;
  const activeRiskSummary = highestRiskChannel ? getAlertSummary(highestRiskChannel.runtime) : '실시간 위험 이벤트 대기';
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

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:gap-2.5">
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
            eventFeed={runtime.eventFeed}
          />
        </main>
      </div>

      <SettingsModal
        applySensorBridgeUrl={runtime.applySensorBridgeUrl}
        applyWsUrl={runtime.applyWsUrl}
        applyRtspControlUrl={runtime.applyRtspControlUrl}
        configMessage={runtime.configMessage}
        onClose={() => setSettingsOpen(false)}
        open={settingsOpen}
        popupDurationMs={runtime.popupDurationMs}
        applyRtspUrl={runtime.applyRtspUrl}
        applyTelegramSettings={runtime.applyTelegramSettings}
        sensorBridgeDraft={runtime.sensorBridgeDraft}
        rtspControlDraft={runtime.rtspControlDraft}
        sensorSettingsMessage={runtime.sensorSettingsMessage}
        sensorPopupDurationMs={runtime.sensorPopupDurationMs}
        syncTelegramChats={runtime.syncTelegramChats}
        telegramAutoSync={runtime.telegramAutoSync}
        telegramBotTokenConfigured={runtime.telegramBotTokenConfigured}
        telegramBotTokenDraft={runtime.telegramBotTokenDraft}
        telegramBotTokenMasked={runtime.telegramBotTokenMasked}
        telegramKnownChats={runtime.telegramKnownChats}
        telegramSavingSettings={runtime.telegramSavingSettings}
        telegramSensorCooldownDraft={runtime.telegramSensorCooldownDraft}
        telegramSettingsMessage={runtime.telegramSettingsMessage}
        telegramSyncingChats={runtime.telegramSyncingChats}
        rtspStreamMessage={runtime.rtspStreamMessage}
        rtspStreamStatus={runtime.rtspStreamStatus}
        rtspUrlDraft={runtime.rtspUrlDraft}
        bboxVisible={runtime.bboxVisible}
        overlayDisplayMode={runtime.overlayDisplayMode}
        hazardPopupDebounceMode={runtime.hazardPopupDebounceMode}
        setPopupDurationMs={runtime.setPopupDurationMs}
        setSensorPopupDurationMs={runtime.setSensorPopupDurationMs}
        startRtspStream={runtime.startRtspStream}
        stopRtspStream={runtime.stopRtspStream}
        updateBboxVisible={runtime.updateBboxVisible}
        updateOverlayDisplayMode={runtime.updateOverlayDisplayMode}
        updateHazardPopupDebounceMode={runtime.updateHazardPopupDebounceMode}
        updateTelegramAutoSync={runtime.updateTelegramAutoSync}
        updateTelegramBotTokenDraft={runtime.updateTelegramBotTokenDraft}
        updateTelegramChatSelection={runtime.updateTelegramChatSelection}
        updateTelegramSensorCooldownDraft={runtime.updateTelegramSensorCooldownDraft}
        updateSensorBridgeDraft={runtime.updateSensorBridgeDraft}
        updateRtspControlDraft={runtime.updateRtspControlDraft}
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
        channelLabel={popupSnapshot?.channelLabel ?? focusedChannel.channel.channel}
        channelTitle={popupSnapshot?.channelTitle ?? focusedChannel.channel.title}
        bboxVisible={runtime.bboxVisible}
        onClose={runtime.closeChannelPopup}
        overlayDisplayMode={runtime.overlayDisplayMode}
        open={popupSnapshot !== null}
        runtime={popupSnapshot?.runtime ?? EMPTY_INDUSTRIAL_MONITOR_RUNTIME}
        summary={popupSnapshot?.summary ?? getAlertSummary(focusedRuntime)}
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

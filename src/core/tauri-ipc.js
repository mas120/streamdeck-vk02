import { ipcCounter } from './diagnostics.js';

export const SYSTEM_VOLUME_ECHO_GUARD_MS = 1500;

export function createTauriIpc() {
  let systemVolumeInFlight = false;
  let systemVolumePending = null;
  let lastSystemVolumeWriteAt = -Infinity;

  function getTauri() {
    return window.__TAURI__ ? (window.__TAURI__.core || window.__TAURI__.tauri) : null;
  }

  async function invokeCmd(cmd, args = {}) {
    ipcCounter.record(cmd);
    const tauri = getTauri();
    if (!tauri) {
      console.log(`[Mock IPC] ${cmd}`, args);
      return null;
    }
    return tauri.invoke(cmd, args);
  }

  async function callTauriAction(actionType, target = '') {
    if (!getTauri()) {
      console.log(`[Mock IPC] trigger_action ${actionType}`, target);
      return false;   // không có backend thì không thể báo "thành công"
    }
    try {
      await invokeCmd('trigger_action', { actionType, target: String(target) });
      return true;
    } catch (err) {
      console.error('Lỗi Action:', err);
      return false;
    }
  }

  async function sendSystemVolume(pct) {
    lastSystemVolumeWriteAt = performance.now();
    if (systemVolumeInFlight) {
      systemVolumePending = pct;
      return;
    }
    systemVolumeInFlight = true;
    try {
      await callTauriAction('set_volume', pct);
    } finally {
      systemVolumeInFlight = false;
      lastSystemVolumeWriteAt = performance.now();
      if (systemVolumePending !== null) {
        const next = systemVolumePending;
        systemVolumePending = null;
        sendSystemVolume(next);
      }
    }
  }

  async function setSystemMute(muted) {
    lastSystemVolumeWriteAt = performance.now();
    try {
      await invokeCmd('set_master_mute', { muted });
      return true;
    } catch (err) {
      console.error('set_master_mute lỗi:', err);
      return false;
    }
  }

  async function getMicState() {
    try {
      return await invokeCmd('get_mic_state');
    } catch (err) {
      console.error('get_mic_state lỗi:', err);
      return null;
    }
  }

  async function toggleMicMute() {
    try {
      return await invokeCmd('toggle_mic_mute');
    } catch (err) {
      console.error('toggle_mic_mute lỗi:', err);
      return null;
    }
  }

  function isSystemVolumeEchoGuardActive() {
    return performance.now() - lastSystemVolumeWriteAt < SYSTEM_VOLUME_ECHO_GUARD_MS;
  }

  return {
    getTauri,
    invokeCmd,
    callTauriAction,
    sendSystemVolume,
    setSystemMute,
    getMicState,
    toggleMicMute,
    isSystemVolumeEchoGuardActive,
  };
}

class TimeFormatter {
  static secondsToLabel(totalSeconds) {
    if (typeof totalSeconds !== 'number' || Number.isNaN(totalSeconds)) return '0:00';
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
  }

  static labelToSeconds(label) {
    if (!label) return 0;
    const parts = label.split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  static msToSeconds(ms) {
    return Math.round((ms / 1000) * 100) / 100;
  }
}

export const secondsToLabel = TimeFormatter.secondsToLabel;
export const labelToSeconds = TimeFormatter.labelToSeconds;
export const msToSeconds = TimeFormatter.msToSeconds;
export default TimeFormatter;

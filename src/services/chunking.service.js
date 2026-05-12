import { secondsToLabel } from '../utils/timeFormatter.js';

class ChunkingService {
  constructor({ windowSeconds = 30, overlapSeconds = 5, minWords = 10 } = {}) {
    this.windowSeconds = windowSeconds;
    this.overlapSeconds = overlapSeconds;
    this.minWords = minWords;
  }

  chunkTranscript(normalizedTranscript) {
    if (!normalizedTranscript?.length) return [];

    const chunks = [];
    let chunkIndex = 0;
    const totalDuration = normalizedTranscript[normalizedTranscript.length - 1]?.end || 0;
    const step = this.windowSeconds - this.overlapSeconds;
    let startPointer = 0;

    for (let windowStart = 0; windowStart < totalDuration; windowStart += step) {
      const windowEnd = windowStart + this.windowSeconds;
      while (
        startPointer < normalizedTranscript.length
        && normalizedTranscript[startPointer].end <= windowStart
      ) {
        startPointer += 1;
      }

      const segments = [];
      for (let index = startPointer; index < normalizedTranscript.length; index += 1) {
        const segment = normalizedTranscript[index];
        if (segment.start >= windowEnd) break;
        if (segment.end > windowStart) segments.push(segment);
      }

      if (!segments.length) continue;

      const text = segments.map((segment) => segment.text.trim()).join(' ').trim();
      if (text.split(/\s+/).length < this.minWords) continue;

      const startTime = segments[0].start;
      const endTime = segments[segments.length - 1].end;

      chunks.push({
        chunkIndex,
        text,
        startTime,
        endTime,
        startLabel: secondsToLabel(startTime),
        endLabel: secondsToLabel(endTime),
      });

      chunkIndex += 1;
    }

    return chunks;
  }
}

export default ChunkingService;

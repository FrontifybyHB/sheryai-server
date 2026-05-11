import { Readable } from 'stream';
import * as youtubeTranscriptPkg from 'youtube-transcript';
import * as assemblyPkg from 'assemblyai';
import config from '../config/env.js';
import { msToSeconds } from '../utils/timeFormatter.js';
import AppError from '../utils/AppError.js';

const { YoutubeTranscript } = youtubeTranscriptPkg;
const { AssemblyAI } = assemblyPkg;
const CAPTIONS_UNAVAILABLE_MESSAGE = 'This video has no captions available. Please upload the video file directly instead.';

class TranscriptService {
  constructor() {
    this.assemblyClient = null;
  }

  getAssemblyClient() {
    if (!config.assemblyAiApiKey) {
      throw new Error('ASSEMBLYAI_API_KEY is missing from environment variables.');
    }

    if (!this.assemblyClient) {
      this.assemblyClient = new AssemblyAI({ apiKey: config.assemblyAiApiKey });
    }

    return this.assemblyClient;
  }

  extractYoutubeId(url) {
    const patterns = [
      /(?:v=|\/v\/|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/,
      /^([A-Za-z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  async fetchYoutubeTranscript(youtubeUrl) {
    const videoId = this.extractYoutubeId(youtubeUrl);
    if (!videoId) throw new Error('Invalid YouTube URL format.');

    let rawTranscript;
    try {
      rawTranscript = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (err) {
      if (this.isCaptionUnavailableError(err)) {
        throw new AppError(CAPTIONS_UNAVAILABLE_MESSAGE, 422, {
          reason: 'youtube_captions_unavailable',
          suggestedAction: 'upload_video',
        });
      }
      throw new Error(`YouTube transcript error: ${err.message}`);
    }

    if (!rawTranscript?.length) {
      throw new AppError(CAPTIONS_UNAVAILABLE_MESSAGE, 422, {
        reason: 'youtube_captions_unavailable',
        suggestedAction: 'upload_video',
      });
    }

    return this.normalizeTranscript(rawTranscript.map((segment) => ({
      text: segment.text,
      start: msToSeconds(segment.offset),
      end: msToSeconds(segment.offset + segment.duration),
    })));
  }

  isCaptionUnavailableError(err) {
    const message = err?.message || '';
    return /disabled|no transcript|no captions|not available|could not find/i.test(message);
  }

  async uploadBufferToAssemblyAI(fileBuffer) {
    const uploadUrl = await this.getAssemblyClient().files.upload(Readable.from(fileBuffer));
    if (!uploadUrl || typeof uploadUrl !== 'string') {
      throw new Error(`AssemblyAI files.upload() returned unexpected value: ${JSON.stringify(uploadUrl)}`);
    }
    return uploadUrl;
  }

  async submitTranscript(audioUrl, language = 'auto') {
    const requestConfig = {
      audio_url: audioUrl,
      speech_models: ['universal-2'],
      punctuate: true,
      format_text: true,
      language_detection: language === 'auto',
    };

    if (language !== 'auto') {
      requestConfig.language_code = language;
      requestConfig.language_detection = false;
    }

    const submitted = await this.getAssemblyClient().transcripts.submit(requestConfig);
    return submitted.id;
  }

  async pollTranscriptUntilDone(transcriptId, onProgress, startPct = 20, endPct = 78) {
    const pollIntervalMs = 3000;
    let pct = startPct;

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const result = await this.getAssemblyClient().transcripts.get(transcriptId);

      if (result.status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${result.error}`);
      }

      if (result.status === 'completed') {
        return result;
      }

      if (pct < endPct) {
        pct = Math.min(pct + 1, endPct);
        if (onProgress) await onProgress(pct);
      }
    }
  }

  normalizeAssemblyResult(transcript) {
    if (!transcript.words?.length) {
      return [{
        text: transcript.text || '',
        start: 0,
        end: transcript.audio_duration || 0,
      }];
    }

    const segments = [];
    const groupSize = 10;

    for (let index = 0; index < transcript.words.length; index += groupSize) {
      const group = transcript.words.slice(index, index + groupSize);
      segments.push({
        text: group.map((word) => word.text).join(' '),
        start: msToSeconds(group[0].start),
        end: msToSeconds(group[group.length - 1].end),
      });
    }

    return this.normalizeTranscript(segments);
  }

  normalizeTranscript(rawSegments) {
    if (!rawSegments?.length) return [];

    const normalized = [];
    let buffer = null;

    for (const segment of rawSegments) {
      const cleaned = segment.text.replace(/\[.*?\]/g, '').trim();
      if (!cleaned) continue;

      const wordCount = cleaned.split(/\s+/).length;
      if (wordCount < 2 && buffer) {
        buffer.text += ` ${cleaned}`;
        buffer.end = segment.end;
        continue;
      }

      if (buffer) {
        buffer.text = buffer.text.replace(/((\bum\b|\buh\b|\blike\b)\s*){3,}/gi, '$2 ');
        normalized.push(buffer);
      }

      buffer = {
        text: cleaned,
        start: segment.start,
        end: segment.end,
      };
    }

    if (buffer) normalized.push(buffer);
    return normalized;
  }
}

export default TranscriptService;

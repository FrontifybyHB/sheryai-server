import { Readable } from 'stream';
import * as youtubeTranscriptPkg from 'youtube-transcript';
import * as assemblyPkg from 'assemblyai';
import config from '../config/env.js';
import logger from '../loggers/logger.js';
import { msToSeconds } from '../utils/timeFormatter.js';
import AppError from '../utils/AppError.js';

const { YoutubeTranscript } = youtubeTranscriptPkg;
const { AssemblyAI } = assemblyPkg;
const CAPTIONS_UNAVAILABLE_MESSAGE = 'Could not fetch captions from YouTube for this video. It may not expose captions to our production server. Please upload the video file directly instead.';
const CAPTIONS_LANGUAGE_UNAVAILABLE_MESSAGE = 'Captions are not available in the selected language for this video. Try Auto language or upload the video file directly instead.';
const YOUTUBE_FETCH_BLOCKED_MESSAGE = 'YouTube blocked or rate-limited caption fetching from our production server. Please upload the video file directly instead.';
const YOUTUBE_VIDEO_UNAVAILABLE_MESSAGE = 'This YouTube video is unavailable. Check the URL, privacy settings, or upload the video file directly instead.';

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

  extractGoogleDriveFileId(url) {
    const patterns = [
      /drive\.google\.com\/file\/d\/([^/]+)/i,
      /drive\.google\.com\/open\?id=([^&]+)/i,
      /drive\.google\.com\/uc\?(?:[^#]*&)?id=([^&]+)/i,
      /docs\.google\.com\/uc\?(?:[^#]*&)?id=([^&]+)/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return decodeURIComponent(match[1]);
    }

    return null;
  }

  isBlockedHost(hostname) {
    const host = hostname.toLowerCase();
    return host === 'localhost'
      || host === '0.0.0.0'
      || host === '::1'
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^169\.254\./.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  }

  normalizePublicMediaUrl(sourceUrl) {
    let parsed;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      throw new AppError('Invalid URL. Paste a full public https:// video URL.', 400);
    }

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new AppError('Only public http/https video URLs are supported.', 400);
    }

    if (this.isBlockedHost(parsed.hostname)) {
      throw new AppError('Private or localhost URLs are not supported for video ingestion.', 400);
    }

    const googleDriveFileId = this.extractGoogleDriveFileId(sourceUrl);
    if (googleDriveFileId) {
      return {
        url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(googleDriveFileId)}`,
        sourceType: 'google_drive',
      };
    }

    if (/youtube\.com|youtu\.be/i.test(parsed.hostname)) {
      return {
        url: sourceUrl,
        sourceType: 'youtube',
      };
    }

    return {
      url: sourceUrl,
      sourceType: /zoom\.us$/i.test(parsed.hostname) || /\.zoom\.us$/i.test(parsed.hostname)
        ? 'zoom'
        : 'external_url',
    };
  }

  youtubeSegmentTime(value, duration) {
    const numeric = Number(value || 0);
    const numericDuration = Number(duration || 0);

    if (!Number.isFinite(numeric)) return 0;
    return numericDuration > 120 ? msToSeconds(numeric) : numeric;
  }

  youtubeFetchConfig(language, trace) {
    const configOptions = {};
    if (language !== 'auto') configOptions.lang = language;
    configOptions.fetch = this.createTracedYoutubeFetch(trace);
    return configOptions;
  }

  createTracedYoutubeFetch(trace) {
    return async (url, options = {}) => {
      const startedAt = Date.now();
      const attempt = this.youtubeFetchAttempt(url, options);

      try {
        const response = await fetch(url, options);
        trace.push({
          ...attempt,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type'),
          durationMs: Date.now() - startedAt,
        });
        return response;
      } catch (err) {
        trace.push({
          ...attempt,
          errorName: err.name,
          error: err.message,
          durationMs: Date.now() - startedAt,
        });
        throw err;
      }
    };
  }

  youtubeFetchAttempt(url, options = {}) {
    try {
      const parsed = new URL(url);
      return {
        method: options.method || 'GET',
        host: parsed.hostname,
        path: parsed.pathname,
      };
    } catch {
      return {
        method: options.method || 'GET',
        host: 'invalid-url',
        path: '',
      };
    }
  }

  async fetchYoutubeTranscript(youtubeUrl, language = 'auto') {
    const videoId = this.extractYoutubeId(youtubeUrl);
    if (!videoId) throw new Error('Invalid YouTube URL format.');

    let rawTranscript;
    const fetchTrace = [];
    try {
      rawTranscript = await YoutubeTranscript.fetchTranscript(youtubeUrl, this.youtubeFetchConfig(language, fetchTrace));
    } catch (err) {
      const failure = this.classifyYoutubeTranscriptFailure(err, fetchTrace);
      logger.warn('YouTube transcript fetch failed', {
        videoId,
        language,
        reason: failure.reason,
        error: err,
        fetchTrace,
      });

      if (failure.statusCode) {
        throw new AppError(failure.message, failure.statusCode, {
          reason: failure.reason,
          suggestedAction: failure.suggestedAction,
        });
      }

      throw new Error(`YouTube transcript error: ${err.message}`);
    }

    if (!rawTranscript?.length) {
      logger.warn('YouTube transcript fetch returned no segments', {
        videoId,
        language,
        fetchTrace,
      });
      throw new AppError(CAPTIONS_UNAVAILABLE_MESSAGE, 422, {
        reason: 'youtube_captions_unavailable',
        suggestedAction: 'upload_video',
      });
    }

    return this.normalizeTranscript(rawTranscript.map((segment) => ({
      text: segment.text,
      start: this.youtubeSegmentTime(segment.offset, segment.duration),
      end: this.youtubeSegmentTime(Number(segment.offset || 0) + Number(segment.duration || 0), segment.duration),
    })));
  }

  isCaptionUnavailableError(err) {
    const message = err?.message || '';
    return /disabled|no transcript|no captions|not available|could not find/i.test(message);
  }

  classifyYoutubeTranscriptFailure(err, fetchTrace = []) {
    const message = err?.message || '';
    const hasBlockedStatus = fetchTrace.some((attempt) => [403, 408, 409, 429, 500, 502, 503, 504].includes(attempt.status));
    const hasFetchError = fetchTrace.some((attempt) => attempt.error);

    if (/captcha|too many|rate.?limit|unusual traffic|blocked|forbidden/i.test(message) || hasBlockedStatus) {
      return {
        statusCode: 422,
        message: YOUTUBE_FETCH_BLOCKED_MESSAGE,
        reason: 'youtube_transcript_fetch_blocked',
        suggestedAction: 'upload_video',
      };
    }

    if (hasFetchError) {
      return {
        statusCode: 422,
        message: CAPTIONS_UNAVAILABLE_MESSAGE,
        reason: 'youtube_transcript_fetch_failed',
        suggestedAction: 'upload_video',
      };
    }

    if (/no longer available|video is unavailable/i.test(message)) {
      return {
        statusCode: 422,
        message: YOUTUBE_VIDEO_UNAVAILABLE_MESSAGE,
        reason: 'youtube_video_unavailable',
        suggestedAction: 'check_youtube_url',
      };
    }

    if (/No transcripts are available in/i.test(message)) {
      return {
        statusCode: 422,
        message: CAPTIONS_LANGUAGE_UNAVAILABLE_MESSAGE,
        reason: 'youtube_caption_language_unavailable',
        suggestedAction: 'try_auto_language',
      };
    }

    if (this.isCaptionUnavailableError(err)) {
      return {
        statusCode: 422,
        message: CAPTIONS_UNAVAILABLE_MESSAGE,
        reason: 'youtube_captions_unavailable',
        suggestedAction: 'upload_video',
      };
    }

    return {
      statusCode: null,
      message: err.message,
      reason: 'youtube_transcript_error',
      suggestedAction: 'retry_or_upload_video',
    };
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
      speech_model: 'best',
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
    const pollIntervalMs = 4000;
    const maxPolls = 120; // ~8 minutes max before giving up
    let pct = startPct;
    let polls = 0;

    while (polls < maxPolls) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      polls += 1;

      const result = await this.getAssemblyClient().transcripts.get(transcriptId);

      if (result.status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${result.error || 'Unknown error'}`);
      }

      if (result.status === 'completed') {
        return result;
      }

      if (pct < endPct) {
        pct = Math.min(pct + 1, endPct);
        if (onProgress) await onProgress(pct);
      }
    }

    throw new Error('Transcription timed out after 8 minutes. The file may be too large or AssemblyAI is overloaded. Please try again.');
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

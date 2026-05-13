import fs from 'fs';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import AppError from '../utils/AppError.js';

class LessonController {
  constructor(lessonService) {
    this.lessonService = lessonService;
  }

  assertInstructor(req) {
    if (req.user?.role !== 'instructor') {
      throw new AppError('Only instructors can delete lessons.', 403);
    }
  }

  parseRangeHeader(rangeHeader, fileSize) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
    if (!match) return null;

    const [, rawStart, rawEnd] = match;
    if (!rawStart && !rawEnd) return null;

    let start;
    let end;

    if (!rawStart) {
      const suffixLength = Number(rawEnd);
      if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
      start = Math.max(fileSize - suffixLength, 0);
      end = fileSize - 1;
    } else {
      start = Number(rawStart);
      end = rawEnd ? Number(rawEnd) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= fileSize) {
      return null;
    }

    return {
      start,
      end: Math.min(end, fileSize - 1),
    };
  }

  ingestYoutube = asyncHandler(async (req, res) => {
    const result = await this.lessonService.createYoutubeLesson(req.body, req.user);
    res.status(201).json(ApiResponse.success(result, result.message, 201));
  });

  ingestUrl = asyncHandler(async (req, res) => {
    const result = await this.lessonService.createUrlLesson(req.body, req.user);
    res.status(201).json(ApiResponse.success(result, result.message, 201));
  });

  upload = asyncHandler(async (req, res) => {
    const result = await this.lessonService.createUploadedLesson(req.body, req.file, req.user);
    res.status(201).json(ApiResponse.success(result, result.message, 201));
  });

  status = asyncHandler(async (req, res) => {
    const status = await this.lessonService.getStatus(req.params.lessonId);
    res.json(ApiResponse.success(status, 'Lesson status fetched'));
  });

  video = asyncHandler(async (req, res) => {
    const video = await this.lessonService.getVideo(req.params.lessonId, {
      delivery: req.query.delivery,
    });
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (video.type === 'redirect') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.redirect(302, video.url);
    }

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const range = this.parseRangeHeader(rangeHeader, video.fileSize);

      if (!range) {
        res.writeHead(416, {
          'Content-Range': `bytes */${video.fileSize}`,
          'Accept-Ranges': 'bytes',
        });
        return res.end();
      }

      const { start, end } = range;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${video.fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.contentType,
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });
      if (video.type === 'gcs') {
        return video.file.createReadStream({ start, end }).pipe(res);
      }
      return fs.createReadStream(video.filePath, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Length': video.fileSize,
      'Content-Type': video.contentType,
      'Accept-Ranges': 'bytes',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    if (video.type === 'gcs') {
      return video.file.createReadStream().pipe(res);
    }
    return fs.createReadStream(video.filePath).pipe(res);
  });

  playbackUrl = asyncHandler(async (req, res) => {
    const playback = await this.lessonService.getPlaybackUrl(req.params.lessonId);
    res.json(ApiResponse.success(playback, 'Playback URL fetched'));
  });

  getById = asyncHandler(async (req, res) => {
    const lesson = await this.lessonService.getById(req.params.lessonId);
    res.json(ApiResponse.success({ lesson }, 'Lesson fetched'));
  });

  list = asyncHandler(async (req, res) => {
    const lessons = await this.lessonService.listByCourse(req.query.courseId, {
      status: req.query.status,
      includeFailed: req.query.includeFailed,
    });
    res.json(ApiResponse.success({ lessons }, 'Lessons fetched'));
  });

  failed = asyncHandler(async (req, res) => {
    const result = await this.lessonService.listFailedByCourse(req.query.courseId);
    res.json(ApiResponse.success(result, 'Failed lessons fetched'));
  });

  deleteFailed = asyncHandler(async (req, res) => {
    const result = await this.lessonService.deleteFailedByCourse(req.query.courseId);
    res.json(ApiResponse.success(result, 'Failed lessons deleted'));
  });

  deleteFailedLesson = asyncHandler(async (req, res) => {
    this.assertInstructor(req);
    const result = await this.lessonService.deleteFailedLesson(req.params.lessonId);
    res.json(ApiResponse.success(result, 'Failed lesson deleted'));
  });

  deleteLesson = asyncHandler(async (req, res) => {
    this.assertInstructor(req);
    const result = await this.lessonService.deleteLesson(req.params.lessonId);
    res.json(ApiResponse.success(result, 'Lesson deleted'));
  });

  regenerateChapters = asyncHandler(async (req, res) => {
    const result = await this.lessonService.regenerateChapters(req.params.lessonId);
    res.json(ApiResponse.success(result, 'Chapters regenerated'));
  });

  transcript = asyncHandler(async (req, res) => {
    const chunks = await this.lessonService.getTranscript(req.params.lessonId);
    const message = chunks.length ? 'Transcript fetched' : 'No transcript available yet.';
    res.json(ApiResponse.success({ chunks, total: chunks.length, message }, message));
  });
}

export default LessonController;

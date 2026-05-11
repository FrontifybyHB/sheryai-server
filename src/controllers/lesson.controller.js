import fs from 'fs';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

class LessonController {
  constructor(lessonService) {
    this.lessonService = lessonService;
  }

  ingestYoutube = asyncHandler(async (req, res) => {
    const result = await this.lessonService.createYoutubeLesson(req.body, req.user);
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
    const video = await this.lessonService.getVideo(req.params.lessonId);

    if (video.type === 'redirect') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.redirect(302, video.url);
    }

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 10 * 1024 * 1024, video.fileSize - 1);
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${video.fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.contentType,
      });
      return fs.createReadStream(video.filePath, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Length': video.fileSize,
      'Content-Type': video.contentType,
      'Accept-Ranges': 'bytes',
    });
    return fs.createReadStream(video.filePath).pipe(res);
  });

  getById = asyncHandler(async (req, res) => {
    const lesson = await this.lessonService.getById(req.params.lessonId);
    res.json(ApiResponse.success({ lesson }, 'Lesson fetched'));
  });

  list = asyncHandler(async (req, res) => {
    const lessons = await this.lessonService.listByCourse(req.query.courseId);
    res.json(ApiResponse.success({ lessons }, 'Lessons fetched'));
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

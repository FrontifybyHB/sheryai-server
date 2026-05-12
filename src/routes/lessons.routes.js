import express from 'express';
import multer from 'multer';
import container from '../container.js';
import LessonController from '../controllers/lesson.controller.js';
import LessonValidator from '../validators/lesson.validator.js';
import validateRequest from '../middleware/validateRequest.js';

const router = express.Router();
const controller = new LessonController(container.lessonService);
const validator = new LessonValidator();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'audio/mpeg', 'audio/wav', 'audio/mp4'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error(`File type ${file.mimetype} not supported. Use MP4, WebM, MOV, AVI, MP3, or WAV.`));
  },
});

router.post('/ingest-youtube', validateRequest(validator.youtubeIngest()), controller.ingestYoutube);
router.post('/ingest-url', validateRequest(validator.urlIngest()), controller.ingestUrl);
router.post('/upload', upload.single('file'), validateRequest(validator.upload()), controller.upload);
router.get('/failed', validateRequest(validator.failedQuery(), 'query'), controller.failed);
router.delete('/failed', validateRequest(validator.failedQuery(), 'query'), controller.deleteFailed);
router.get('/:lessonId/status', controller.status);
router.get('/:lessonId/video', controller.video);
router.post('/:lessonId/regenerate-chapters', controller.regenerateChapters);
router.get('/:lessonId/transcript', controller.transcript);
router.delete('/:lessonId/failed', controller.deleteFailedLesson);
router.get('/:lessonId', controller.getById);
router.get('/', validateRequest(validator.listQuery(), 'query'), controller.list);

export default router;

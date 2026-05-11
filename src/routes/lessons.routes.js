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
router.post('/upload', upload.single('file'), validateRequest(validator.upload()), controller.upload);
router.get('/:lessonId/status', controller.status);
router.get('/:lessonId/video', controller.video);
router.post('/:lessonId/regenerate-chapters', controller.regenerateChapters);
router.get('/:lessonId/transcript', controller.transcript);
router.get('/:lessonId', controller.getById);
router.get('/', validateRequest(validator.listQuery(), 'query'), controller.list);

export default router;

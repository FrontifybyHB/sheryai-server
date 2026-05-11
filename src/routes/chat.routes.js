import express from 'express';
import container from '../container.js';
import ChatController from '../controllers/chat.controller.js';
import ChatValidator from '../validators/chat.validator.js';
import validateRequest from '../middleware/validateRequest.js';

const router = express.Router();
const controller = new ChatController(container.chatService);
const validator = new ChatValidator();

router.post('/stream', validateRequest(validator.stream()), controller.stream);
router.post('/summary', validateRequest(validator.summary()), controller.summary);
router.post('/quiz', validateRequest(validator.quiz()), controller.quiz);
router.get('/session/:lessonId', controller.latestSession);
router.delete('/session/:sessionId', controller.deleteSession);

export default router;

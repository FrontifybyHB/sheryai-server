import express from 'express';
import HealthController from '../controllers/health.controller.js';

const router = express.Router();
const controller = new HealthController();

router.get('/', controller.status);

export default router;

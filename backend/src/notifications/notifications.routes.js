import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { getUserNotificationsController, markAsReadController } from './notifications.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', getUserNotificationsController);
router.patch('/:notificationId/read', markAsReadController);

export default router;

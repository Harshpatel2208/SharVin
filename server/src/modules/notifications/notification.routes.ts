import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { NotificationController } from './notification.controller';

const router = Router();

// Activity feed & badge counters are visible to every authenticated principal
// (including counter staff) because all queries are tenant-scoped and read-only.
router.use(authenticate);

router.get('/activity', NotificationController.getActivity);

export default router;

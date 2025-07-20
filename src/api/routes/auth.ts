import { Router } from 'express';

import { register, login, getMe, updatePassword } from '../../controllers/auth.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', authenticate, getMe);
router.put('/update-password', authenticate, updatePassword);

export default router;

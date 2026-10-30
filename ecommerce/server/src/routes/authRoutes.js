import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
const router = Router(); const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many authentication attempts. Try again later.' } });
router.post('/register', authLimit, register); router.post('/login', authLimit, login); router.get('/me', protect, me); export default router;

import express from 'express';
import validate from '../middlewares/validate.js';
import authValidation from '../validations/auth.validation.js';
import authController from '../controllers/auth.controller.js';
import passport from 'passport';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/register', validate(authValidation.register), authController.register);
router.post('/login', validate(authValidation.login), authController.login);

// Helper to generate Token and Redirect
const handleAuthCallback = (req, res) => {
  const user = req.user;
  
  // 1. Generate JWT
  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  // 2. Redirect to Frontend with Token
  // Frontend will read this param, save it to localStorage/Zustand, and strip it from URL
  res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
};

// --- Google Routes ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login/failed' }),
  handleAuthCallback
);

// --- GitHub Routes ---
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login/failed' }),
  handleAuthCallback
);

export default router;
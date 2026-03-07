import httpStatus from 'http-status';
import { createUser, loginUserWithEmailAndPassword, getUserById } from '../services/auth.service.js';
import { generateAuthTokens } from '../services/token.service.js';
import { clearUserCookies } from '../services/cookie.service.js';
import config from '../config/config.js';

const catchAsync = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

export const register = catchAsync(async (req, res) => {
  const user = await createUser(req.body);
  const tokens = await generateAuthTokens(user);
  
  res.cookie('token', tokens.access.token, {
    httpOnly: true,
    secure: config.env === 'production',
    expires: tokens.access.expires,
    sameSite: config.env === 'production' ? 'lax' : 'lax'
  });

  res.status(httpStatus.CREATED).send({ user: { id: user.id, email: user.email, full_name: user.fullName } });
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await loginUserWithEmailAndPassword(email, password);
  const tokens = await generateAuthTokens(user);
  
  res.cookie('token', tokens.access.token, {
    httpOnly: true,
    secure: config.env === 'production', 
    expires: tokens.access.expires,
    sameSite: config.env === 'production' ? 'lax' : 'lax'
  });

  res.send({ user: { id: user.id, email: user.email, full_name: user.fullName } });
});

export const getMe = async (req, res) => {
  const user = await getUserById(req.user.id);

  if (!user) {
    return res.status(httpStatus.NOT_FOUND).json({ message: 'User not found', isAuthenticated: false });
  }

  res.json({
    isAuthenticated: true,
    user,
  });
};

export const logout = async (req, res) => {
  // 1. Clear the Auth Token (Cookie)
  res.clearCookie('token');

  // 2. Clear the Request Cookie Jar for this user
  if (req.user && req.user.id) {
    await clearUserCookies(req.user.id);
  }

  res.json({ message: 'Logged out successfully' });
};
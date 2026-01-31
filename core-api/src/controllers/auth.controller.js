import httpStatus from 'http-status';
import authService from '../services/auth.service.js';
import tokenService from '../services/token.service.js';
import config from '../config/config.js';

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const register = catchAsync(async (req, res) => {
  const user = await authService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  
  res.cookie('token', tokens.access.token, {
    httpOnly: true,
    secure: config.env === 'production',
    expires: tokens.access.expires,
    sameSite: config.env === 'production' ? 'lax' : 'lax'
  });

  res.status(httpStatus.CREATED).send({ user: { id: user.id, email: user.email, full_name: user.fullName } });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(user);
  
  res.cookie('token', tokens.access.token, {
    httpOnly: true,
    secure: config.env === 'production', 
    expires: tokens.access.expires,
    sameSite: config.env === 'production' ? 'lax' : 'lax'
  });

  res.send({ user: { id: user.id, email: user.email, full_name: user.fullName } });
});

export default {
  register,
  login,
};
import httpStatus from 'http-status';
import authService from '../services/auth.service.js';
import tokenService from '../services/token.service.js';

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const register = catchAsync(async (req, res) => {
  const user = await authService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({ user: { id: user.id, email: user.email, full_name: user.full_name }, tokens });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(user);
  res.send({ user: { id: user.id, email: user.email, full_name: user.full_name }, tokens });
});

export default {
  register,
  login,
};
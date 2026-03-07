import httpStatus from 'http-status';
import { Prisma } from '@prisma/client';
import config from '../config/config.js';
import ApiError from '../utils/ApiError.js';

const errorConverter = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode =
      err.statusCode
        ? err.statusCode
        : err instanceof Prisma.PrismaClientKnownRequestError
        ? httpStatus.BAD_REQUEST
        : httpStatus.INTERNAL_SERVER_ERROR;

    error = new ApiError(
      statusCode,
      err.message || httpStatus[statusCode],
      false,
      err.stack
    );
  }

  next(error);
};

const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;

  if (config.env === 'production' && !err.isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR];
  }

  if (config.env === 'development') {
    console.error('ERROR 💥', err);
  }

  res.status(statusCode).json({
    code: statusCode,
    message,
    ...(config.env === 'development' && { stack: err.stack }),
  });
};

export { errorConverter, errorHandler };
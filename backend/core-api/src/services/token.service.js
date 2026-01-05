import jwt from 'jsonwebtoken';
import moment from 'moment';
import config from '../config/config.js';

const generateToken = (userId, expires, type, secret = process.env.JWT_SECRET || 'thisisasupersecretkey') => {
  const payload = {
    sub: userId,
    iat: moment().unix(),
    exp: expires.unix(),
    type,
  };
  return jwt.sign(payload, secret);
};

const generateAuthTokens = async (user) => {
  const accessTokenExpires = moment().add(60, 'minutes'); // 1 hour access
  const accessToken = generateToken(user.id, accessTokenExpires, 'access');

  return {
    access: {
      token: accessToken,
      expires: accessTokenExpires.toDate(),
    },
  };
};

export default {
  generateAuthTokens,
};
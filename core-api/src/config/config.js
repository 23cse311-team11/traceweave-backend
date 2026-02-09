import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or specific folder
dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 4000,
  jwt: {
    secret: process.env.JWT_SECRET || 'secret',
    accessExpirationMinutes: process.env.JWT_ACCESS_EXPIRATION_MINUTES || 60 * 24 * 30,
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  mongoose: {
    autoIndex: process.env.NODE_ENV !== 'production',
  },
};

import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.local" });
}

import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import httpStatus from "http-status";
import config from "./config/config.js";
import { errorConverter, errorHandler } from "./middlewares/error.js";
import ApiError from "./utils/ApiError.js";
import routes from "./routes/index.js";
import cookieParser from "cookie-parser";
import passport from "./config/passport.js";
import prisma from "./config/prisma.js";

const app = express();

// Global Middlewares
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(morgan('dev')); // Logger
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:3000', 
  credentials: true 
}));
app.use(passport.initialize());

// Routes (Placeholder)
app.get('/health', (req, res) => {
  res.status(200).send({ status: 'OK', service: 'Core API' });
});

app.use('/v1', routes);

// Test the error handler
app.get('/test-error', (req, res, next) => {
  // Simulate a 400 Bad Request
  next(new ApiError(httpStatus.BAD_REQUEST, 'This is a test error for OP-B01'));
});


// 404 Handler (for unknown routes)
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});


// Global Error Processing
app.use(errorConverter); // Convert non-ApiErrors to ApiErrors
app.use(errorHandler);   // Handle the response

// Server Start
let server;

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('PostgreSQL Connection has been established successfully.');

    server = app.listen(config.port, () => {
      console.log(`Core API running on port ${config.port} in ${config.env} mode`);
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
 }
};

startServer();

// Handle unexpected crashes
const exitHandler = () => {
  if (server) {
    server.close(() => {
      console.log('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  exitHandler();
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  exitHandler();
});
import express from 'express';
import { upload } from '../config/cloudinary.js';
import { uploadFile } from '../controllers/upload.controller.js';
import authenticateUser from '../middlewares/auth.middleware.js'; 

const router = express.Router();

/**
 * @route   POST /api/v1/upload
 * @desc    Upload a single image
 * @access  Private
 */
router.post(
  '/', 
  authenticateUser,      // 1. Check Auth
  upload.single('file'), // 2. Handle Upload (Key name must be 'file')
  uploadFile             // 3. Return Response
);

export default router;
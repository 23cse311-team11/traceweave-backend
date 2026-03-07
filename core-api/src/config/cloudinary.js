import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create Storage Engine
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'trace-weave-dev', // Root folder in Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'], // Restrict file types
    transformation: [{ width: 500, height: 500, crop: 'limit' }], // Optimization
  },
});

// Initialize Multer
const upload = multer({ storage });

export { cloudinary, upload };
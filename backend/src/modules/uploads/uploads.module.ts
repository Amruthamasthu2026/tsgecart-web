import { Router } from 'express';
import multer from 'multer';
import { cloudinary, isCloudinaryConfigured } from '../../config/cloudinary.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';
import { BadRequestError } from '../../shared/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|avif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WEBP or AVIF images are allowed'));
  },
});

function uploadBuffer(buffer: Buffer, folder: string): Promise<{ secure_url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

export const uploadsRouter = Router();

uploadsRouter.post(
  '/',
  authenticate,
  requirePermission('products.manage'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!isCloudinaryConfigured) {
      throw new BadRequestError('Image uploads are not configured on this server');
    }
    if (!req.file) throw new BadRequestError('No image file provided (field name: image)');
    const folder = typeof req.query.folder === 'string' ? `tsgecart/${req.query.folder}` : 'tsgecart/misc';
    const result = await uploadBuffer(req.file.buffer, folder);
    sendSuccess(res, { url: result.secure_url, publicId: result.public_id }, 201);
  }),
);

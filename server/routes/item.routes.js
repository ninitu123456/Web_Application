import { Router } from 'express';
import multer from 'multer';
import { createMatchingController } from '../controllers/matching.controller.js';
import { HttpError } from '../utils/http-error.js';
import { createItemController } from '../controllers/item.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize-roles.js';
import { createClaimController } from '../controllers/claim.controller.js';

const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 0, parts: 6, fieldNameSize: 100 },
  fileFilter(request, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) return callback(new HttpError(400, 'Loại ảnh không hợp lệ'));
    callback(null, true);
  }
});
export function itemRoutes(authService, itemService, matchingService, claimService, uploadLimiter = (_req, _res, next) => next()) {
  const router = Router(), controller = createItemController(itemService);
  router.get('/', controller.list);
  router.get('/mine', authenticate(authService), authorizeRoles('USER', 'ADMIN'), controller.mine);
  if (matchingService) router.get('/:id/matches', authenticate(authService), authorizeRoles('USER', 'ADMIN'), createMatchingController(matchingService));
  if (claimService) {
    const claims = createClaimController(claimService);
    router.get('/:id/claims', authenticate(authService), authorizeRoles('USER', 'ADMIN'), claims.forItem);
    router.post('/:id/claims', authenticate(authService), authorizeRoles('USER', 'ADMIN'), claims.create);
  }
  router.get('/:id', controller.get);
  router.post('/', authenticate(authService), authorizeRoles('USER', 'ADMIN'), controller.create);
  router.patch('/:id', authenticate(authService), authorizeRoles('USER', 'ADMIN'), controller.update);
  router.patch('/:id/close', authenticate(authService), authorizeRoles('USER', 'ADMIN'), controller.close);
  router.post('/:id/images', authenticate(authService), authorizeRoles('USER', 'ADMIN'), uploadLimiter, (req, res, next) => {
    upload.array('images', 5)(req, res, (error) => {
      // Busboy emits ordinary Errors for malformed multipart framing.
      if (error && ['Multipart: Boundary not found', 'Unexpected end of form', 'Unexpected end of file', 'Malformed part header'].includes(error.message)) {
        return next(new HttpError(400, 'Dữ liệu multipart không hợp lệ'));
      }
      next(error);
    });
  }, controller.uploadImages);
  router.delete('/:id/images/:imageId', authenticate(authService), authorizeRoles('USER', 'ADMIN'), controller.deleteImage);
  return router;
}

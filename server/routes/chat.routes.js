import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
export function chatRoutes(auth, service) {
  const router = Router();
  router.use(authenticate(auth));
  const ok = (res, data) => res.json({ success: true, message: 'Thành công', data });
  router.get('/unread-count', async (req, res) => ok(res, await service.unread(req.user)));
  router.get('/', async (req, res) => ok(res, await service.list(req.user, req.query)));
  router.post('/', async (req, res) => { res.status(201); ok(res, await service.create(req.user, req.body)); });
  router.get('/:id/messages', async (req, res) => ok(res, await service.history(req.user, req.params.id, req.query)));
  router.post('/:id/messages', async (req, res) => { res.status(201); ok(res, await service.send(req.user, req.params.id, req.body)); });
  router.post('/:id/read', async (req, res) => { await service.read(req.user, req.params.id, req.body); ok(res, null); });
  return router;
}

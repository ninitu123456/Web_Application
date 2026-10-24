export function createHealthController(service) {
  return async (request, response) => {
    response.set('Cache-Control', 'no-store');
    const data = await service.check();
    response.status(200).json({ success: true, message: 'Hệ thống hoạt động bình thường', data });
  };
}

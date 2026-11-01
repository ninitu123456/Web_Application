import { adminEmptyQuery, adminId, adminUserQuery, adminItemQuery, createLookupInput, updateLookupInput, accountStatusInput, adminItemStatusInput } from '../validation/admin.validation.js';
const limits = { categories: 100, locations: 150 };
export function createAdminController(service) {
  return {
    async dashboard(req, res) { adminEmptyQuery(req.query); res.json({ success: true, data: await service.dashboard() }); },
    async listUsers(req, res) { res.json({ success: true, ...await service.listUsers(adminUserQuery(req.query)) }); },
    async getUser(req, res) { adminEmptyQuery(req.query); res.json({ success: true, data: await service.getUser(adminId(req.params.id)) }); },
    async setUserStatus(req, res) { adminEmptyQuery(req.query); res.json({ success: true, data: await service.setUserStatus(req.user, adminId(req.params.id), accountStatusInput(req.body).status) }); },
    async listItems(req, res) { res.json({ success: true, ...await service.listItems(adminItemQuery(req.query)) }); },
    async getItem(req, res) { adminEmptyQuery(req.query); res.json({ success: true, data: await service.getItem(adminId(req.params.id)) }); },
    async setItemStatus(req, res) { adminEmptyQuery(req.query); adminItemStatusInput(req.body); res.json({ success: true, data: await service.closeItem(req.user, adminId(req.params.id)) }); },
    listLookup(kind) { return async (req, res) => { adminEmptyQuery(req.query); res.json({ success: true, data: await service.listLookup(kind) }); }; },
    createLookup(kind) { return async (req, res) => { adminEmptyQuery(req.query); res.status(201).json({ success: true, data: await service.createLookup(req.user, kind, createLookupInput(req.body, limits[kind])) }); }; },
    updateLookup(kind) { return async (req, res) => { adminEmptyQuery(req.query); res.json({ success: true, data: await service.updateLookup(req.user, kind, adminId(req.params.id), updateLookupInput(req.body, limits[kind])) }); }; },
    deleteLookup(kind) { return async (req, res) => { adminEmptyQuery(req.query); res.json({ success: true, data: await service.updateLookup(req.user, kind, adminId(req.params.id), {}, true) }); }; }
  };
}

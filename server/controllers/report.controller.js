import { workflowId, pagination, reportQuery, createReportInput, updateReportInput } from '../validation/workflow.validation.js';

export function createReportController(service) {
  return {
    async create(req, res) { res.status(201).json({ success: true, data: await service.create(req.user, createReportInput(req.body)) }); },
    async mine(req, res) { res.json({ success: true, ...await service.mine(req.user, pagination(req.query)) }); },
    async list(req, res) { res.json({ success: true, ...await service.list(req.user, reportQuery(req.query)) }); },
    async update(req, res) { res.json({ success: true, data: await service.update(req.user, workflowId(req.params.id), updateReportInput(req.body)) }); }
  };
}

import { HttpError } from '../utils/http-error.js';
import { adminUserDto, dashboardNumber, lookupDto } from '../utils/admin-dto.js';
import { paged } from '../utils/workflow-dto.js';
import { createAdminModerationService } from './admin-moderation.service.js';
const missing = (thing) => new HttpError(404, `${thing} không tìm thấy`);
function translateDuplicate(error) { if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Tên đã tồn tại'); throw error; }
// Twelve calendar months ending this month (UTC), zero-filled.
export function lastTwelveMonths(rows, now = new Date()) {
  const months = [];
  for (let offset = 11; offset >= 0; offset--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const key = date.toISOString().slice(0, 7), row = rows.find((entry) => entry.month === key);
    months.push({ month: key, lost: dashboardNumber(row?.lost), found: dashboardNumber(row?.found) });
  }
  return months;
}
export function createAdminService(repository, itemService) {
  return {
    ...createAdminModerationService(repository.moderation),
    async queue() {
      const row = await repository.queue();
      return { reports: dashboardNumber(row.reports), disputes: dashboardNumber(row.disputes), contacts: dashboardNumber(row.contacts) };
    },
    async dashboard() {
      const value = await repository.dashboard();
      const countMap = (rows, statuses) => Object.fromEntries(statuses.map((status) => [status, dashboardNumber(rows.find((row) => row.status === status)?.total)]));
      return { users: { total: dashboardNumber(value.users.total), active: dashboardNumber(value.users.active), suspended: dashboardNumber(value.users.suspended) },
        items: { total: dashboardNumber(value.items.total), lost: dashboardNumber(value.items.lost), found: dashboardNumber(value.items.found), returned: dashboardNumber(value.items.returned), byStatus: countMap(value.itemStatuses, ['OPEN', 'CLAIM_PENDING', 'CLAIMED', 'RETURNED', 'CLOSED']) },
        claims: { total: dashboardNumber(value.claims), byStatus: countMap(value.claimStatuses, ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED']) }, matches: { total: dashboardNumber(value.matches) },
        reports: { total: dashboardNumber(value.reports), byStatus: countMap(value.reportStatuses, ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED']) },
        categories: value.categories.map((row) => ({ id: dashboardNumber(row.id), name: row.name, count: dashboardNumber(row.total) })),
        recentActivity: value.recentActivity.map((row) => ({ date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10), count: dashboardNumber(row.total) })),
        monthlyItems: lastTwelveMonths(value.monthly ?? []),
        growth: { newUsers30: dashboardNumber(value.growth?.users_30), newItems30: dashboardNumber(value.growth?.items_30), newItemsPrevious30: dashboardNumber(value.growth?.items_prev_30), returned30: dashboardNumber(value.growth?.returned_30) },
        queue: { reports: dashboardNumber(value.queue?.reports), overdueReports: dashboardNumber(value.queue?.reports_overdue), disputes: dashboardNumber(value.queue?.disputes), contacts: dashboardNumber(value.queue?.contacts) },
        recentLogs: (value.recentLogs ?? []).map((row) => ({ id: dashboardNumber(row.log_id), action: row.action, entityType: row.entity_type, entityId: row.entity_id == null ? null : dashboardNumber(row.entity_id), actorName: row.actor_name ?? null, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at })) };
    },
    async listUsers(options) { const { rows, total } = await repository.listUsers(options); return paged(rows, total, options, adminUserDto); },
    async getUser(id) { const row = await repository.findUser(id); if (!row) throw missing('Người dùng'); return adminUserDto(row); },
    async setUserStatus(identity, id, status) { const row = await repository.setUserStatus(identity.id, id, status); if (!row) throw missing('Người dùng'); if (row.lastAdmin) throw new HttpError(409, 'Hệ thống phải duy trì ít nhất một ADMIN đang hoạt động'); if (row.actorForbidden) throw new HttpError(403, 'Quyền quản trị không còn hiệu lực'); if (row.selfChange) throw new HttpError(409, 'Không thể tự thay đổi trạng thái tài khoản'); return adminUserDto(row); },
    async listItems(options) { return itemService.list(options, undefined, { includeHidden: true }); },
    async getItem(id) { return itemService.get(id, undefined, { includeHidden: true }); },
    async closeItem(identity, id) { return itemService.close(identity, id); },
    async listLookup(kind) { return (await repository.listLookup(kind)).map((row) => lookupDto(row, kind === 'categories' ? 'category_id' : 'location_id')); },
    async createLookup(identity, kind, input) { try { return lookupDto(await repository.createLookup(identity.id, kind, input), kind === 'categories' ? 'category_id' : 'location_id'); } catch (error) { return translateDuplicate(error); } },
    async updateLookup(identity, kind, id, input, deactivate = false) { try { const row = await repository.updateLookup(identity.id, kind, id, input, deactivate); if (!row) throw missing(kind === 'categories' ? 'Danh mục' : 'Địa điểm'); return lookupDto(row, kind === 'categories' ? 'category_id' : 'location_id'); } catch (error) { return translateDuplicate(error); } }
  };
}


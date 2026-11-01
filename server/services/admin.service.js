import { HttpError } from '../utils/http-error.js';
import { adminUserDto, dashboardNumber, lookupDto } from '../utils/admin-dto.js';
import { paged } from '../utils/workflow-dto.js';
const missing = (thing) => new HttpError(404, `${thing} không tìm thấy`);
function translateDuplicate(error) { if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Tên đã tồn tại'); throw error; }
export function createAdminService(repository, itemService) {
  return {
    async dashboard() {
      const value = await repository.dashboard();
      const countMap = (rows, statuses) => Object.fromEntries(statuses.map((status) => [status, dashboardNumber(rows.find((row) => row.status === status)?.total)]));
      return { users: { total: dashboardNumber(value.users.total), active: dashboardNumber(value.users.active), suspended: dashboardNumber(value.users.suspended) },
        items: { total: dashboardNumber(value.items.total), lost: dashboardNumber(value.items.lost), found: dashboardNumber(value.items.found), returned: dashboardNumber(value.items.returned), byStatus: countMap(value.itemStatuses, ['OPEN', 'CLAIM_PENDING', 'CLAIMED', 'RETURNED', 'CLOSED']) },
        claims: { total: dashboardNumber(value.claims), byStatus: countMap(value.claimStatuses, ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED']) }, matches: { total: dashboardNumber(value.matches) },
        reports: { total: dashboardNumber(value.reports), byStatus: countMap(value.reportStatuses, ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED']) },
        categories: value.categories.map((row) => ({ id: dashboardNumber(row.id), name: row.name, count: dashboardNumber(row.total) })),
        recentActivity: value.recentActivity.map((row) => ({ date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10), count: dashboardNumber(row.total) })) };
    },
    async listUsers(options) { const { rows, total } = await repository.listUsers(options); return paged(rows, total, options, adminUserDto); },
    async getUser(id) { const row = await repository.findUser(id); if (!row) throw missing('Người dùng'); return adminUserDto(row); },
    async setUserStatus(identity, id, status) { const row = await repository.setUserStatus(identity.id, id, status); if (!row) throw missing('Người dùng'); if (row.selfChange) throw new HttpError(409, 'Không thể tự thay đổi trạng thái tài khoản'); return adminUserDto(row); },
    async listItems(options) { return itemService.list(options); },
    async getItem(id) { return itemService.get(id); },
    async closeItem(identity, id) { return itemService.close(identity, id); },
    async listLookup(kind) { return (await repository.listLookup(kind)).map((row) => lookupDto(row, kind === 'categories' ? 'category_id' : 'location_id')); },
    async createLookup(identity, kind, input) { try { return lookupDto(await repository.createLookup(identity.id, kind, input), kind === 'categories' ? 'category_id' : 'location_id'); } catch (error) { return translateDuplicate(error); } },
    async updateLookup(identity, kind, id, input, deactivate = false) { try { const row = await repository.updateLookup(identity.id, kind, id, input, deactivate); if (!row) throw missing(kind === 'categories' ? 'Danh mục' : 'Địa điểm'); return lookupDto(row, kind === 'categories' ? 'category_id' : 'location_id'); } catch (error) { return translateDuplicate(error); } }
  };
}


import bcrypt from 'bcryptjs';
import { HttpError } from '../utils/http-error.js';
import { userDto } from '../utils/user-dto.js';
import { unauthorized } from '../utils/jwt.js';

const duplicateEmail = () => new HttpError(409, 'Địa chỉ email đã tồn tại trong hệ thống');
const invalidCredentials = () => new HttpError(401, 'Thông tin đăng nhập không hợp lệ');
export function createAuthService(repository, tokens) {
  return {
    async register({ fullName, email, password }) {
      if (await repository.findByEmail(email)) throw duplicateEmail();
      const role = await repository.findUserRole();
      if (!role) throw new Error('Required USER role is missing');
      const passwordHash = await bcrypt.hash(password, 12);
      let user;
      try { user = await repository.create({ roleId: role.role_id, fullName, email, passwordHash }); }
      catch (error) {
        if (error.code === 'ER_DUP_ENTRY' && /uq_users_email/.test(error.sqlMessage ?? '')) throw duplicateEmail();
        throw error;
      }
      return userDto(user);
    },
    async login({ email, password }) {
      const user = await repository.findByEmail(email);
      if (!user || !await bcrypt.compare(password, user.password_hash) || user.account_status !== 'ACTIVE') throw invalidCredentials();
      const dto = userDto(user);
      return { token: tokens.sign(user.user_id), user: dto };
    },
    async authenticate(token) {
      const id = tokens.verify(token);
      // Deliberately outside JWT error handling: DB failures are not 401s.
      const user = await repository.findById(id);
      if (!user) throw unauthorized();
      if (user.account_status !== 'ACTIVE' || !['USER', 'ADMIN'].includes(user.role)) {
        throw new HttpError(403, 'Tài khoản không được phép truy cập');
      }
      return { id: String(user.user_id), role: user.role, profile: userDto(user) };
    }
  };
}

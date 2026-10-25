import { HttpError } from '../utils/http-error.js';
import { userDto } from '../utils/user-dto.js';

export function createUserService(repository) {
  return {
    getMe(identity) { return identity.profile; },
    async updateMe(identity, { fullName }) {
      if (!await repository.updateFullName(identity.id, fullName)) throw new HttpError(404, 'Không tìm thấy tài khoản');
      const user = await repository.findById(identity.id);
      if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản');
      return userDto(user);
    }
  };
}

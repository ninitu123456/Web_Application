export function userDto(user) {
  const id = Number(user.user_id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('User ID cannot be represented safely in the API');
  return { id, fullName: user.full_name, email: user.email, role: user.role };
}

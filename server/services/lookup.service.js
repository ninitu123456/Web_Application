import { apiId } from '../utils/workflow-dto.js';

export function createLookupService(repository) {
  const dto = (row) => ({ id: apiId(row.id), name: row.name });
  return {
    async categories() { return (await repository.categories()).map(dto); },
    async locations() { return (await repository.locations()).map(dto); }
  };
}

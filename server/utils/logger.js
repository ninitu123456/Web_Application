export function logError(event, error) {
  const candidate = error.cause?.code ?? error.code ?? 'INTERNAL_ERROR';
  const code = /^[A-Z0-9_]+$/.test(candidate) ? candidate : 'INTERNAL_ERROR';
  // Never serialize the driver error: it may contain SQL, credentials or data.
  console.error(JSON.stringify({ event, code }));
  if (code === 'INVALID_CONFIG') console.error(error.message);
}

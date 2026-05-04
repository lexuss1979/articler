export function registrationOpen(): boolean {
  const v = process.env.ALLOW_REGISTRATION;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

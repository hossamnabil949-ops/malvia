import { ApiError, findLicense, sendError } from '../_security.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'method not allowed' });
  try {
    const key = String(req.headers['x-license-key'] || req.body?.licenseKey || '').trim();
    if (!key) throw new ApiError('LICENSE_REQUIRED');
    const license = await findLicense(key);
    if (!license) throw new ApiError('LICENSE_INVALID');
    if (license.status === 'معلق مؤقتاً') throw new ApiError('LICENSE_SUSPENDED');
    return res.status(200).json({ tenant: license });
  } catch (e) { return sendError(res, e); }
}

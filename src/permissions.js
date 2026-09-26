import { getPermission, openPermissionDialog, requestPermission } from '@apps-in-toss/web-framework';
import { insideToss } from './api';

function need(name) {
  return { name, access: 'access' };
}

export async function ensureTossMediaPermission(name) {
  if (!insideToss()) return 'allowed';
  const permission = need(name);
  try {
    if (typeof requestPermission === 'function') {
      const status = await requestPermission(permission);
      if (status === 'allowed' || status === 'denied') return status;
    }
    if (typeof getPermission === 'function') {
      const status = await getPermission(permission);
      if (status === 'allowed' || status === 'denied') return status;
    }
    if (typeof openPermissionDialog === 'function') return await openPermissionDialog(permission);
    return 'allowed';
  } catch {
    return 'allowed';
  }
}

export async function retryTossMediaPermission(name) {
  if (!insideToss()) return 'allowed';
  try {
    if (typeof openPermissionDialog === 'function') return await openPermissionDialog(need(name));
    return ensureTossMediaPermission(name);
  } catch {
    return 'denied';
  }
}

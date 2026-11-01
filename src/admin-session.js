export const ADMIN_SESSION_MS = 30 * 60 * 1000;
export function adminSessionExpiresAt(token,now=Date.now()) {
 try {
  const parts=token.split('.');if(parts.length!==3)return 0;
  const claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(!Number.isFinite(claims.iat)||!Number.isFinite(claims.exp)||claims.iat*1000>now+60000)return 0;
  const methods=Array.isArray(claims.amr)?claims.amr.map(x=>x.timestamp).filter(Number.isFinite):[];
  const authenticatedAt=(methods.length?Math.max(...methods):claims.iat)*1000;
  if(authenticatedAt>now+60000)return 0;
  return Math.min(claims.exp*1000,authenticatedAt+ADMIN_SESSION_MS);
 }catch{return 0;}
}

// Server only: never import this module into a client component.
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { runtimeEnv } from './runtime-env.ts';
export type TokenSet = { access_token:string; refresh_token:string; expires_at:number; session_id?:string };
export const SESSION_COOKIE='lf_mendeley_session',STATE_COOKIE='lf_mendeley_state';
export function config(){
 const env=runtimeEnv();const clientId=env.MENDELEY_CLIENT_ID,clientSecret=env.MENDELEY_CLIENT_SECRET,redirectUri=env.MENDELEY_REDIRECT_URI,secret=env.SESSION_SECRET;
 if(typeof clientId!=='string'||typeof clientSecret!=='string'||typeof redirectUri!=='string'||typeof secret!=='string')throw new Error('Mendeley requiere configuración de servidor.');
 if(!clientId||!clientSecret||!redirectUri||!secret||!/^[a-f\d]{64}$/i.test(secret))throw new Error('Mendeley requiere configuración de servidor.');
 const url=new URL(redirectUri);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('La redirección OAuth requiere HTTPS.');
 return {clientId,clientSecret,redirectUri,key:Buffer.from(secret,'hex'),origin:url.origin,secure:url.protocol==='https:'};
}
export function newState(){return randomBytes(32).toString('hex');}
export function validState(actual:string|null,expected:string|undefined){return !!actual&&!!expected&&/^[a-f\d]{64}$/.test(actual)&&/^[a-f\d]{64}$/.test(expected)&&timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
export function authorizationUrl(state:string){const c=config();const url=new URL('https://api.mendeley.com/oauth/authorize');url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:'all',state}).toString();return url.toString();}
async function tokenRequest(parameters:Record<string,string>):Promise<TokenSet>{
 const c=config();const response=await fetch('https://api.mendeley.com/oauth/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...parameters,redirect_uri:c.redirectUri}),cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`OAuth no completado (${response.status}).`);
 const raw:unknown=await response.json();if(!raw||typeof raw!=='object')throw new Error('Respuesta OAuth inválida.');
 const t=raw as Record<string,unknown>;if(typeof t.access_token!=='string'||typeof t.expires_in!=='number'||!Number.isFinite(t.expires_in)||t.expires_in<=0)throw new Error('Respuesta OAuth inválida.');
 const refresh=t.refresh_token||parameters.refresh_token;if(typeof refresh!=='string')throw new Error('Falta el token de renovación.');
 return {access_token:t.access_token,refresh_token:refresh,expires_at:Date.now()+t.expires_in*1000};
}
export const exchangeCode=(code:string)=>tokenRequest({grant_type:'authorization_code',code});
export const refreshTokens=(refresh_token:string)=>tokenRequest({grant_type:'refresh_token',refresh_token});
export function seal(tokens:TokenSet){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',config().key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(tokens),'utf8'),cipher.final()]);const value=Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');if(value.length>3600)throw new Error('La sesión necesita almacenamiento de servidor.');return value;}
export function unseal(value:string):TokenSet|null{try{const bytes=Buffer.from(value,'base64url');const decipher=createDecipheriv('aes-256-gcm',config().key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));const data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));return typeof data.access_token==='string'&&typeof data.refresh_token==='string'&&Number.isFinite(data.expires_at)?data:null;}catch{return null;}}

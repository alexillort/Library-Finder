import { NextRequest,NextResponse } from 'next/server';
import { config,seal,unseal,refreshTokens,newState,SESSION_COOKIE,type TokenSet } from './oauth';
import { MendeleyError } from './client';
export class SessionError extends Error{status:number;constructor(message:string,status=401){super(message);this.status=status;}}
export const cookieOptions=()=>({httpOnly:true,secure:config().secure,sameSite:'lax' as const,path:'/',maxAge:7*24*60*60});
export function sameOrigin(request:NextRequest){if(request.headers.get('origin')!==config().origin)throw new SessionError('Origen no permitido.',403);}
export async function session(request:NextRequest){
 const value=request.cookies.get(SESSION_COOKIE)?.value;let tokens=value?unseal(value):null;
 if(!tokens)throw new SessionError('Conecta Mendeley para acceder a tu biblioteca.');
 if(tokens.expires_at<=Date.now()+60000){try{tokens={...await refreshTokens(tokens.refresh_token),session_id:tokens.session_id??newState()};}catch{throw new SessionError('La sesión expiró. Vuelve a conectar Mendeley.');}}
 if(!tokens.session_id)tokens={...tokens,session_id:newState()};return tokens;
}
export function finish(response:NextResponse,tokens?:TokenSet){response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');if(tokens)response.cookies.set(SESSION_COOKIE,seal(tokens),cookieOptions());return response;}
export function errorResponse(error:unknown,tokens?:TokenSet){
 let status=400,message=error instanceof Error?error.message:'No se pudo completar la operación.';
 if(error instanceof SessionError)status=error.status;
 else if(error instanceof MendeleyError){status=error.status===401?401:error.status===429?429:502;message=error.status===401?'Mendeley rechazó la sesión. Vuelve a conectar.':error.status===429?'Mendeley está limitando las solicitudes. Espera un momento y pulsa Actualizar.':`Mendeley no completó la operación (${error.status}). Recarga para comprobar el estado.`;}
 else if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)){status=504;message='Mendeley tardó demasiado. Recarga antes de reintentar.';}
 const response=finish(NextResponse.json({error:message},{status}),tokens);if(status===401)response.cookies.delete(SESSION_COOKIE);if(error instanceof MendeleyError&&error.retryAfter)response.headers.set('Retry-After',error.retryAfter);return response;
}

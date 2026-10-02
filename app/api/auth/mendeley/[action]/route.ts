// Template installed as app/api/auth/mendeley/[action]/route.ts.
import { NextRequest,NextResponse } from 'next/server';
import { authorizationUrl,config,exchangeCode,newState,validState,seal,unseal,refreshTokens,SESSION_COOKIE,STATE_COOKIE } from '@/integrations/mendeley/oauth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const cookieOptions=()=>({httpOnly:true,secure:config().secure,sameSite:'lax' as const,path:'/'});
export async function GET(request:NextRequest,context:{params:Promise<{action:string}>}){
 const {action}=await context.params;
 try{
  if(action==='start'){const state=newState();const response=NextResponse.redirect(authorizationUrl(state));response.cookies.set(STATE_COOKIE,state,{...cookieOptions(),maxAge:600});response.headers.set('Cache-Control','no-store');return response;}
  if(action==='callback'){
   const params=request.nextUrl.searchParams;
   if(params.has('error')||!validState(params.get('state'),request.cookies.get(STATE_COOKIE)?.value)||!params.get('code')){const response=NextResponse.json({error:'Autorización cancelada o state inválido.'},{status:400});response.cookies.delete(STATE_COOKIE);return response;}
   const tokens=await exchangeCode(params.get('code')!);const response=NextResponse.redirect(`${config().origin}/?mendeley=authorized`);response.cookies.delete(STATE_COOKIE);response.cookies.set(SESSION_COOKIE,seal(tokens),{...cookieOptions(),maxAge:60*60*24*7});response.headers.set('Cache-Control','no-store');return response;
  }
  if(action==='status'){const value=request.cookies.get(SESSION_COOKIE)?.value;const tokens=value?unseal(value):null;return NextResponse.json({authorized:!!tokens,expired:tokens?tokens.expires_at<=Date.now():true,mode:'demo'},{headers:{'Cache-Control':'no-store'}});}
  return NextResponse.json({error:'Ruta desconocida.'},{status:404});
 }catch{const response=NextResponse.json({error:'No se pudo completar OAuth. Revisa la configuración del servidor y vuelve a conectar.'},{status:503,headers:{'Cache-Control':'no-store'}});response.cookies.delete(STATE_COOKIE);return response;}
}
export async function POST(request:NextRequest,context:{params:Promise<{action:string}>}){
 try{
  if(request.headers.get('origin')!==config().origin)return NextResponse.json({error:'Origen no permitido.'},{status:403});
  const {action}=await context.params;
  if(action==='disconnect'){const r=NextResponse.json({authorized:false});r.cookies.delete(SESSION_COOKIE);r.cookies.delete(STATE_COOKIE);return r;}
  if(action==='refresh'){const value=request.cookies.get(SESSION_COOKIE)?.value;const session=value?unseal(value):null;if(!session)return NextResponse.json({error:'Sin sesión.'},{status:401});const next=await refreshTokens(session.refresh_token);const r=NextResponse.json({authorized:true},{headers:{'Cache-Control':'no-store'}});r.cookies.set(SESSION_COOKIE,seal(next),{...cookieOptions(),maxAge:60*60*24*7});return r;}
  return NextResponse.json({error:'Ruta desconocida.'},{status:404});
 }catch{return NextResponse.json({error:'Renovación no disponible; vuelve a conectar.'},{status:503});}
}

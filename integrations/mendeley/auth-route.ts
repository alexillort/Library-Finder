// OAuth routes shared by local Next.js and the hosted Worker.
import { NextRequest,NextResponse } from 'next/server';
import { authorizationUrl,config,exchangeCode,newState,validState,seal,unseal,refreshTokens,SESSION_COOKIE,STATE_COOKIE } from '@/integrations/mendeley/oauth';
import { runtimeEnv } from './runtime-env';
import { cookieOptions,sameOrigin,finish,errorResponse,session } from './session';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,context:{params:Promise<{action:string}>}){
 const {action}=await context.params;
 try{
  if(action==='start'){const state=newState();const response=NextResponse.redirect(authorizationUrl(state));response.cookies.set(STATE_COOKIE,state,{...cookieOptions(),maxAge:600});response.headers.set('Cache-Control','no-store');return response;}
  if(action==='callback'){
   const params=request.nextUrl.searchParams;
   if(params.has('error')||!validState(params.get('state'),request.cookies.get(STATE_COOKIE)?.value)||!params.get('code')){const response=NextResponse.json({error:'Autorización cancelada o state inválido.'},{status:400});response.cookies.delete(STATE_COOKIE);return response;}
   const tokens={...await exchangeCode(params.get('code')!),session_id:newState()};const response=NextResponse.redirect(`${config().origin}/?mendeley=authorized`);response.cookies.delete(STATE_COOKIE);return finish(response,tokens);
  }
  if(action==='status'){const env=runtimeEnv();const missing=['MENDELEY_CLIENT_ID','MENDELEY_CLIENT_SECRET','MENDELEY_REDIRECT_URI','SESSION_SECRET'].filter(key=>!env[key]);let configured=false;try{config();configured=true;}catch{}const value=request.cookies.get(SESSION_COOKIE)?.value;const tokens=configured&&value?unseal(value):null;return finish(NextResponse.json({configured,authorized:!!tokens,missing,redirectUri:typeof env.MENDELEY_REDIRECT_URI==='string'?env.MENDELEY_REDIRECT_URI:null}));}
  return NextResponse.json({error:'Ruta desconocida.'},{status:404});
 }catch{const response=NextResponse.json({error:'No se pudo completar OAuth. Revisa la configuración del servidor y vuelve a conectar.'},{status:503,headers:{'Cache-Control':'no-store'}});response.cookies.delete(STATE_COOKIE);return response;}
}
export async function POST(request:NextRequest,context:{params:Promise<{action:string}>}){
 try{
  sameOrigin(request);
  const {action}=await context.params;
  if(action==='disconnect'){const r=NextResponse.json({authorized:false});r.cookies.delete(SESSION_COOKIE);r.cookies.delete(STATE_COOKIE);return r;}
  if(action==='refresh'){const current=await session(request);const next={...await refreshTokens(current.refresh_token),session_id:current.session_id};return finish(NextResponse.json({authorized:true}),next);}
  return NextResponse.json({error:'Ruta desconocida.'},{status:404});
 }catch(error){return errorResponse(error);}
}

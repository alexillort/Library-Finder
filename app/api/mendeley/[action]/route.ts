import { NextRequest,NextResponse } from 'next/server';
import { MendeleyClient } from '@/integrations/mendeley/client';
import { loadLibrary,mutateLibrary,undoLibrary } from '@/integrations/mendeley/library';
import { parseCommand } from '@/integrations/mendeley/validation';
import { session,sameOrigin,finish,errorResponse } from '@/integrations/mendeley/session';
import type { TokenSet } from '@/integrations/mendeley/oauth';
import { validatePdf } from '@/lib/pdf';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{action:string}>};
async function boundedBody(request:NextRequest,limit:number){const chunks:Uint8Array[]=[];let size=0;if(!request.body)throw new Error('Solicitud vacía.');const reader=request.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('La carga conjunta supera 28 MB. Sube los PDFs en cargas más pequeñas.');chunks.push(value);}}finally{await reader.cancel();}return new Blob(chunks as BlobPart[]);}
export async function GET(request:NextRequest,context:Context){let tokens:TokenSet|undefined;try{
 tokens=await session(request);const api=new MendeleyClient(tokens.access_token),{action}=await context.params;
 if(action==='library')return finish(NextResponse.json(await loadLibrary(api)),tokens);
 if(action==='file'){const id=request.nextUrl.searchParams.get('id');if(!id||id.length>160)throw new Error('Identificador de archivo inválido.');const blob=await api.downloadFile(id);return finish(new NextResponse(blob,{headers:{'Content-Type':'application/pdf','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="document.pdf"'}}),tokens);}
 return finish(NextResponse.json({error:'Ruta desconocida.'},{status:404}),tokens);
 }catch(error){return errorResponse(error,tokens);}}
export async function POST(request:NextRequest,context:Context){let tokens:TokenSet|undefined;try{
 sameOrigin(request);tokens=await session(request);const api=new MendeleyClient(tokens.access_token),{action}=await context.params;let data:Record<string,unknown>,blobs=new Map<string,File>();
 const multipart=request.headers.get('content-type')?.startsWith('multipart/form-data');const body=await boundedBody(request,multipart?28*1024*1024:200000);
 if(multipart){const form=await new Response(body,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();data=JSON.parse(String(form.get('operation')));for(const [key,value] of form){if(value instanceof File){await validatePdf(value);blobs.set(key,value);}}}else data=JSON.parse(await body.text());
 const expected=data.expectedRevision;if(typeof expected!=='number'||!Number.isSafeInteger(expected))throw new Error('Revisión de biblioteca inválida.');
 if(action==='commands'){const command=parseCommand(data.command);return finish(NextResponse.json(await mutateLibrary(api,tokens.session_id!,command,expected,blobs)),tokens);}
 if(action==='undo'){if(typeof data.ticket!=='string')throw new Error('Falta la operación para Deshacer.');return finish(NextResponse.json(await undoLibrary(api,tokens.session_id!,data.ticket,expected,blobs.get('backup'))),tokens);}
 return finish(NextResponse.json({error:'Ruta desconocida.'},{status:404}),tokens);
 }catch(error){return errorResponse(error,tokens);}}

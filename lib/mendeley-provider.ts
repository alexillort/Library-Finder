import type { Command,Library } from './domain';
import type { BlobWrite,LibraryProvider } from './provider';
export type ConnectionStatus={configured:boolean;authorized:boolean;missing:string[];redirectUri:string|null};
async function responseJson<T>(response:Response):Promise<T>{const data=await response.json().catch(()=>null) as {error?:string}|null;if(!response.ok)throw new Error(data?.error||'No se pudo contactar con el servidor.');return data as T;}
export async function connectionStatus():Promise<ConnectionStatus>{return responseJson(await fetch('/api/auth/mendeley/status',{cache:'no-store'}));}
export async function disconnectMendeley(){await responseJson(await fetch('/api/auth/mendeley/disconnect',{method:'POST'}));}
function payload(operation:unknown,files:BlobWrite[]=[],backup?:File){if(!files.length&&!backup)return {headers:{'Content-Type':'application/json'},body:JSON.stringify(operation)};const form=new FormData();form.set('operation',JSON.stringify(operation));for(const file of files)form.set(file.key,file.blob,file.blob instanceof File?file.blob.name:'upload.pdf');if(backup)form.set('backup',backup,backup.name);return {body:form};}
class MendeleyProvider implements LibraryProvider{
 private library:Library|null=null;
 private undoStack:{ticket:string;backup?:File}[]=[];
 private idMap:Record<string,string>={};
 resolveId(id:string){return this.idMap[id]||id;}
 async load(){const library=await responseJson<Library>(await fetch('/api/mendeley/library',{cache:'no-store'}));this.library=library;this.undoStack=[];return library;}
 async execute(command:Command,expectedRevision:number,files:BlobWrite[]=[]){
  if(files.reduce((n,f)=>n+f.blob.size,0)>28*1024*1024-200000)throw new Error('La carga conjunta supera 28 MB. Sube los PDFs en cargas más pequeñas.');
  let backup:File|undefined;if(command.type==='replace'){const p=this.library?.papers.find(p=>p.id===command.id);if(p?.pdf){if(p.pdf.size>25*1024*1024)throw new Error('El PDF anterior supera 25 MB. Este MVP no puede conservar una copia para Deshacer el reemplazo.');const blob=await this.getPdf(p.pdf.key);backup=new File([blob],p.pdf.name,{type:'application/pdf'});}}
  const result=await responseJson<{library:Library;undo:string;idMap:Record<string,string>}>(await fetch('/api/mendeley/commands',{method:'POST',...payload({command,expectedRevision},files)}));
  this.idMap=result.idMap;this.library=result.library;this.undoStack=[...this.undoStack.slice(-19),{ticket:result.undo,backup}];return result.library;
 }
 async restore(_snapshot:Library,expectedRevision:number){const last=this.undoStack.at(-1);if(!last)throw new Error('El historial de Deshacer ya no está disponible.');const library=await responseJson<Library>(await fetch('/api/mendeley/undo',{method:'POST',...payload({ticket:last.ticket,expectedRevision},[],last.backup)}));this.undoStack.pop();this.library=library;return library;}
 async getPdf(key:string):Promise<Blob>{const response=await fetch(`/api/mendeley/file?id=${encodeURIComponent(key)}`,{cache:'no-store'});if(!response.ok)await responseJson(response);return response.blob();}
 clear(){this.library=null;this.undoStack=[];this.idMap={};}
}
export const mendeleyProvider=new MendeleyProvider();

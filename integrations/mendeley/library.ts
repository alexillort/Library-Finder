import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { applyCommand,type Command,type Library,type Metadata,type Paper } from '../../lib/domain.ts';
import { MendeleyClient,type ApiDocument } from './client.ts';
import { config } from './oauth.ts';

export async function mapLimit<T,R>(items:T[],limit:number,run:(item:T)=>Promise<R>):Promise<R[]>{const out:R[]=new Array(items.length);let index=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;out[i]=await run(items[i]);}}));return out;}
export async function loadLibrary(api:MendeleyClient):Promise<Library>{
 const [folders,documents,files,trash]=await Promise.all([api.folders(),api.documents(),api.files(),api.trash()]);
 const memberships=await mapLimit(folders,4,f=>api.memberships(f.id));const relations=new Map<string,Set<string>>();
 folders.forEach((f,i)=>memberships[i].forEach(p=>{if(!relations.has(p.id))relations.set(p.id,new Set());relations.get(p.id)!.add(f.id);}));
 const trashed=new Set(trash.map(p=>p.id));const unique=new Map([...documents,...trash].map(p=>[p.id,p]));
 const papers:Paper[]=[...unique.values()].map(p=>{const pdf=files.filter(f=>f.document_id===p.id&&f.mime_type==='application/pdf').sort((a,b)=>a.id.localeCompare(b.id))[0];return {id:p.id,title:p.title||'Sin título',authors:(p.authors||[]).map(a=>[a.first_name,a.last_name].filter(Boolean).join(' ')).join('; '),year:p.year?String(p.year):'',journal:p.source||'',doi:p.identifiers?.doi||'',abstract:p.abstract||'',tags:[...new Set(p.tags||[])].sort(),folderIds:[...(relations.get(p.id)||[])].sort(),pdf:pdf?{key:pdf.id,name:/\.pdf$/i.test(pdf.file_name)?pdf.file_name:`${pdf.file_name}.pdf`,size:pdf.size}:null,trashed:trashed.has(p.id),addedAt:p.created||''};}).sort((a,b)=>a.id.localeCompare(b.id));
 const lib:Library={version:1,revision:0,folders:folders.map(f=>({id:f.id,name:f.name,parentId:f.parent_id||null})).sort((a,b)=>a.id.localeCompare(b.id)),papers};
 lib.revision=Number.parseInt(createHash('sha256').update(JSON.stringify(lib)).digest('hex').slice(0,12),16);return lib;
}
type Inverse={type:'commands';commands:Command[]}|{type:'deleteFolder';id:string}|{type:'metadata';id:string;patch:Partial<ApiDocument>}|{type:'replace';id:string;newKey:string;oldName:string|null}|{type:'duplicates';keeperId:string;patch:Partial<ApiDocument>;addedLocations:string[];originals:{id:string;folderIds:string[]}[]};
type Guard={kind:'folder'|'locations'|'metadata'|'trash'|'pdf'|'papers';ids:string[];expected:string};
type Ticket={owner:string;expires:number;inverse:Inverse;guard:Guard};
function projection(lib:Library,guard:Pick<Guard,'kind'|'ids'>){return JSON.stringify(guard.ids.map(id=>{const p=lib.papers.find(p=>p.id===id);if(guard.kind==='folder')return lib.folders.find(f=>f.id===id);if(guard.kind==='locations')return p?.folderIds;if(guard.kind==='trash')return p?.trashed;if(guard.kind==='pdf')return p?.pdf;if(guard.kind==='metadata'&&p)return metadataOf(p);return p;}));}
const hashProjection=(value:string)=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
function originalMetadata(p:ApiDocument):Partial<ApiDocument>{return {title:p.title,authors:p.authors||[],year:p.year??null,source:p.source||'',abstract:p.abstract||'',tags:p.tags||[],identifiers:p.identifiers||{}} as Partial<ApiDocument>;}
async function restoreMetadata(api:MendeleyClient,id:string,patch:Partial<ApiDocument>){const current=await api.document(id);await api.editDocument(id,{...patch,identifiers:{...current.identifiers,doi:patch.identifiers?.doi||''}});}
export function metadataOf(p:Paper):Metadata{return {title:p.title,authors:p.authors,year:p.year,journal:p.journal,doi:p.doi,abstract:p.abstract,tags:p.tags};}
function signTicket(owner:string,inverse:Inverse,guard:Guard){const encoded=Buffer.from(JSON.stringify({owner,expires:Date.now()+2*60*60*1000,inverse,guard})).toString('base64url');const signature=createHmac('sha256',config().key).update(encoded).digest('base64url');return `${encoded}.${signature}`;}
function readTicket(value:string,owner:string):Ticket{try{if(value.length>150000)throw 0;const [encoded,signature]=value.split('.');const expected=createHmac('sha256',config().key).update(encoded).digest();const actual=Buffer.from(signature,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw 0;const t=JSON.parse(Buffer.from(encoded,'base64url').toString()) as Ticket;if(t.owner!==owner||t.expires<Date.now())throw 0;return t;}catch{throw new Error('El historial de Deshacer expiró o pertenece a otra sesión.');}}
export function requireRevision(lib:Library,expected:number){if(lib.revision!==expected)throw new Error('La biblioteca cambió en Mendeley o en otra pestaña. Se recargará antes de continuar.');}
async function runCommand(api:MendeleyClient,command:Command){switch(command.type){case 'editFolder':await api.editFolder(command.id,command.name,command.parentId);break;case 'add':await api.addToFolder(command.id,command.target);break;case 'remove':await api.removeFromFolder(command.id,command.source);break;case 'trash':await api.trashDocument(command.id);break;case 'restore':await api.restoreDocument(command.id);break;default:throw new Error('Acción inversa no compatible.');}}
export async function mutateLibrary(api:MendeleyClient,owner:string,command:Command,expected:number,blobs:Map<string,File>){
 const before=await loadLibrary(api);requireRevision(before,expected);const validated=applyCommand(before,command);let inverse:Inverse={type:'commands',commands:[]};let kind:Guard['kind']='locations';let ids='id' in command?[command.id]:[];const idMap:Record<string,string>={};const p='id' in command?before.papers.find(p=>p.id===command.id):undefined;
 switch(command.type){
  case 'resolveDuplicates':{
   const keeper=before.papers.find(p=>p.id===command.keeperId)!,edited=validated.papers.find(p=>p.id===command.keeperId)!,original=await api.document(keeper.id);
   const originals=command.duplicateIds.map(id=>({id,folderIds:before.papers.find(p=>p.id===id)!.folderIds}));const addedLocations=edited.folderIds.filter(id=>!keeper.folderIds.includes(id));
   inverse={type:'duplicates',keeperId:keeper.id,patch:originalMetadata(original),addedLocations,originals};
   if(Buffer.byteLength(JSON.stringify(inverse))>80000)throw new Error('Este grupo supera el tamaño del historial. Revisa menos referencias a la vez.');
   const patch:Partial<ApiDocument>={title:edited.title,source:edited.journal,abstract:edited.abstract,tags:edited.tags,identifiers:{...original.identifiers,doi:edited.doi},year:edited.year?Number(edited.year):null} as Partial<ApiDocument>;
   if(edited.authors!==keeper.authors){const source=before.papers.find(p=>[keeper.id,...command.duplicateIds].includes(p.id)&&p.authors===edited.authors);if(source)patch.authors=(await api.document(source.id)).authors||[];else throw new Error('Selecciona los autores de una referencia del grupo.');}
   let completed=0;
   try{await api.editDocument(keeper.id,patch);for(const target of addedLocations)await api.addToFolder(keeper.id,target);for(const id of command.duplicateIds){await api.trashDocument(id);completed++;}}
   catch{throw new Error(`La revisión no se completó: ${completed} copia(s) enviada(s) a Trash. La referencia elegida puede tener metadatos y ubicaciones actualizados. Recarga y revisa el grupo antes de continuar.`);}
   ids=[keeper.id,...command.duplicateIds];kind='papers';break;
  }
  case 'createFolder':{const f=await api.createFolder(command.folder.name.trim(),command.folder.parentId||undefined);idMap[command.folder.id]=f.id;ids=[f.id];kind='folder';inverse={type:'deleteFolder',id:f.id};break;}
  case 'editFolder':{const old=before.folders.find(f=>f.id===command.id)!;await api.editFolder(command.id,command.name.trim(),command.parentId);kind='folder';inverse={type:'commands',commands:[{type:'editFolder',...old}]};break;}
  case 'add':if(!p!.folderIds.includes(command.target)){await api.addToFolder(command.id,command.target);inverse={type:'commands',commands:[{type:'remove',id:command.id,source:command.target}]};}break;
  case 'remove':await api.removeFromFolder(command.id,command.source);inverse={type:'commands',commands:[{type:'add',id:command.id,target:command.source}]};break;
  case 'move':{if(!p!.folderIds.includes(command.target))await api.addToFolder(command.id,command.target);try{await api.removeFromFolder(command.id,command.source);}catch{throw new Error('Se añadió al destino, pero no se pudo quitar del origen. Recarga para revisar ambas ubicaciones.');}inverse={type:'commands',commands:[{type:'add',id:command.id,target:command.source},...(!p!.folderIds.includes(command.target)?[{type:'remove' as const,id:command.id,source:command.target}]:[])]};break;}
  case 'trash':await api.trashDocument(command.id);kind='trash';inverse={type:'commands',commands:[{type:'restore',id:command.id},...p!.folderIds.map(target=>({type:'add' as const,id:command.id,target}))]};break;
  case 'restore':await api.restoreDocument(command.id);kind='trash';inverse={type:'commands',commands:[{type:'trash',id:command.id}]};break;
  case 'metadata':{const old=await api.document(command.id);const edited=validated.papers.find(p=>p.id===command.id)!;const patch:Partial<ApiDocument>={title:edited.title,source:edited.journal,abstract:edited.abstract,tags:edited.tags,identifiers:{...old.identifiers,doi:edited.doi},year:edited.year?Number(edited.year):undefined};if(!edited.year)(patch as Record<string,unknown>).year=null;if(edited.authors!==p!.authors)patch.authors=edited.authors.split(';').map(s=>s.trim()).filter(Boolean).map(name=>{const words=name.split(/\s+/);return {first_name:words.slice(0,-1).join(' '),last_name:words.at(-1)!};});await api.editDocument(command.id,patch);kind='metadata';inverse={type:'metadata',id:command.id,patch:{title:old.title,authors:old.authors||[],year:old.year??null,source:old.source||'',abstract:old.abstract||'',tags:old.tags||[],identifiers:old.identifiers||{}} as Partial<ApiDocument>};break;}
  case 'upload':{ids=[];const done:string[]=[];try{for(const paper of command.papers){const file=blobs.get(paper.pdf!.key);if(!file)throw new Error('Falta el archivo PDF.');const doc=await api.uploadPdf(file,file.name);done.push(doc.id);ids.push(doc.id);idMap[paper.id]=doc.id;for(const target of paper.folderIds)await api.addToFolder(doc.id,target);}}catch{throw new Error(`${done.length} PDF(s) creados antes del error. Recarga: los documentos creados permanecen en tu biblioteca; no repitas toda la carga.`);}kind='papers';inverse={type:'commands',commands:ids.map(id=>({type:'trash',id}))};break;}
  case 'replace':{const file=blobs.get(command.pdf.key);if(!file)throw new Error('Falta el archivo PDF.');const newKey=await api.attachPdf(command.id,file,file.name);if(p!.pdf&&p!.pdf.key!==newKey){try{await api.deleteFile(p!.pdf.key);}catch{throw new Error('Se adjuntó el nuevo PDF, pero el anterior sigue en Mendeley. Recarga para comprobar los archivos.');}}kind='pdf';inverse={type:'replace',id:command.id,newKey,oldName:p!.pdf?.name||null};break;}
 }
 const library=await loadLibrary(api);const guard:Guard={kind,ids,expected:''};guard.expected=command.type==='resolveDuplicates'?hashProjection(projection(library,guard)):projection(library,guard);return {library,idMap,undo:signTicket(owner,inverse,guard)};
}
export async function undoLibrary(api:MendeleyClient,owner:string,ticket:string,expected:number,backup?:File){
 const before=await loadLibrary(api);requireRevision(before,expected);const t=readTicket(ticket,owner);const actual=projection(before,t.guard);if((t.guard.expected.startsWith('sha256:')?hashProjection(actual):actual)!==t.guard.expected)throw new Error('Ese elemento cambió después de la operación. Deshacer se canceló para conservar los cambios posteriores.');
 const op=t.inverse;
 if(op.type==='deleteFolder'){if(before.folders.some(f=>f.parentId===op.id)||before.papers.some(p=>p.folderIds.includes(op.id)))throw new Error('La carpeta ya contiene documentos o subcarpetas.');await api.deleteFolder(op.id);}
 else if(op.type==='metadata')await restoreMetadata(api,op.id,op.patch);
 else if(op.type==='duplicates'){
  try{for(const original of op.originals){await api.restoreDocument(original.id);for(const target of original.folderIds)await api.addToFolder(original.id,target);}await restoreMetadata(api,op.keeperId,op.patch);for(const target of op.addedLocations)await api.removeFromFolder(op.keeperId,target);}
  catch{throw new Error('Deshacer quedó incompleto. Algunas referencias pueden haberse restaurado. Recarga y revisa Trash y las ubicaciones antes de continuar.');}
 }
 else if(op.type==='replace'){if(op.oldName){if(!backup)throw new Error('La copia del PDF anterior ya no está en esta sesión.');const key=await api.attachPdf(op.id,backup,op.oldName);if(key!==op.newKey)await api.deleteFile(op.newKey);}else await api.deleteFile(op.newKey);}
 else for(const command of op.commands)await runCommand(api,command);
 return loadLibrary(api);
}

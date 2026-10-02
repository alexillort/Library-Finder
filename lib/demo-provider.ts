import { applyCommand, type Library, type Command } from './domain';
import { createDemo } from './demo';
import type { LibraryProvider, BlobWrite } from './provider';

const request = <T,>(req: IDBRequest<T>): Promise<T> => new Promise((resolve,reject) => { req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
const complete = (tx: IDBTransaction) => new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error || new Error('No se pudo guardar.'));tx.onerror=()=>reject(tx.error);});
let opening: Promise<IDBDatabase> | undefined;
function database() {
 if (!opening) opening = new Promise<IDBDatabase>((resolve,reject)=>{
  const req = indexedDB.open('library-finder-demo-v1',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('library');req.result.createObjectStore('files');};
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>{opening=undefined;reject(new Error('No se pudo abrir el almacenamiento local. Comprueba los permisos del navegador.'));};
  req.onblocked=()=>{opening=undefined;reject(new Error('Cierra otras pestañas de Library Finder y vuelve a intentar.'));};
 });
 return opening;
}
export const demoProvider: LibraryProvider = {
 async load() {
  const db=await database();const tx=db.transaction('library','readwrite');const done=complete(tx);
  let value=await request<Library | undefined>(tx.objectStore('library').get('state'));
  if (!value) {value=createDemo();tx.objectStore('library').put(value,'state');}
  await done;
  if(value.version!==1 || !Array.isArray(value.folders) || !Array.isArray(value.papers)) throw new Error('Los datos guardados no son compatibles.');
  return value;
 },
 async execute(command: Command, expectedRevision: number, files: BlobWrite[] = []) {
  return commit(expectedRevision,current=>applyCommand(current,command),files);
 },
 async restore(snapshot, expectedRevision) { return commit(expectedRevision,current=>({...structuredClone(snapshot),revision:current.revision+1}),[]); },
 async getPdf(key) {const db=await database();return request<Blob | undefined>(db.transaction('files').objectStore('files').get(key));}
};
async function commit(expected: number, update: (current: Library)=>Library, files: BlobWrite[]) {
 const db=await database(); const tx=db.transaction(['library','files'],'readwrite');const done=complete(tx);
 // Attach rejection handling before validation can abort the transaction.
 void done.catch(()=>{});
 try {
  const current=await request<Library>(tx.objectStore('library').get('state'));
  if(current.revision!==expected) throw new Error('La biblioteca cambió en otra pestaña. Se recargará; vuelve a intentar la operación.');
  const next=update(current);
  for(const file of files) tx.objectStore('files').put(file.blob,file.key);
  tx.objectStore('library').put(next,'state');await done;return next;
 } catch(error) { try {tx.abort();} catch {} throw error; }
}

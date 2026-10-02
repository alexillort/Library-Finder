// Server-side API building blocks. Not wired to demo writes.
export type ApiFolder={id:string;name:string;parent_id?:string};
export type ApiDocument={id:string;title:string;type?:string;authors?:{first_name?:string;last_name?:string}[];year?:number;source?:string;abstract?:string;identifiers?:{doi?:string};tags?:string[]};
export type ApiFile={id:string;document_id:string;file_name:string;mime_type:string;size:number};
export class MendeleyError extends Error {status:number;retryAfter:string|null;constructor(status:number,retryAfter:string|null){super(`Mendeley devolvió ${status}.`);this.status=status;this.retryAfter=retryAfter;}}
const BASE='https://api.mendeley.com';
const media=(resource:string)=>`application/vnd.mendeley-${resource}.1+json`;
export class MendeleyClient {
 private token:string;
 constructor(token:string){this.token=token;}
 private async request(path:string,resource:string,init:RequestInit={}){
  const url=new URL(path,BASE);if(url.origin!==BASE)throw new Error('Origen de API no permitido.');
  const response=await fetch(url,{...init,headers:{Accept:media(resource),...(init.body&&typeof init.body==='string'?{'Content-Type':media(resource)}:{}),...init.headers,Authorization:`Bearer ${this.token}`},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new MendeleyError(response.status,response.headers.get('retry-after'));return response;
 }
 private async json<T>(path:string,resource:string,method='GET',body?:unknown):Promise<T>{const r=await this.request(path,resource,{method,body:body===undefined?undefined:JSON.stringify(body)});return (r.status===204||r.headers.get('content-length')==='0'?undefined:await r.json()) as T;}
 async pages<T>(path:string,resource:string):Promise<T[]>{const output:T[]=[];const visited=new Set<string>();let next:string|undefined=path;
  while(next){if(visited.has(next)||visited.size>=10000)throw new Error('Paginación inválida.');visited.add(next);const r=await this.request(next,resource);const rows=await r.json();if(!Array.isArray(rows))throw new Error('Colección inválida.');output.push(...rows);next=r.headers.get('link')?.match(/<([^>]+)>;\s*rel="?next"?/)?.[1];}return output;
 }
 folders(){return this.pages<ApiFolder>('/folders?limit=500','folder');}
 documents(){return this.pages<ApiDocument>('/documents?limit=500&view=all','document');}
 memberships(folder:string){return this.pages<{id:string}>(`/folders/${encodeURIComponent(folder)}/documents?limit=500`,'document');}
 files(document:string){return this.pages<ApiFile>(`/files?document_id=${encodeURIComponent(document)}&limit=500`,'file');}
 trash(){return this.pages<ApiDocument>('/trash?limit=500','document');}
 createFolder(name:string,parent_id?:string){return this.json<ApiFolder>('/folders','folder','POST',{name,...(parent_id?{parent_id}:{})});}
 editFolder(id:string,name:string,parent_id:string|null){return this.json<ApiFolder>(`/folders/${encodeURIComponent(id)}`,'folder','PATCH',{name,parent_id});}
 async addToFolder(id:string,folder:string){await this.request(`/folders/${encodeURIComponent(folder)}/documents`,'document',{method:'POST',body:JSON.stringify({id})});}
 async removeFromFolder(id:string,folder:string){await this.request(`/folders/${encodeURIComponent(folder)}/documents/${encodeURIComponent(id)}`,'document',{method:'DELETE'});}
 async move(id:string,source:string,target:string){if(source===target)throw new Error('Origen y destino deben ser distintos.');await this.addToFolder(id,target);try{await this.removeFromFolder(id,source);}catch{throw new Error('Añadido al destino; no se pudo quitar del origen. Recarga antes de reintentar.');}}
 editDocument(id:string,metadata:Partial<ApiDocument>){return this.json<ApiDocument>(`/documents/${encodeURIComponent(id)}`,'document','PATCH',metadata);}
 async trashDocument(id:string){await this.request(`/documents/${encodeURIComponent(id)}/trash`,'document',{method:'POST'});}
 async restoreDocument(id:string){await this.request(`/trash/${encodeURIComponent(id)}/restore`,'document',{method:'POST'});}
 async uploadPdf(file:Blob,filename:string):Promise<ApiDocument>{const safeName=filename.replace(/[\r\n"\\]/g,'_').replace(/[^\x20-\x7e]/g,'_');const r=await this.request('/documents','document',{method:'POST',body:file,headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${safeName}"`}});return r.json();}
}

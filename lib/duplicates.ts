import type { Library,Metadata,Paper } from './domain.ts';
export type DuplicateGroup={id:string;paperIds:string[];confidence:'doi'|'possible';reason:string};
export function normalizeDoi(value:string){let doi=value.trim().replace(/^doi\s*:\s*/i,'');try{if(/^https?:\/\/(?:dx\.)?doi\.org\//i.test(doi))doi=decodeURIComponent(new URL(doi).pathname.slice(1));}catch{return '';}doi=doi.toLowerCase();return /^10\.\d{4,9}\/\S+$/.test(doi)?doi:'';}
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export function findDuplicateGroups(lib:Library):DuplicateGroup[]{
 const active=lib.papers.filter(p=>!p.trashed),byId=new Map(active.map(p=>[p.id,p])),parent=new Map(active.map(p=>[p.id,p.id]));
 const root=(id:string):string=>{let current=id;while(parent.get(current)!==current)current=parent.get(current)!;return current;};
 const join=(ids:string[])=>{const first=root(ids[0]);for(const id of ids.slice(1))parent.set(root(id),first);};
 const bucket=(key:(p:Paper)=>string)=>{const groups=new Map<string,string[]>();for(const p of active){const value=key(p);if(value)groups.set(value,[...(groups.get(value)||[]),p.id]);}return groups;};
 for(const ids of bucket(p=>normalizeDoi(p.doi)).values())if(ids.length>1)join(ids);
 for(const [title,ids] of bucket(p=>normalize(p.title)).entries()){
  if(ids.length<2||title.length<20||title.split(' ').length<3)continue;
  const papers=ids.map(id=>byId.get(id)!);const dois=new Set(papers.map(p=>normalizeDoi(p.doi)).filter(Boolean)),years=new Set(papers.map(p=>p.year).filter(Boolean)),authors=new Set(papers.map(p=>normalize(p.authors)).filter(Boolean));
  // An incomplete record must never bridge conflicting identifiers/authors/years.
  if(dois.size>1||years.size>1||authors.size>1||(!years.size&&!authors.size))continue;
  join(ids);
 }
 const components=new Map<string,string[]>();for(const p of active){const key=root(p.id);components.set(key,[...(components.get(key)||[]),p.id]);}
 return [...components.values()].filter(ids=>ids.length>1).map(ids=>{ids.sort();const papers=ids.map(id=>byId.get(id)!),dois=papers.map(p=>normalizeDoi(p.doi));const exact=!!dois[0]&&dois.every(doi=>doi===dois[0]);return {id:JSON.stringify(ids),paperIds:ids,confidence:exact?'doi' as const:'possible' as const,reason:exact?'Mismo DOI':'Título coincidente y datos compatibles'};}).sort((a,b)=>a.confidence===b.confidence?a.id.localeCompare(b.id):a.confidence==='doi'?-1:1);
}
export function duplicateMetadata(papers:Paper[],keeperId:string):Metadata{
 const keeper=papers.find(p=>p.id===keeperId)!;const field=(key:Exclude<keyof Metadata,'tags'>)=>keeper[key]||papers.find(p=>p[key])?.[key]||'';
 return {title:field('title'),authors:field('authors'),year:field('year'),journal:field('journal'),doi:field('doi'),abstract:field('abstract'),tags:[...new Set(papers.flatMap(p=>p.tags))]};
}
export function recommendedKeeper(papers:Paper[]){return [...papers].sort((a,b)=>Number(!!b.pdf)-Number(!!a.pdf)||[b.title,b.authors,b.year,b.journal,b.doi,b.abstract].filter(Boolean).length-[a.title,a.authors,a.year,a.journal,a.doi,a.abstract].filter(Boolean).length||a.id.localeCompare(b.id))[0]?.id;}

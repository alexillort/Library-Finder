import { findDuplicateGroups } from './duplicates.ts';
export type Folder = { id: string; name: string; parentId: string | null };
export type PdfAttachment = { key: string; name: string; size: number; mock?: boolean };
export type Paper = { id: string; title: string; authors: string; year: string; journal: string; doi: string; abstract: string; tags: string[]; folderIds: string[]; pdf: PdfAttachment | null; trashed: boolean; addedAt: string };
export type Library = { version: 1; revision: number; folders: Folder[]; papers: Paper[] };
export type Virtual = 'all' | 'unsorted' | 'multiple' | 'missing' | 'duplicates' | 'trash';
export type Scope = { kind: 'folder'; id: string } | { kind: 'virtual'; id: Virtual };
export type Metadata = Pick<Paper, 'title' | 'authors' | 'year' | 'journal' | 'doi' | 'abstract' | 'tags'>;
export type Command =
  | { type: 'createFolder'; folder: Folder }
  | { type: 'editFolder'; id: string; name: string; parentId: string | null }
  | { type: 'add'; id: string; target: string }
  | { type: 'move'; id: string; source: string; target: string }
  | { type: 'remove'; id: string; source: string }
  | { type: 'trash' | 'restore'; id: string }
  | { type: 'metadata'; id: string; metadata: Metadata }
  | { type: 'upload'; papers: Paper[] }
  | { type: 'replace'; id: string; pdf: PdfAttachment }
  | { type: 'resolveDuplicates'; keeperId: string; duplicateIds: string[]; metadata: Metadata };

export function folderPath(lib: Library, id: string): Folder[] {
  const path: Folder[] = []; const seen = new Set<string>();
  let folder = lib.folders.find(f => f.id === id);
  while (folder && !seen.has(folder.id)) { seen.add(folder.id); path.unshift(folder); folder = lib.folders.find(f => f.id === folder!.parentId); }
  return path;
}
export const pathLabel = (lib: Library, id: string) => folderPath(lib, id).map(f => f.name).join(' / ');
export function descendants(lib: Library, id: string): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) { changed = false; for (const f of lib.folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); changed = true; } }
  return ids;
}
export function selectPapers(lib: Library, scope: Scope, includeDescendants = false, query = ''): Paper[] {
  const ids = scope.kind === 'folder' ? (includeDescendants ? descendants(lib, scope.id) : new Set([scope.id])) : new Set<string>();
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const duplicates=scope.kind==='virtual'&&scope.id==='duplicates'?new Set(findDuplicateGroups(lib).flatMap(g=>g.paperIds)):null;
  return lib.papers.filter(p => {
    if (scope.kind === 'folder') { if (p.trashed || !p.folderIds.some(id => ids.has(id))) return false; }
    else if (scope.id === 'trash' ? !p.trashed : p.trashed) return false;
    else if (scope.id === 'unsorted' && p.folderIds.length) return false;
    else if (scope.id === 'multiple' && p.folderIds.length < 2) return false;
    else if (scope.id === 'missing' && p.pdf) return false;
    else if (scope.id === 'duplicates' && !duplicates?.has(p.id)) return false;
    const text = [p.title, p.authors, p.year, p.doi, p.journal, ...p.tags].join(' ').toLocaleLowerCase();
    return words.every(w => text.includes(w));
  });
}
export function applyCommand(library: Library, command: Command): Library {
  const lib = structuredClone(library);
  const folderExists = (id: string) => { if (!lib.folders.some(f => f.id === id)) throw new Error('La carpeta ya no existe.'); };
  if(command.type==='resolveDuplicates'){
    const ids=[command.keeperId,...command.duplicateIds];
    if(!command.duplicateIds.length||ids.length>20||new Set(ids).size!==ids.length)throw new Error('Selecciona entre 2 y 20 referencias diferentes.');
    if(!findDuplicateGroups(lib).some(group=>ids.every(id=>group.paperIds.includes(id))))throw new Error('Las referencias ya no forman un grupo de posibles duplicados. Actualiza la biblioteca.');
    const papers=ids.map(id=>lib.papers.find(p=>p.id===id)!);if(papers.some(p=>p.trashed))throw new Error('Restaura las referencias antes de revisarlas.');
    const edited=applyCommand(lib,{type:'metadata',id:command.keeperId,metadata:command.metadata});const keeper=edited.papers.find(p=>p.id===command.keeperId)!;
    keeper.folderIds=[...new Set(papers.flatMap(p=>p.folderIds))];
    keeper.tags=[...new Set([...keeper.tags,...papers.flatMap(p=>p.tags)].map(t=>t.trim()).filter(Boolean))];
    for(const id of command.duplicateIds)edited.papers.find(p=>p.id===id)!.trashed=true;
    return edited;
  } else if (command.type === 'createFolder' || command.type === 'editFolder') {
    const candidate = command.type === 'createFolder' ? command.folder : { id: command.id, name: command.name, parentId: command.parentId };
    candidate.name = candidate.name.trim();
    if (!candidate.name || candidate.name.length > 255) throw new Error('Escribe un nombre de entre 1 y 255 caracteres.');
    if (candidate.parentId) folderExists(candidate.parentId);
    if (lib.folders.some(f => f.id !== candidate.id && f.parentId === candidate.parentId && f.name.toLocaleLowerCase() === candidate.name.toLocaleLowerCase())) throw new Error('Ya existe una carpeta con ese nombre en esta ubicación.');
    if (command.type === 'createFolder') {
      if (lib.folders.some(f => f.id === candidate.id)) throw new Error('La carpeta ya existe.');
      lib.folders.push(candidate);
    } else {
      folderExists(candidate.id);
      if (candidate.parentId && descendants(lib, candidate.id).has(candidate.parentId)) throw new Error('Una carpeta no puede contenerse a sí misma ni moverse dentro de sus subcarpetas.');
      lib.folders = lib.folders.map(f => f.id === candidate.id ? candidate : f);
    }
  } else if (command.type === 'upload') {
    for (const p of command.papers) {
      if (lib.papers.some(existing => existing.id === p.id)) throw new Error('El documento ya existe.');
      if (!p.title.trim() || !p.pdf) throw new Error('El documento requiere título y PDF.');
      p.folderIds.forEach(folderExists); p.folderIds = [...new Set(p.folderIds)];
      lib.papers.unshift(structuredClone(p));
    }
  } else {
    const p = lib.papers.find(p => p.id === command.id);
    if (!p) throw new Error('No se encontró el documento.');
    if (p.trashed && command.type !== 'restore') throw new Error('Restaura el documento para editarlo.');
    switch (command.type) {
      case 'add': folderExists(command.target); p.folderIds = [...new Set([...p.folderIds, command.target])]; break;
      case 'move':
        folderExists(command.target);
        if (!p.folderIds.includes(command.source)) throw new Error('El documento no pertenece a la carpeta de origen.');
        if (command.source === command.target) throw new Error('Elige una carpeta de destino diferente.');
        p.folderIds = [...new Set([...p.folderIds, command.target])].filter(id => id !== command.source); break;
      case 'remove':
        if (!p.folderIds.includes(command.source)) throw new Error('El documento no está en esa carpeta.');
        p.folderIds = p.folderIds.filter(id => id !== command.source); break;
      case 'trash': p.trashed = true; break;
      case 'restore': p.trashed = false; break;
      case 'metadata':
        if (!command.metadata.title.trim()) throw new Error('El título no puede estar vacío.');
        if (command.metadata.year && !/^\d{4}$/.test(command.metadata.year)) throw new Error('El año debe tener cuatro dígitos.');
        Object.assign(p, command.metadata, { title: command.metadata.title.trim(), tags: [...new Set(command.metadata.tags.map(t => t.trim()).filter(Boolean))] }); break;
      case 'replace': p.pdf = command.pdf; break;
    }
  }
  lib.revision += 1;
  return lib;
}

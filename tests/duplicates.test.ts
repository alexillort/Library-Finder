import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,selectPapers,type Library,type Paper} from '../lib/domain.ts';
import {findDuplicateGroups,normalizeDoi,duplicateMetadata,recommendedKeeper} from '../lib/duplicates.ts';
import {duplicateDemoSamples} from '../lib/duplicate-demo.ts';
const paper=(id:string,patch:Partial<Paper>={}):Paper=>({id,title:'Authentication in immersive research environments',authors:'Ana García',year:'2025',journal:'',doi:'',abstract:'',tags:[],folderIds:[],pdf:null,trashed:false,addedAt:'2025-01-01',...patch});
const library=(papers:Paper[]):Library=>({version:1,revision:3,folders:[{id:'a',name:'Research',parentId:null},{id:'b',name:'Privacy',parentId:'a'}],papers});
test('DOI normalization supports URL, prefix, case and escaped suffix, rejecting empty or malformed values',()=>{
 assert.equal(normalizeDoi(' https://doi.org/10.5555/ABC%28Def%29 '),'10.5555/abc(def)');
 assert.equal(normalizeDoi('doi: 10.5555/ABC'),'10.5555/abc');
 assert.equal(normalizeDoi('http://dx.doi.org/10.5555/ABC'),'10.5555/abc');
 for(const v of ['','No DOI','10.test/foo','https://example.com/10.5555/a'])assert.equal(normalizeDoi(v),'');
});
test('same DOI groups independent records even with different metadata, excluding Trash and repeated folder membership',()=>{
 const l=library([paper('a',{doi:'10.5555/one',folderIds:['a','b']}),paper('b',{doi:'https://doi.org/10.5555/ONE',title:'A different imported title'}),paper('c',{doi:'10.5555/one',trashed:true}),paper('d',{title:'Unique reference in many different folders',folderIds:['a','b']})]);
 const groups=findDuplicateGroups(l);assert.equal(groups.length,1);assert.equal(groups[0].confidence,'doi');assert.deepEqual(groups[0].paperIds,['a','b']);
 assert.equal(findDuplicateGroups(library([l.papers[0]])).length,0);
 assert.deepEqual(selectPapers(l,{kind:'virtual',id:'duplicates'},false,'imported').map(p=>p.id),['b']);
});
test('title matches tolerate punctuation and accents but require compatible evidence',()=>{
 const a=paper('a'),b=paper('b',{title:'Authentication: in immersive research environments!',authors:'Ana Garcia'});
 assert.equal(findDuplicateGroups(library([a,b]))[0].confidence,'possible');
 for(const patch of [{year:'2024'},{authors:'Someone Else'},{doi:'10.5555/another'}]){
  const first=paper('a',{doi:'10.5555/one'});assert.equal(findDuplicateGroups(library([first,paper('b',patch),paper('unknown',{authors:'',year:'',doi:''})])).length,0);
 }
 assert.equal(findDuplicateGroups(library([paper('a',{year:'',authors:''}),paper('b',{year:'',authors:''})])).length,0);
 assert.equal(findDuplicateGroups(library([paper('a',{title:'Introduction'}),paper('b',{title:'Introduction'})])).length,0);
});
test('resolution preserves the chosen ID and PDFs, unions locations and tags, and trashes only selected copies',()=>{
 const a=paper('a',{folderIds:['a'],tags:['Original'],pdf:{key:'pdf-a',name:'a.pdf',size:10}}),b=paper('b',{folderIds:['b'],tags:['Imported'],journal:'Journal',abstract:'Available abstract',pdf:{key:'pdf-b',name:'b.pdf',size:20}});
 const l=library([a,b,paper('unrelated',{title:'Another entirely different research document'})]);
 assert.equal(recommendedKeeper([a,b]),'b');const metadata=duplicateMetadata([a,b],'a');assert.equal(metadata.abstract,b.abstract);
 const resolved=applyCommand(l,{type:'resolveDuplicates',keeperId:'a',duplicateIds:['b'],metadata:{...metadata,tags:[]}});
 const keeper=resolved.papers[0],copy=resolved.papers[1];assert.equal(resolved.revision,4);assert.equal(keeper.id,'a');assert.deepEqual(keeper.pdf,a.pdf);assert.deepEqual(keeper.folderIds,['a','b']);assert.deepEqual(keeper.tags,['Original','Imported']);assert.equal(keeper.journal,'Journal');assert.ok(copy.trashed);assert.deepEqual(copy.pdf,b.pdf);assert.deepEqual(copy.folderIds,['b']);assert.equal(resolved.papers[2].trashed,false);assert.equal(findDuplicateGroups(resolved).length,0);assert.equal(l.papers[1].trashed,false);
 const restored=structuredClone(l);assert.equal(findDuplicateGroups(restored).length,1);assert.equal(restored.papers[0].journal,'');
});
test('stale, unrelated or repeated records and oversized groups are rejected before changes',()=>{
 const l=library([paper('a'),paper('b'),paper('unique',{title:'Entirely different reference'})]);const metadata=duplicateMetadata(l.papers,'a');
 for(const ids of [[],['a'],['unique'],['b','b']])assert.throws(()=>applyCommand(l,{type:'resolveDuplicates',keeperId:'a',duplicateIds:ids,metadata}));
 const many=library(Array.from({length:21},(_,i)=>paper(String(i))));assert.throws(()=>applyCommand(many,{type:'resolveDuplicates',keeperId:'0',duplicateIds:many.papers.slice(1).map(p=>p.id),metadata}),/20/);
 const trashed=applyCommand(l,{type:'trash',id:'b'});assert.throws(()=>applyCommand(trashed,{type:'resolveDuplicates',keeperId:'a',duplicateIds:['b'],metadata}),/grupo/);
});
test('optional demo samples supply DOI and possible groups without changing the source library',()=>{
 const l=library([]),samples=duplicateDemoSamples(l);assert.equal(l.papers.length,0);assert.equal(samples.length,4);const groups=findDuplicateGroups({...l,papers:samples});assert.deepEqual(groups.map(g=>g.confidence),['doi','possible']);
});

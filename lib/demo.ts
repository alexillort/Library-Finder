import type { Library, Paper } from './domain';

const entries: [string,string,string,string[],string[],boolean?][] = [
 ['Understanding authentication in virtual reality','M. Rivera, S. Chen & A. Patel','2025',['vr','auth','included'],['Authentication','Virtual reality']],
 ['A systematic review of privacy in immersive environments','L. Morrison & K. Wang','2024',['vr','privacy','included'],['Privacy','Review']],
 ['Usable security for the next generation of virtual worlds','A. Thompson, R. Lee & M. Costa','2025',['vr','usable'],['Usable security','Virtual reality']],
 ['Threat modeling for social virtual reality','J. Kim & P. Anderson','2023',['vr','attacks'],['Threat modeling']],
 ['Designing trust in immersive systems','E. García & T. Wilson','2024',['vr'],['Trust','Design']],
 ['Beyond passwords: continuous authentication in VR','S. Chen & N. Ali','2025',['auth','bio'],['Biometrics','Authentication']],
 ['Who is watching? Eye tracking and user privacy','L. Morrison & D. Park','2024',['eye','privacy','interaction'],['Eye tracking','Privacy']],
 ['Head and hand motion as a behavioral signature','M. Rivera & A. Patel','2023',['bio','included'],['Biometrics']],
 ['Gaze-based authentication in head-mounted displays','K. Wang & R. Lee','2024',['eye','auth'],['Eye tracking']],
 ['Identity inference from body motion in VR','J. Kim & N. Ali','2025',['attacks','bio'],['Identity','Security']],
 ['Consent interfaces for immersive experiences','E. García & M. Costa','2024',['privacy','usable'],['Consent','UX']],
 ['Measuring presence in collaborative virtual spaces','T. Wilson & D. Park','2023',['interaction'],['Presence']],
 ['Adversarial interactions in shared virtual environments','P. Anderson & S. Chen','2025',['attacks'],['Adversarial'],true],
 ['A framework for responsible spatial computing','A. Thompson & E. García','2025',[],['Spatial computing'],true],
 ['Research methods for human-computer interaction','R. Lee & L. Morrison','2022',['methods'],['Methods']],
 ['Literature review protocol: immersive security','M. Rivera','2026',['review'],['Protocol'],true],
 ['Exploring multimodal interaction techniques','D. Park & K. Wang','2024',[],['Interaction']],
 ['Early notes on password entry in VR','M. Rivera','2021',['auth'],['Notes']],
];
export function createDemo(): Library {
 const folders = [
  {id:'vr',name:'VR Security',parentId:null}, {id:'auth',name:'Authentication',parentId:'vr'},
  {id:'bio',name:'Biometrics',parentId:'auth'}, {id:'eye',name:'Eye Tracking',parentId:'auth'},
  {id:'privacy',name:'Privacy',parentId:'vr'}, {id:'attacks',name:'Attacks & Threats',parentId:'vr'},
  {id:'usable',name:'Usable Security',parentId:'vr'}, {id:'interaction',name:'Interaction',parentId:null},
  {id:'review',name:'Literature Review',parentId:null}, {id:'included',name:'Included',parentId:'review'},
  {id:'methods',name:'Research Methods',parentId:null}
 ];
 const papers: Paper[] = entries.map(([title,authors,year,folderIds,tags,missing],i) => ({
  id:`paper-${i+1}`, title, authors, year, folderIds, tags,
  journal:i % 2 ? 'ACM CHI · Human Factors in Computing Systems' : 'IEEE Conference on Virtual Reality',
  doi:'', abstract:'Referencia ficticia para explorar la biblioteca. Este artículo de ejemplo analiza las relaciones entre seguridad, interacción y experiencias inmersivas. Puedes editar sus metadatos, añadirlo a otras carpetas o sustituir el PDF por uno de tus documentos.',
  pdf:missing ? null : {key:'sample',name:`${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.pdf`,size:1024,mock:true},
  trashed:i===17, addedAt:`2026-09-${String(28-i).padStart(2,'0')}T10:00:00Z`
 }));
 return {version:1,revision:0,folders,papers};
}

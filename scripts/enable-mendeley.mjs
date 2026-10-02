import { mkdir,copyFile } from 'node:fs/promises';
const target=new URL('../app/api/auth/mendeley/[action]/',import.meta.url);
await mkdir(target,{recursive:true});
await copyFile(new URL('../integrations/mendeley/auth-route.ts',import.meta.url),new URL('route.ts',target));
console.log('Rutas OAuth instaladas. Configura .env.local con MENDELEY_SERVER=1 y reinicia Next.js. La interfaz continúa en demo hasta implementar el proveedor remoto.');

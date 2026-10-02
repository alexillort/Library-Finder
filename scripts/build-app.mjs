import { spawnSync } from 'node:child_process';
// Sites sets SITE_BUILD=1 in its build command; local production remains Next.js.
const entry=process.env.SITE_BUILD==='1'?'scripts/run-framework.mjs':'node_modules/next/dist/bin/next';
const result=spawnSync(process.execPath,[entry,'build',...(process.env.SITE_BUILD==='1'?[]:['--webpack'])],{stdio:'inherit',env:process.env});
if(result.error)throw result.error;
process.exit(result.status??1);

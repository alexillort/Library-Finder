import { AsyncLocalStorage } from 'node:async_hooks';
const context=new AsyncLocalStorage<Record<string,unknown>>();
export function runtimeEnv(){return context.getStore()??process.env;}
export function withRuntimeEnv<T>(env:Record<string,unknown>,callback:()=>T){return context.run(env,callback);}

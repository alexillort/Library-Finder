import { z } from 'zod';
import type { Command } from '../../lib/domain.ts';
const id=z.string().min(1).max(160),name=z.string().trim().min(1).max(255);
const pdf=z.object({key:id,name:z.string().min(1).max(255),size:z.number().int().positive().max(25*1024*1024)});
const metadata=z.object({title:z.string().trim().min(1).max(500),authors:z.string().max(10000),year:z.string().regex(/^\d{4}$|^$/),journal:z.string().max(1000),doi:z.string().max(1000),abstract:z.string().max(30000),tags:z.array(z.string().max(255)).max(100)});
const paper=metadata.extend({id,folderIds:z.array(id).max(200),pdf,trashed:z.literal(false),addedAt:z.string().datetime()});
const commands=z.discriminatedUnion('type',[
 z.object({type:z.literal('createFolder'),folder:z.object({id,name,parentId:id.nullable()})}),
 z.object({type:z.literal('editFolder'),id,name,parentId:id.nullable()}),
 z.object({type:z.literal('add'),id,target:id}),z.object({type:z.literal('move'),id,source:id,target:id}),z.object({type:z.literal('remove'),id,source:id}),
 z.object({type:z.literal('trash'),id}),z.object({type:z.literal('restore'),id}),z.object({type:z.literal('metadata'),id,metadata}),
 z.object({type:z.literal('upload'),papers:z.array(paper).min(1).max(20)}),z.object({type:z.literal('replace'),id,pdf})
]);
export function parseCommand(input:unknown):Command{const result=commands.safeParse(input);if(!result.success)throw new Error('Los datos de la operación no son válidos. Revisa el formulario.');return result.data;}

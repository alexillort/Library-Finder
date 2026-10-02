import type { Command, Library } from './domain';
export type BlobWrite = { key: string; blob: Blob };
export interface LibraryProvider {
 load(): Promise<Library>;
 execute(command: Command, expectedRevision: number, files?: BlobWrite[]): Promise<Library>;
 restore(snapshot: Library, expectedRevision: number): Promise<Library>;
 getPdf(key: string): Promise<Blob | undefined>;
}

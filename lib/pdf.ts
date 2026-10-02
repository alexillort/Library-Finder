// Generates an honest, small demo PDF, never a fabricated full research paper.
export function samplePdf(title: string): Blob {
 const safe=(s:string)=>s.normalize('NFKD').replace(/[^\x20-\x7E]/g,'').replace(/[\\()]/g,'\\$&');
 const lines=['LIBRARY FINDER', 'PDF DE DEMOSTRACION', '',...title.match(/.{1,65}(?:\s|$)/g)||[title], '', 'Este archivo es una muestra, no el articulo original.', 'Usa Replace PDF para adjuntar tu propio documento.', '', 'Los registros de esta biblioteca demo son ficticios.'];
 const stream=`BT /F1 16 Tf 56 760 Td ${lines.map((line,i)=>`${i ? '0 -28 Td ' : ''}(${safe(line.trim())}) Tj`).join('\n')} ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let file='%PDF-1.4\n'; const offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(file.length);file+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=file.length;file+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Blob([file],{type:'application/pdf'});
}
export async function validatePdf(file: File) {
 if(file.size>25*1024*1024) throw new Error(`${file.name}: el límite del demo es 25 MB por archivo.`);
 if(!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Selecciona un archivo con extensión .pdf.');
 const header = new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
 if(header!=='%PDF-') throw new Error(`${file.name}: el archivo no contiene una cabecera PDF válida.`);
}

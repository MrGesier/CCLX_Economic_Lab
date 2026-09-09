import { mkdir, cp, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for (const p of ['index.html','styles.css','src','public']) await cp(p,'dist/'+p,{recursive:true});
console.log('Built dist/ - ready for Vercel static deployment.');

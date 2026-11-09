import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const check=process.argv.includes('--check');
await mkdir('runtime-data',{recursive:true});
for(const name of ['mongolia-context','mongolia-logistics']){
 const destination=`runtime-data/${name}.json.gz`;
 const bytes=check?gunzipSync(await readFile(destination)):await readFile(`.data/${name}.json`);
 const data=JSON.parse(bytes.toString('utf8'));
 if(data.data?.type!=='FeatureCollection'||!data.data.features.length||!data.provenance?.source)throw new Error(`Missing reference data: ${name}`);
 if(!check)await writeFile(destination,gzipSync(bytes,{level:9}));
 console.log(`${name}: ${data.data.features.length} features, SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
}

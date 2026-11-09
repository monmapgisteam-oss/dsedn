import {configuredToken,portal,portalIdentity,readRun,saveEnterprise} from '@/lib/server/results';
export const maxDuration=120;
export async function GET(){try{await portalIdentity(configuredToken());return Response.json({ready:true,portal,folder:'renewable'});}catch(e){return Response.json({ready:false,portal,folder:'renewable',message:e instanceof Error?e.message:'Enterprise холболт амжилтгүй.'});}}
export async function POST(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Origin mismatch'},{status:403});
 if(Number(request.headers.get('content-length'))>16384)return Response.json({error:'Хүсэлт хэт том.'},{status:413});
 try{const {runId,title}=await request.json();if(typeof runId!=='string'||typeof title!=='string'||!title.trim()||title.length>160||/[<>]/.test(title))throw new Error('Нэр 1–160 тэмдэгт байна.');
 const bearer=request.headers.get('authorization');const token=bearer?.startsWith('Bearer ')?bearer.slice(7):configuredToken();
 const run=await readRun(runId);return Response.json(await saveEnterprise(run,title.trim(),token));
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Enterprise хадгалалт амжилтгүй.'},{status:400});}
}

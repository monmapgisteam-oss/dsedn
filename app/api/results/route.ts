import {portal,readRun,saveEnterprise} from '@/lib/server/results';
import {requireApiSession} from '@/lib/server/auth';
import {sameOrigin} from '@/lib/server/auth-session';
export const maxDuration=120;
export async function GET(){const session=await requireApiSession();if(session instanceof Response)return session;return Response.json({ready:true,portal,folder:'renewable',username:session.username},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Origin mismatch'},{status:403});
 const session=await requireApiSession();if(session instanceof Response)return session;
 if(Number(request.headers.get('content-length'))>16384)return Response.json({error:'Хүсэлт хэт том.'},{status:413});
 try{const {runId,title}=await request.json();if(typeof runId!=='string'||typeof title!=='string'||!title.trim()||title.length>160||/[<>]/.test(title))throw new Error('Нэр 1–160 тэмдэгт байна.');
 const run=await readRun(runId);return Response.json(await saveEnterprise(run,title.trim(),session.token,session.referer));
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Enterprise хадгалалт амжилтгүй.'},{status:400});}
}

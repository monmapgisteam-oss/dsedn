import {loadSaved} from '@/lib/server/results';
import {requireApiSession} from '@/lib/server/auth';
import {jsonResponse} from '@/lib/server/json-response';

export const maxDuration=120;

/** Reopens a saved model exactly as calculated, without running the analysis again. */
export async function GET(_request:Request,ctx:RouteContext<'/api/results/saved/[id]'>){
 const session=await requireApiSession();if(session instanceof Response)return session;
 try{const {id}=await ctx.params;return jsonResponse(await loadSaved(id,session.token,session.referer));}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Хадгалсан загвар нээгдсэнгүй.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}

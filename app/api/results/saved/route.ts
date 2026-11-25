import {listSaved} from '@/lib/server/results';
import {requireApiSession} from '@/lib/server/auth';

/** Lists the signed-in user's saved results from their Portal `renewable` folder. */
export async function GET(){
 const session=await requireApiSession();if(session instanceof Response)return session;
 try{return Response.json({items:await listSaved(session.token,session.referer)},{headers:{'Cache-Control':'no-store'}});}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Хадгалсан загварын жагсаалт татагдсангүй.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}

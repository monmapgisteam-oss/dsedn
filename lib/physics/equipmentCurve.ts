// Adapted from the user-provided Booroljuut reference, commit 782827f.
// Үйлдвэрлэгчийн CSV: speed_ms,power_kw,rpm (rpm сонголттой). Файлд код ажиллуулахгүй.
export type PowerPoint={speed:number;mw:number;rpm?:number};
export function parsePowerCurve(csv:string):PowerPoint[]{
 const lines=csv.replace(/^\uFEFF/,"").trim().split(/\r?\n/).filter((s)=>s.trim());
 if(lines.length<4||lines.length>1002)throw new Error("Power curve CSV нь 3–1000 өгөгдлийн мөртэй байна.");
 const header=lines.shift()!.split(",").map((s)=>s.trim().toLowerCase()),v=header.indexOf("speed_ms"),p=header.indexOf("power_kw"),rpm=header.indexOf("rpm");
 if(v<0||p<0)throw new Error("CSV толгой: speed_ms,power_kw,rpm (rpm сонголттой)");
 const rows=lines.map((line,i)=>{
  const a=line.split(",").map((s)=>s.trim());const speed=a[v]===""?NaN:Number(a[v]),kw=a[p]===""?NaN:Number(a[p]),r=rpm<0?undefined:a[rpm]===""?NaN:Number(a[rpm]);
  if(!Number.isFinite(speed+kw)||speed<0||speed>60||kw<0||kw>50000||(r!=null&&(!Number.isFinite(r)||r<0||r>100)))throw new Error(`CSV мөр ${i+2}: хурд, чадал, RPM утгыг шалгана уу.`);
  return {speed,mw:kw/1000,...(r==null?{}:{rpm:r})};
 }).sort((a,b)=>a.speed-b.speed);
 if(rows.some((r,i)=>i>0&&r.speed===rows[i-1].speed))throw new Error("Салхины хурд давхардсан байна.");
 if(!rows.some((r)=>r.mw>0))throw new Error("Эерэг чадлын утга алга.");
 return rows;
}
export function curveValue(points:PowerPoint[],speed:number,key:"mw"|"rpm"="mw"){
 if(!Number.isFinite(speed)||!points.length||speed<points[0].speed||speed>points[points.length-1].speed)return 0;
 for(let i=1;i<points.length;i++)if(speed<=points[i].speed){const a=points[i-1],b=points[i],t=(speed-a.speed)/(b.speed-a.speed);return (a[key]??0)*(1-t)+(b[key]??0)*t;}
 return points[points.length-1][key]??0;
}

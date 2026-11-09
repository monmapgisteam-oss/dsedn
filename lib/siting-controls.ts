export const criterionLabels={resource:'Нар / салхины нөөц',grid:'Цахилгаан шугамд ойр',terrain:'Газрын налуу',road:'Улсын авто замд ойр',settlement:'Аймаг / сумын төвд ойр'};
export type SiteWeights=Record<keyof typeof criterionLabels,number>;
export const defaultWeights:SiteWeights={resource:30,grid:25,terrain:20,road:15,settlement:10};
export function weightPercent(weights:SiteWeights,key:keyof SiteWeights){const sum=Object.values(weights).reduce((s,v)=>s+v,0);return sum>0?100*weights[key]/sum:0;}
export function weightedScore(values:SiteWeights,weights:SiteWeights){return Object.keys(defaultWeights).reduce((s,key)=>s+values[key as keyof SiteWeights]*weightPercent(weights,key as keyof SiteWeights),0);}
export function validatePeriod(start:string,end:string,now=new Date()){
 if(!/^\d{4}-01-01$/.test(start)||!/^\d{4}-12-31$/.test(end))throw new Error('Жилийн үйлдвэрлэлийн үнэлгээнд бүтэн календарийн жил сонгоно: 01-01 → 12-31.');
 const a=Number(start.slice(0,4)),z=Number(end.slice(0,4));
 if(a<1940||z>=now.getUTCFullYear()||z<a||z-a>=30)throw new Error('ERA5: 1940 оноос хойших дууссан 1–30 календарийн жил сонгоно уу.');
}

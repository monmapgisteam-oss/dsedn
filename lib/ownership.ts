// Conservative organization matching: an address containing the company name is not ownership evidence.
const aliases=new Set(['дархансэлэнгийнцахилгаантүгээхсүлжээ','дархансэлэнгийнцахилгаантүгээхсүлжээхк','дархансэлэнгийнцтс','дархансэлэнгийнцтсхк','дсцтс','дсцтсхк','dsedn','dsednjsc']);
export function isDsednOwner(value:unknown):boolean {
  if(typeof value!=='string')return false;
  return aliases.has(value.toLowerCase().replace(/[^a-zа-яөүё]/g,''));
}

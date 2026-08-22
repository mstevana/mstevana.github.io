const fs=require('fs');
const html=fs.readFileSync('crawl_assembled.html','utf8');
const marks=[
 ['02_data.js','/* ============================== RULES DATA (D&D 3.5 SRD, simplified) ============================== */'],
 ['03_sprites.js','/* ============================== SVG SPRITES (grim retro) ============================== */'],
 ['04_items_dungeon.js','/* ============================== ITEM REGISTRY & LOOT ============================== */'],
 ['05_char.js','/* ============================== CHARACTERS ============================== */'],
 ['06_engine.js','/* ============================== 3D ENGINE ============================== */'],
 ['07_game.js','/* ============================== GAME STATE & LOGIC ============================== */'],
 ['08_ui.js','/* ============================== AUDIO ============================== */'],
 ['09_boot.js','/* ============================== INPUT ============================== */'],
];
// every banner must appear exactly once
for(const [f,m] of marks){
  const first=html.indexOf(m), last=html.lastIndexOf(m);
  if(first<0)throw new Error('missing banner for '+f);
  if(first!==last)throw new Error('banner not unique for '+f);
}
const offs=marks.map(([f,m])=>[f,html.indexOf(m)]);
for(let i=1;i<offs.length;i++)if(offs[i][1]<=offs[i-1][1])throw new Error('banners out of order at '+offs[i][0]);
const tail='</script>\n</body>\n</html>\n';
if(!html.endsWith(tail))throw new Error('unexpected tail');
const end=html.length-tail.length;
// 01_head.html is everything before the first banner
let prev=0,prevName='01_head.html';
for(const [f,off] of offs){
  fs.writeFileSync(prevName,html.slice(prev,off));
  prev=off;prevName=f;
}
fs.writeFileSync(prevName,html.slice(prev,end));
console.log('split done');

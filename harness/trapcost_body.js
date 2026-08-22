/* What does a web snare actually cost the party, against the trap it displaces?

   The descent simulator is blind to traps — it fights monsters and nothing else —
   so a before/after on its median would prove nothing here. This measures the
   trap table itself: fire each kind several thousand times at a plausible party
   at a drow depth and score what it takes off them.

   `cost` is in hit points, with a condition priced at what it is worth: a round
   of a level-20 character doing nothing, plus the 4 AC they shed while helpless.
   Crude, but applied identically to every kind, which is what makes the
   comparison mean something. */
UI.toast=()=>{};UI.float=()=>{};SFX.levelup=()=>{};
const N=+(process.argv[2]||8000);
const depth=(()=>{for(let d=1;d<60;d++){const i=Math.floor((d-1)/3)%THEMES.length;
  if(THEMES[i].name==='Drow')return d;}return 19;})();

function party(){
  const p=[mkCharacter('A','human','fighter',[16,13,15,10,11,9]),
           mkCharacter('B','elf','rogue',[12,17,13,12,12,10]),
           mkCharacter('C','human','cleric',[13,11,14,10,16,11]),
           mkCharacter('D','human','wizard',[9,14,12,17,12,10])];
  for(const c of p){while(c.level<12)grantXp(c,XP_FOR_LEVEL(c.level+1)-c.xp);c.hp=c.maxHp;}
  return p;
}
// what one character losing `dur` seconds is worth, in hit points
const HELD_PER_SEC=3.4, ABIL_PER_POINT=5;
function fire(kind){
  const P=party();
  G.party=P;G.depth=depth;G.time=100;
  // triggerTrap reaches into the level to clear the decal, so give it one
  G.L={w:8,h:8,grid:new Uint8Array(64),items:{},traps:{},monsters:[]};
  const tr={kind,found:false,armed:true,dc:trapDC(depth),
    dmg:(kind==='gas'||kind==='websnare'||kind==='puffball')?null:(kind==='pdart'||kind==='sleepdart')?[1,4]:[trapDice(depth),6],
    dur:kind==='pdart'?4:kind==='sleepdart'?5:kind==='websnare'?5:kind==='puffball'?5:0,x:1,y:1};
  const before=P.reduce((n,c)=>n+c.hp,0);
  const abBefore=P.reduce((n,c)=>n+ABILITIES.reduce((m,a)=>m+(c.abilDmg[a]||0),0),0);
  triggerTrap(tr);
  let cost=before-P.reduce((n,c)=>n+c.hp,0);
  // conditions carry `dur` in seconds, not an absolute `until`
  for(const c of P)for(const cd of (c.conditions||[]))
    if(cd.kind==='paralysis'||cd.kind==='sleep'||cd.kind==='hold'||cd.kind==='stunned')
      cost+=(cd.dur||0)*HELD_PER_SEC;
  // gas drains ability rather than hit points, so it scores zero without this
  const abAfter=P.reduce((n,c)=>n+ABILITIES.reduce((m,a)=>m+(c.abilDmg[a]||0),0),0);
  cost+=(abAfter-abBefore)*ABIL_PER_POINT;
  return cost;
}
const KINDS=['dart','spike','gas','pdart','sleepdart','websnare','puffball'];
const out=[];
for(const k of KINDS){
  let tot=0,land=0;
  for(let i=0;i<N;i++){const c=fire(k);tot+=c;if(c>0.001)land++;}
  out.push([k,tot/N,land/N]);
}
console.log('depth '+depth+', '+N+' firings each, DC '+trapDC(depth)+'\n');
for(const [k,c,l] of out)
  console.log(k.padEnd(10)+' mean cost '+c.toFixed(1).padStart(6)+' hp    lands '+(l*100).toFixed(0).padStart(3)+'% of the time');
const others=out.filter(o=>o[0]!=='websnare'&&o[0]!=='puffball');
const mean=others.reduce((n,o)=>n+o[1],0)/others.length;
for(const nm of ['websnare','puffball']){
  const v=out.find(o=>o[0]===nm)[1];
  console.log('\nthe five it displaces average '+mean.toFixed(1)+' hp; the '+nm+' costs '+v.toFixed(1)+
    ' ('+((v/mean-1)*100).toFixed(0)+'%)');
}

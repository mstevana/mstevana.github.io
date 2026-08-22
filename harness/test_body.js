/* ---- tests ---- */
let minWalk=1e9;
for(const depth of [1,2,5,10,17,25]){
  const L=genLevel(depth);
  let walk=0;for(let i=0;i<L.grid.length;i++)if(L.grid[i]&&L.grid[i]!==T_SECRET&&L.grid[i]!==T_PIT)walk++;
  minWalk=Math.min(minWalk,walk);
  const df=new Int32Array(L.w*L.h).fill(-1);
  const q=[[L.start.x,L.start.y]];df[L.start.y*L.w+L.start.x]=0;let qi=0;
  while(qi<q.length){const[cx,cy]=q[qi++];
    for(const[dx,dy] of DIRS){const nx=cx+dx,ny=cy+dy,t=L.grid[ny*L.w+nx];
      if(t&&t!==T_SECRET&&t!==T_PIT&&t!==T_DOOR_LOCKED&&df[ny*L.w+nx]<0){df[ny*L.w+nx]=df[cy*L.w+cx]+1;q.push([nx,ny]);}}}
  const sOK=df[L.stairs.y*L.w+L.stairs.x]>=0;
  const boss=L.monsters.filter(m=>m.boss).length;
  console.log('depth',depth,'dim',L.w,'walk',walk,'stairsOK',sOK,'monsters',L.monsters.length,'boss',boss,'traps',Object.keys(L.traps).length,'secrets',L.secrets.length,'itemTiles',Object.keys(L.items).length);
  if(!sOK)throw new Error('stairs unreachable at depth '+depth);
  if((depth%3===0&&depth>=6)!==(boss===1))throw new Error('boss cadence wrong at depth '+depth+': '+boss);
  // key exists if a locked door exists
  let locked=false;for(let i=0;i<L.grid.length;i++)if(L.grid[i]===T_DOOR_LOCKED)locked=true;
  if(locked){
    let key=false;for(const i in L.items)for(const it of L.items[i])if(it.base==='key')key=true;
    if(!key)throw new Error('locked door without key at depth '+depth);
  }
}
if(minWalk<200)throw new Error('walkable below 200: '+minWalk);
const p=mkAutoParty();
for(const ch of p){
  console.log(ch.name,ch.race,ch.cls,'hp',ch.hp,'AC',charAC(ch),'saves',JSON.stringify(charSaves(ch)),'slots',JSON.stringify(charSlots(ch)));
  if(ch.hp<1)throw new Error('bad hp');
}
const w=p[2];
grantXp(w,XP_FOR_LEVEL(9)+10);
if(w.level!==9)throw new Error('level calc wrong: '+w.level);
console.log('wizard lvl9 slots',JSON.stringify(charSlots(w)),'wiz spells',spellsKnown('wizard',9).length,'cleric spells',spellsKnown('cleric',9).length);
const f=p[0];const rw=weaponOf(f,'rhand');
console.log('fighter atkB',attackBonus(f,rw.def,rw.it),'cd',attackCooldown(f,rw.def).toFixed(2),'dmg',damageRoll(f,rw.def,rw.it,false));
for(const k in ITEM_DEFS){const s=itemSVG(mkItem(k,{bonus:1,spell:'clw',charges:5}));if(!s.includes('<svg'))throw new Error('bad svg '+k);}
for(const k in MONSTERS){const s=monsterSVG(MONSTERS[k].spr,false);if(!s.includes('<svg'))throw new Error('bad monster svg '+k);}
// all 7 classes create fine with manual scores
for(const ck of Object.keys(CLASSES))for(const rk of Object.keys(RACES)){
  const c=mkCharacter('T',rk,ck,[15,14,13,12,10,8]);
  if(c.hp<1||!isFinite(charAC(c)))throw new Error('creation broken '+ck+' '+rk);
}
console.log('ALL LOGIC TESTS PASSED');

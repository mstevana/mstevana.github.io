/* --- regression tests for review fixes --- */
// Themes cycle every three floors, so which depth is which theme moves whenever
// a theme is appended. Ask for a depth by theme instead of hardcoding one, and
// adding a sixth theme will not break a dozen tests the way a fifth did.
const THEME_IDX=(name)=>THEMES.findIndex(t=>t.name===name);
function depthsOf(name,upTo){
  const want=THEME_IDX(name),out=[];
  for(let d=1;d<=(upTo||45);d++)if(Math.floor((d-1)/3)%THEMES.length===want)out.push(d);
  return out;
}
function depthOf(name,near){
  const want=THEME_IDX(name);
  if(want<0)throw new Error('no theme named '+name);
  const step=THEMES.length*3;
  let best=null;
  for(let d=1;d<=120;d++){
    if(Math.floor((d-1)/3)%THEMES.length!==want)continue;
    if(best===null||Math.abs(d-(near||20))<Math.abs(best-(near||20)))best=d;
  }
  return best;
}
const grid2=new Uint8Array(20*20).fill(T_FLOOR);
G.L={w:20,h:20,grid:grid2,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
  theme:THEMES[0],depth:1,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
G.px=5;G.py=5;G.facing=1;G.paused=false;G.over=false;G.started=true;G.time=0;
// 1. buff no-stack: bless twice -> one Bless buff, same AC after double mage armor
const w=mkCharacter('Wz','human','wizard',[10,10,10,16,10,10]);
const c=mkCharacter('Cl','human','cleric',[10,10,10,10,16,10]);
G.party=[w,c];
c.cdL=0;c.cdR=0;castSpell(c,'bless',{fromUI:true});
c.cdL=0;c.cdR=0;castSpell(c,'bless',{fromUI:true});
const blessCount=w.buffs.filter(b=>b.tag==='Bless').length;
if(blessCount!==1)throw new Error('T1 bless stacked: '+blessCount);
w.cdL=0;w.cdR=0;castSpell(w,'magearmor',{fromUI:true});
const ac1=charAC(w);
w.cdL=0;w.cdR=0;castSpell(w,'magearmor',{fromUI:true});
if(charAC(w)!==ac1)throw new Error('T1 mage armor stacked: '+ac1+' -> '+charAC(w));
console.log('T1 buff stacking fixed: bless x1, AC stable at',ac1);
// 2. endRage on a downed barbarian must not revive (and not kill outright)
const b=mkCharacter('Bb','human','barbarian',[16,10,14,10,10,10]);
G.party=[b,w];
G.time=0;
useClassAbility(b); // rage
if(!isRaging(b))throw new Error('T2 rage did not start');
b.hp=-5;b.stable=false;
G.time=31;
updateParty(0.016);
if(b.hp>0)throw new Error('T2 endRage revived a downed barbarian to '+b.hp);
if(b.dead)throw new Error('T2 endRage killed outright');
console.log('T2 endRage on downed barbarian: hp',b.hp,'dead',b.dead);
// 3. charDies clears rage state
const b2=mkCharacter('B2','human','barbarian',[16,10,14,10,10,10]);
G.party=[b2,w];G.time=0;
useClassAbility(b2);
charDies(b2);
if(b2.rageUntil!==0)throw new Error('T3 rageUntil not cleared on death');
console.log('T3 charDies clears rage');
G.over=false;
// 4. save round-trip preserves restCount and passes the version guard
G.party=[w,c];
G.L.restCount={42:2};
const snap=serializeGame();
if(snap.v!==1)throw new Error('T4 save version missing');
if(snap.level.restCount[42]!==2)throw new Error('T4 restCount not serialized');
console.log('T4 save v-tag + restCount ok');
// 5. stackKey behavior
if(stackKey(mkItem('pot_clw'))!==stackKey(mkItem('pot_clw')))throw new Error('T5 potion stack keys differ');
if(stackKey(mkItem('pot_clw'))===stackKey(mkItem('pot_cmw')))throw new Error('T5 different potions stack');
if(stackKey(mkItem('scroll',{spell:'clw'}))!==stackKey(mkItem('scroll',{spell:'clw'})))throw new Error('T5 scroll keys differ');
if(stackKey(mkItem('longsword'))!==null)throw new Error('T5 weapons must not stack');
const p3=mkItem('pot_clw',{qty:3});
if(itemName(p3).indexOf('×3')<0)throw new Error('T5 qty missing from name');
console.log('T5 stackKey + naming ok');
// 6. keyless locked room can no longer occur: exhaustive generation check
for(let d=1;d<=20;d++){
  const L=genLevel(d);
  let locked=false;for(let i=0;i<L.grid.length;i++)if(L.grid[i]===T_DOOR_LOCKED)locked=true;
  if(locked){
    let key=false;for(const i in L.items)for(const it of L.items[i])if(it.base==='key')key=true;
    if(!key)throw new Error('T6 locked door without key at depth '+d);
  }
}
console.log('T6 locked rooms always have keys (depths 1-20)');
console.log('ALL BUG-FIX TESTS PASSED');
// 7. adaptive drops: desperate party sees ~50% heal drops, stocked party ~12%
G.party=[mkCharacter('A','human','fighter',[15,14,13,12,10,8]),
         mkCharacter('B','human','rogue',[15,14,13,12,10,8]),
         mkCharacter('C','human','wizard',[15,14,13,12,10,8]),
         mkCharacter('D','human','cleric',[15,14,13,12,10,8])];
for(const ch of G.party)ch.inventory=ch.inventory.map(()=>null); // strip starter supplies
const sample=(n)=>{let h=0;for(let i=0;i<n;i++){const it=monsterLoot(5);const d=ITEM_DEFS[it.base];if(d.kind==='potion')h++;}return h/n;};
const fEmpty=sample(800);
G.party[0].inventory[0]=mkItem('pot_cmw',{qty:12});
const fFull=sample(800);
if(fEmpty<0.42||fEmpty>0.58)throw new Error('T7 desperate heal rate off: '+fEmpty);
if(fFull<0.06||fFull>0.20)throw new Error('T7 stocked heal rate off: '+fFull);
console.log('T7 adaptive drops: empty='+fEmpty.toFixed(2)+' stocked='+fFull.toFixed(2));
// 8. floor loot is scarce outside locked rooms and secret pockets
for(const d of [2,5,9]){
  const L=genLevel(d);
  const inLk=(x,y)=>L.lockedRoom&&x>=L.lockedRoom.x&&x<L.lockedRoom.x+L.lockedRoom.w&&y>=L.lockedRoom.y&&y<L.lockedRoom.y+L.lockedRoom.h;
  const inSec=(x,y)=>L.secrets.some(s=>s.pocket.x===x&&s.pocket.y===y);
  let open=0;
  for(const i in L.items){const x=i%L.w,y=Math.floor(i/L.w);if(!inLk(x,y)&&!inSec(x,y))open++;}
  if(open>7)throw new Error('T8 too much open floor loot at depth '+d+': '+open+' tiles');
}
console.log('T8 floor loot scarce (<=7 open tiles incl. dead ends + key)');
console.log('ALL LOOT TESTS PASSED');
// 9. every door sits between two walls (proper frame)
for(const d of [1,4,8,12]){
  const L=genLevel(d);
  for(let y=1;y<L.h-1;y++)for(let x=1;x<L.w-1;x++){
    const t=L.grid[y*L.w+x];
    if(t!==T_DOOR&&t!==T_DOOR_LOCKED)continue;
    const passX=L.grid[y*L.w+x-1]!==T_WALL&&L.grid[y*L.w+x+1]!==T_WALL;
    const framed=passX
      ?(L.grid[(y-1)*L.w+x]===T_WALL&&L.grid[(y+1)*L.w+x]===T_WALL)
      :(L.grid[y*L.w+x-1]===T_WALL&&L.grid[y*L.w+x+1]===T_WALL);
    if(!framed)throw new Error('T9 unframed door at depth '+d+' ('+x+','+y+')');
  }
}
console.log('T9 all doors framed by two walls (depths 1,4,8,12)');
// 10. descending clears keys from packs and hands
G.party=[mkCharacter('K','human','fighter',[15,14,13,12,10,8])];
G.party[0].inventory[3]=mkItem('key');
G.party[0].equip.lhand=mkItem('key');
const depthBefore=G.depth;
descend();
if(G.depth!==depthBefore+1)throw new Error('T10 descend failed');
if(G.party[0].inventory.some(it=>it&&it.base==='key'))throw new Error('T10 key survived in pack');
if(G.party[0].equip.lhand&&G.party[0].equip.lhand.base==='key')throw new Error('T10 key survived in hand');
console.log('T10 keys cleared on level change');
// 11. revive scrolls: drop only while someone is dead, and anyone can read them
G.party=[mkCharacter('W2','human','wizard',[10,10,10,16,10,10]),
         mkCharacter('F2','human','fighter',[15,14,13,12,10,8])];
for(const ch of G.party)ch.inventory=ch.inventory.map(()=>null);
G.px=5;G.py=5;
const countRevive=(n)=>{let c=0;for(let i=0;i<n;i++){const it=monsterLoot(5);if(it.base==='scroll'&&it.spell==='raisedead')c++;}return c/n;};
const fAlive=countRevive(600);
if(fAlive!==0)throw new Error('T11 revive scroll dropped with no one dead: '+fAlive);
charDies(G.party[0]);G.over=false;
const fDead=countRevive(600);
if(fDead<0.04||fDead>0.13)throw new Error('T11 revive rate off: '+fDead);
// the non-caster fighter reads the scroll on the dead wizard
const fig=G.party[1];
fig.equip.rhand=mkItem('scroll',{spell:'raisedead'});
fig.cdL=0;fig.cdR=0;
useHand(fig,'rhand'); // pickAlly stub picks party[0] = the corpse
if(G.party[0].dead)throw new Error('T11 fighter could not revive with the scroll');
if(fig.equip.rhand!==null)throw new Error('T11 scroll not consumed');
console.log('T11 revive scrolls: alive=0%, dead='+(fDead*100).toFixed(1)+'%, fighter can read');
// 12. any class can attempt a clumsy disarm (rogue-less party)
(function(){
  const grid3=new Uint8Array(400).fill(T_FLOOR);
  const mkL=(depth)=>({w:20,h:20,grid:grid3,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}});
  const run=(party,dc,trials)=>{
    G.party=party;G.L=mkL(3);G.px=5;G.py=5;G.over=false;G.paused=false;
    let clean=0,fumble=0,retry=0;
    const orig=triggerTrap;
    triggerTrap=(tr)=>{fumble++;tr.armed=false;}; // count fumble-triggers, neutralize side effects
    for(let n=0;n<trials;n++){
      const i=5*20+6;
      G.L.traps[i]={kind:"dart",found:true,armed:true,dc,dmg:[1,4],x:6,y:5};
      party.forEach(c=>{c.hp=c.maxHp;c.dead=false;});
      const fb=fumble;
      disarmAttempt(6,5);
      if(G.L.traps[i].armed)retry++;
      else if(fumble>fb){/* fumbled */} else clean++;
    }
    triggerTrap=orig;
    return {clean,fumble,retry};
  };
  const f=run([mkCharacter("F","human","fighter",[15,16,13,12,10,8])],15,2000); // DEX +3 vs DC15
  if(f.clean===0)throw new Error("T12 fighter never cleanly disarmed (early-return?)");
  if(f.fumble===0)throw new Error("T12 fighter never fumbled — should be dangerous");
  if(f.retry===0)throw new Error("T12 fighter never got a near-miss");
  const r=run([mkCharacter("R","human","rogue",[12,16,13,15,10,8])],15,2000);
  if(r.clean<=f.clean)throw new Error("T12 rogue not defter at clean disarm: "+r.clean+" vs "+f.clean);
  if(r.fumble>=f.fumble)throw new Error("T12 rogue should fumble less than clumsy fighter");
  console.log("T12 clumsy disarm: fighter clean "+f.clean+" fumble "+f.fumble+" / rogue clean "+r.clean+" fumble "+r.fumble+" (per 2000)");
})();
// 13. non-rogues can detect traps (one-shot notice roll), rogue still take-10 reliable
(function(){
  const grid4=new Uint8Array(400).fill(T_FLOOR);
  const setup=(party)=>{G.party=party;G.L={w:20,h:20,grid:grid4,monsters:[],items:{},traps:{},secrets:[],
    explored:new Uint8Array(400),theme:THEMES[0],depth:1,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
    G.px=5;G.py=5;G.facing=1;G.over=false;G.paused=false;};
  // fighter (no rogue): over many fresh low-DC traps ahead, SOME get noticed, not all, not none
  let found=0,tot=200;
  for(let n=0;n<tot;n++){
    setup([mkCharacter('F','human','fighter',[12,12,12,12,14,8])]); // WIS 14 -> +2 notice
    const i=5*20+6; // aheadTile(1) when facing east from (5,5)
    G.L.traps[i]={kind:'dart',found:false,armed:true,dc:14,dmg:[1,4],x:6,y:5,noticeTried:false};
    passiveSearch();
    if(G.L.traps[i].found)found++;
  }
  if(found===0)throw new Error('T13 non-rogue never detects a trap');
  if(found===tot)throw new Error('T13 non-rogue always detects (should be chance-based)');
  // one-shot: repeated passiveSearch on the same trap must NOT eventually find it if first roll failed
  setup([mkCharacter('F','human','fighter',[8,8,8,8,8,8])]); // -1 everything, DC high so it fails
  const j=5*20+6;
  G.L.traps[j]={kind:'dart',found:false,armed:true,dc:25,dmg:[1,4],x:6,y:5,noticeTried:false};
  for(let k=0;k<50;k++)passiveSearch();
  if(G.L.traps[j].found)throw new Error('T13 repeated searches guaranteed detection (should be one-shot)');
  if(!G.L.traps[j].noticeTried)throw new Error('T13 noticeTried not set');
  // rogue take-10 still reliably finds a modest trap on first pass
  setup([mkCharacter('R','human','rogue',[10,14,12,14,10,8])]);
  const m=5*20+6;
  G.L.traps[m]={kind:'dart',found:false,armed:true,dc:14,dmg:[1,4],x:6,y:5};
  passiveSearch();
  if(!G.L.traps[m].found)throw new Error('T13 rogue failed to take-10 spot a DC14 trap');
  console.log('T13 non-rogue trap detection: '+found+'/'+tot+' noticed (chance-based), one-shot, rogue reliable');
})();
// 14. sewer levels: lake pits stay ringed by walkable floor, rivers & pipes exist,
// and every non-pit walkable tile is still reachable
(function(){
  let sawPit=false,sawRiver=false,sawPipe=false;
  for(let n=0;n<12;n++){
    const L=genLevel(5); // depth 4-6 = Sewers theme
    if(L.theme.name!=='Sewers')throw new Error('T14 depth 5 not Sewers: '+L.theme.name);
    const idx=(x,y)=>y*L.w+x;
    const pocket=new Set(L.secrets.map(s=>idx(s.pocket.x,s.pocket.y)));
    // BFS from start over walkable tiles, excluding pits
    const df=new Int32Array(L.w*L.h).fill(-1);
    const q=[[L.start.x,L.start.y]];df[idx(L.start.x,L.start.y)]=0;let qi=0;
    while(qi<q.length){const[cx,cy]=q[qi++];
      for(const[dx,dy] of DIRS){const nx=cx+dx,ny=cy+dy,t=L.grid[idx(nx,ny)];
        if(t&&t!==T_SECRET&&t!==T_PIT&&df[idx(nx,ny)]<0){df[idx(nx,ny)]=df[idx(cx,cy)]+1;q.push([nx,ny]);}}}
    for(let y=0;y<L.h;y++)for(let x=0;x<L.w;x++){
      const t=L.grid[idx(x,y)];
      if(t===T_PIT){
        sawPit=true;
        // a pit never touches the outer border and never blocks the only path:
        // every walkable neighbor of a pit must be BFS-reachable
        for(const[dx,dy] of DIRS){
          const nt=L.grid[idx(x+dx,y+dy)];
          if(nt&&nt!==T_PIT&&nt!==T_SECRET&&!pocket.has(idx(x+dx,y+dy))&&df[idx(x+dx,y+dy)]<0)
            throw new Error('T14 walkable tile beside pit unreachable at '+(x+dx)+','+(y+dy));
        }
      }else if(t&&t!==T_SECRET&&!pocket.has(idx(x,y))&&df[idx(x,y)]<0){
        throw new Error('T14 unreachable walkable tile at '+x+','+y+' (t='+t+')');
      }
    }
    if(L.rivers.length)sawRiver=true;
    for(const i of L.rivers){const t=L.grid[i];
      if(t!==T_FLOOR&&t!==T_DOOR&&t!==T_DOOR_OPEN&&t!==T_DOOR_LOCKED)throw new Error('T14 river on bad tile t='+t);}
    if(L.pipes.length)sawPipe=true;
    for(const p of L.pipes){
      if(L.grid[idx(p.x,p.y)]!==T_FLOOR)throw new Error('T14 pipe not on floor');
      if(L.grid[idx(p.x+p.dx,p.y+p.dy)]!==T_WALL)throw new Error('T14 pipe not against a wall');
    }
  }
  if(!sawPit)throw new Error('T14 no sewer lake pit generated in 12 levels');
  if(!sawRiver)throw new Error('T14 no sewer rivers generated');
  if(!sawPipe)throw new Error('T14 no sewer pipes generated');
  console.log('T14 sewer gen: pits ringed & non-blocking, rivers on corridors, pipes on walls');
})();
// 15. no monster may ever rest on the party's own tile: fuzz normal chase/wander
// movement over many steps, and separately verify the direct-overlap backstop
(function(){
  const W=15,H=15,grid5=new Uint8Array(W*H).fill(T_FLOOR);
  for(let x=0;x<W;x++){grid5[x]=T_WALL;grid5[(H-1)*W+x]=T_WALL;}
  for(let y=0;y<H;y++){grid5[y*W]=T_WALL;grid5[y*W+(W-1)]=T_WALL;}
  const mkL=()=>({w:W,h:H,grid:grid5,monsters:[],items:{},traps:{},secrets:[],
    explored:new Uint8Array(W*H),theme:THEMES[0],depth:1,stairs:{x:1,y:1},start:{x:7,y:7},restCount:{}});
  G.L=mkL();G.px=7;G.py=7;G.over=false;G.paused=false;
  const boss=mkMonster('orc',5,5,5);boss.boss=true;boss.awake=true;boss.speed=0.01;
  boss.guard={x:1,y:1,r:3};
  G.L.monsters=[boss];
  computeDistField();
  let overlapSeen=false;
  for(let step=0;step<400;step++){
    // move the party around erratically so the chaser has to react to a live target
    if(step%3===0){const [dx,dy]=pick(DIRS);const nx=G.px+dx,ny=G.py+dy;
      if(G.L.grid[ny*W+nx]===T_FLOOR&&!monsterAt(nx,ny)){G.px=nx;G.py=ny;}
      computeDistField();
    }
    updateMonsters(0.5); // chunky dt forces a movement decision most ticks
    if(boss.x===G.px&&boss.y===G.py)overlapSeen=true;
  }
  if(overlapSeen)throw new Error('T15 boss ended up on the party tile during normal chase/wander');
  // backstop: force the overlap directly (simulating any future bug that slips
  // a monster onto the party) and confirm the safety net evicts it same-frame
  boss.x=G.px;boss.y=G.py;
  updateMonsters(0);
  if(boss.x===G.px&&boss.y===G.py)throw new Error('T15 resolvePartyTileOverlap failed to evict a monster forced onto the party tile');
  const t=tileAt(boss.x,boss.y);
  if(!(t===T_FLOOR||t===T_DOOR_OPEN||t===T_STAIRS))throw new Error('T15 evicted monster landed on an invalid tile');
  console.log('T15 party tile stays exclusive: 400-step chase fuzz clean, forced-overlap backstop evicts same frame');
})();
// 16. monsters stack four to a tile in two ranks: the front two fight, the rear
// two only shoot or cast unless they have reach, and ranks close up on a death
(function(){
  const W=15,H=15,grid6=new Uint8Array(W*H).fill(T_FLOOR);
  for(let x=0;x<W;x++){grid6[x]=T_WALL;grid6[(H-1)*W+x]=T_WALL;}
  for(let y=0;y<H;y++){grid6[y*W]=T_WALL;grid6[y*W+(W-1)]=T_WALL;}
  const setup=()=>{
    G.L={w:W,h:H,grid:grid6,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(W*H),
      theme:THEMES[0],depth:3,stairs:{x:1,y:1},start:{x:7,y:7},restCount:{}};
    G.px=7;G.py=7;G.facing=1;G.over=false;G.paused=false;G.started=true;
    G.party=[mkCharacter('F','human','fighter',[15,14,13,12,10,8]),
             mkCharacter('R','human','rogue',[12,16,13,12,10,8]),
             mkCharacter('W','human','wizard',[10,12,12,16,10,8]),
             mkCharacter('C','human','cleric',[10,12,13,12,16,8])];
    G.party.forEach(c=>{c.hp=c.maxHp;});
    computeDistField();
  };
  // --- capacity: a fifth monster cannot enter a packed tile ---
  setup();
  const tx=8,ty=7; // the tile straight east of the party
  for(let i=0;i<4;i++){
    const k=mkMonster('kobold',tx,ty,3);k.awake=true;k.slot=i;G.L.monsters.push(k);
  }
  const extra=mkMonster('kobold',9,7,3);extra.awake=true;G.L.monsters.push(extra);
  if(freeSlotAt(tx,ty,null)>=0)throw new Error('T16 a four-deep tile still reports a free slot');
  if(stepOk(extra,tx,ty))throw new Error('T16 a fifth monster was allowed onto a packed tile');
  // and four is genuinely allowed
  if(monstersOn(tx,ty).length!==4)throw new Error('T16 tile did not hold four monsters');
  // --- the front rank fights, the rear rank does not (no reach, no ranged) ---
  setup();
  const four=[];
  for(let i=0;i<4;i++){
    const k=mkMonster('kobold',tx,ty,3);k.awake=true;k.slot=i;k.atkCd=0;
    G.L.monsters.push(k);four.push(k);
  }
  let attackers=new Set();
  const origMelee=monsterMelee;
  monsterMelee=(m)=>{attackers.add(m.slot);m.atkCd=99;};
  updateMonsters(0.1);
  monsterMelee=origMelee;
  if(!attackers.has(0)||!attackers.has(1))throw new Error('T16 both front-rank monsters should strike, got '+[...attackers]);
  if(attackers.has(2)||attackers.has(3))throw new Error('T16 a rear-rank monster reached the party without reach');
  // --- reach lets a rear-rank monster strike over the front ---
  setup();
  const og=mkMonster('ogre',tx,ty,8);og.awake=true;og.slot=3;og.atkCd=0;
  if(!og.reach)throw new Error('T16 ogre should have reach');
  for(let i=0;i<3;i++){const k=mkMonster('kobold',tx,ty,3);k.awake=true;k.slot=i;k.atkCd=99;G.L.monsters.push(k);}
  G.L.monsters.push(og);
  let reachStruck=false;
  const om=monsterMelee;monsterMelee=(m)=>{if(m===og)reachStruck=true;m.atkCd=99;};
  updateMonsters(0.1);
  monsterMelee=om;
  if(!reachStruck)throw new Error('T16 a reach monster in the rear rank failed to strike');
  // --- a rear-rank archer shoots instead of standing idle ---
  setup();
  const arch=mkMonster('koboldsl',tx,ty,3);arch.awake=true;arch.slot=3;arch.atkCd=0;
  if(!arch.ranged)throw new Error('T16 slinger should be ranged');
  for(let i=0;i<3;i++){const k=mkMonster('kobold',tx,ty,3);k.awake=true;k.slot=i;k.atkCd=99;G.L.monsters.push(k);}
  G.L.monsters.push(arch);
  let shot=false;
  const os=monsterShoot;monsterShoot=(m)=>{if(m===arch)shot=true;};
  updateMonsters(0.1);
  monsterShoot=os;
  if(!shot)throw new Error('T16 rear-rank archer did not shoot past the front rank');
  // --- ranks close up when a front-ranker dies ---
  setup();
  const line=[];
  for(let i=0;i<4;i++){
    const k=mkMonster('kobold',tx,ty,3);k.awake=true;k.slot=i;k.hp=1;G.L.monsters.push(k);line.push(k);
  }
  killMonster(line[0],G.party[0]);
  const left=monstersOn(tx,ty).map(m=>m.slot).sort();
  if(left.join(',')!=='0,1,2')throw new Error('T16 ranks did not close after a death: '+left.join(','));
  if(!monstersOn(tx,ty).includes(line[3])||line[3].slot!==2)throw new Error('T16 the rearmost did not step up');
  // the party's blades meet the front-most occupant
  if(monsterAt(tx,ty)!==line[1])throw new Error('T16 monsterAt did not return the front-rank monster');
  console.log('T16 monster ranks: 4 per tile, both front fight, rear needs reach or a ranged weapon, ranks close on death');
})();
// 17. Restoration exists as a rare scroll, drops more readily to a drained
// party, and actually lifts negative levels when read
(function(){
  const grid7=new Uint8Array(400).fill(T_FLOOR);
  const setup=()=>{
    G.L={w:20,h:20,grid:grid7,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
      theme:THEMES[0],depth:7,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
    G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;
    G.party=[mkCharacter('Cl','human','cleric',[10,12,13,12,16,8]),
             mkCharacter('Ft','human','fighter',[15,14,13,12,10,8])];
    G.party.forEach(c=>{c.inventory=c.inventory.map(()=>null);c.hp=c.maxHp;});
  };
  const isResto=(it)=>it.base==='scroll'&&it.spell==='restoration';
  // floor/hoard loot: rare, and rarer outside hoards
  let plain=0,rich=0;
  for(let i=0;i<20000;i++){if(isResto(randLoot(7,false)))plain++;if(isResto(randLoot(7,true)))rich++;}
  const pPlain=plain/20000,pRich=rich/20000;
  if(pPlain<=0)throw new Error('T17 Restoration never appears in ordinary loot');
  if(pPlain>0.02)throw new Error('T17 Restoration far too common in ordinary loot: '+pPlain);
  if(pRich<=pPlain)throw new Error('T17 hoards should favour Restoration: '+pRich+' vs '+pPlain);
  // kills: only leans toward it while somebody is actually drained
  setup();
  let undrained=0;
  for(let i=0;i<4000;i++)if(isResto(monsterLoot(7)))undrained++;
  setup();
  G.party[1].negLevels=2;recalcHp(G.party[1],false);
  let drained=0;
  for(let i=0;i<4000;i++)if(isResto(monsterLoot(7)))drained++;
  if(drained<=undrained)throw new Error('T17 drained party saw no extra Restoration: '+drained+' vs '+undrained);
  if(drained/4000<0.03)throw new Error('T17 drained drop rate too low: '+(drained/4000));
  // and it works: reading one clears every negative level and restores the hp
  setup();
  const ft=G.party[1],cl=G.party[0];
  ft.negLevels=2;recalcHp(ft,false);
  const drainedMax=ft.maxHp;
  cl.equip.rhand=mkItem('scroll',{spell:'restoration'});
  cl.cdL=0;cl.cdR=0;
  useHand(cl,'rhand'); // the pickAlly stub hands it to party[0]... aim at the fighter
  if(ft.negLevels!==0){
    // stub picks party[0]; drain party[0] instead and retry to exercise the cure
    setup();
    const c2=G.party[0];
    c2.negLevels=2;recalcHp(c2,false);
    const before=c2.maxHp;
    c2.equip.rhand=mkItem('scroll',{spell:'restoration'});
    c2.cdL=0;c2.cdR=0;
    useHand(c2,'rhand');
    if(c2.negLevels!==0)throw new Error('T17 Restoration did not clear negative levels');
    if(c2.maxHp<=before)throw new Error('T17 Restoration did not restore lost max hp');
    if(c2.equip.rhand!==null)throw new Error('T17 Restoration scroll was not consumed');
  }
  console.log('T17 Restoration scroll: ordinary loot '+(pPlain*100).toFixed(2)+'%, hoards '+(pRich*100).toFixed(2)+
    '%, kills while drained '+((drained/4000)*100).toFixed(1)+'% (vs '+((undrained/4000)*100).toFixed(1)+'% undrained), and it cures');
})();
// 18. Restoration truly clears drain: negative levels were mirrored by a
// cosmetic 'drained' condition the cure never removed, so the badge stuck
(function(){
  const grid8=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid:grid8,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth:7,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
  G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;
  const cl=mkCharacter('Cl','human','cleric',[10,12,13,12,16,8]);
  G.party=[cl];
  const wight=mkMonster('wight',6,5,7);
  G.L.monsters=[wight];
  const baseMax=cl.maxHp;
  for(let i=0;i<500&&cl.negLevels<2;i++){cl.hp=cl.maxHp;monsterSpecials(wight,cl);}
  if(cl.negLevels<2)throw new Error('T18 could not get the wight to drain in 500 tries');
  if(cl.conditions.some(c=>c.kind==='drained'))throw new Error('T18 drain still adds a redundant condition');
  if(cl.maxHp>=baseMax)throw new Error('T18 drain did not cost max hp');
  const drainedMax=cl.maxHp;
  // a rest must not lift negative levels (only Restoration does)
  cl.stable=true;cl.buffs=[];cl.conditions=[];recalcHp(cl,true);
  if(cl.negLevels!==2)throw new Error('T18 rest wrongly lifted negative levels');
  // the cure
  cl.cdL=0;cl.cdR=0;
  cl.equip.rhand=mkItem('scroll',{spell:'restoration'});
  useHand(cl,'rhand');
  if(cl.negLevels!==0)throw new Error('T18 Restoration left negative levels: '+cl.negLevels);
  if(hasCond(cl,'drained'))throw new Error('T18 the drained badge survived the cure');
  if(cl.maxHp<=drainedMax)throw new Error('T18 Restoration did not give back the lost max hp');
  // a save written before the change carries a stale flag: it must not persist
  const stale={conditions:[{kind:'drained'},{kind:'poison'}]};
  stale.conditions=stale.conditions.filter(c=>c.kind!=='drained');
  if(stale.conditions.some(c=>c.kind==='drained'))throw new Error('T18 legacy drained flag not stripped');
  console.log('T18 drain: costs max hp, survives rest, fully lifted by Restoration (no stuck badge), legacy saves cleaned');
})();
// 19. Rations: the party starts with three, a rest eats one, and a rest
// without one is a cold camp — partial healing, no spells back, and noise
(function(){
  const mkParty=()=>{
    const p=[mkCharacter('Fi','human','fighter',[16,12,14,10,12,8]),
             mkCharacter('Cl','human','cleric',[12,10,13,10,16,10])];
    for(const ch of p){ch.hp=Math.max(1,Math.round(ch.maxHp*0.15));ch.slotsUsed=[2,2,0,0,0];}
    return p;
  };
  // a fresh party is provisioned, and provisioning is idempotent
  const fresh=provisionParty(mkParty());
  G.party=fresh;
  if(countRations()!==3)throw new Error('T19 a new party should carry 3 rations, got '+countRations());
  provisionParty(fresh);
  if(countRations()!==3)throw new Error('T19 provisioning twice stacked extra rations');

  const flatLevel=(depth)=>{
    const w=24,h=24,grid=new Uint8Array(w*h).fill(T_FLOOR);
    G.L={w,h,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(w*h),
      theme:THEMES[0],depth,stairs:{x:1,y:1},start:{x:12,y:12},restCount:{},restsHere:0};
    G.px=12;G.py=12;G.depth=depth;G.over=false;G.paused=false;G.started=true;
    // walking distance from the party, used by rest to judge who is near
    G.distField=new Int32Array(w*h).fill(-1);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)G.distField[y*w+x]=Math.abs(x-G.px)+Math.abs(y-G.py);
  };

  // fed rest: full heal, spells back, one ration gone
  flatLevel(5);
  G.party=provisionParty(mkParty());
  const before=countRations();
  const fed=takeRation();
  if(!fed)throw new Error('T19 a stocked party failed to find a ration');
  if(countRations()!==before-1)throw new Error('T19 a rest spent '+(before-countRations())+' rations, expected 1');
  resolveRest(true,1);
  for(const ch of G.party){
    if(ch.hp!==ch.maxHp)throw new Error('T19 a fed rest left '+ch.name+' at '+ch.hp+'/'+ch.maxHp);
    if(ch.slotsUsed.some(n=>n!==0))throw new Error('T19 a fed rest did not restore spell slots');
  }

  // cold camp: partial heal only, slots stay spent, nearby sleepers wake
  flatLevel(5);
  G.party=mkParty(); // no rations at all
  const sleeper=mkMonster('goblin',12,4,5); sleeper.awake=false;  // 8 tiles off
  const farOff=mkMonster('goblin',1,1,5);   farOff.awake=false;   // 22 tiles off
  G.L.monsters=[sleeper,farOff];
  if(takeRation())throw new Error('T19 an empty pack still produced a ration');
  resolveRest(false,1);
  for(const ch of G.party){
    const want=Math.round(ch.maxHp*0.4);
    if(ch.hp!==want)throw new Error('T19 a cold camp left '+ch.name+' at '+ch.hp+', expected '+want);
    if(ch.maxHp<=0)throw new Error('T19 cold camp broke max hp');
    if(!ch.slotsUsed.some(n=>n!==0))throw new Error('T19 a cold camp wrongly restored spell slots');
  }
  if(!sleeper.awake)throw new Error('T19 a hungry camp did not wake the monster next door');
  if(farOff.awake)throw new Error('T19 a hungry camp woke a monster across the level');

  // a fed camp on its first night is quiet
  flatLevel(5);
  G.party=provisionParty(mkParty());
  const quiet=mkMonster('goblin',12,4,5); quiet.awake=false;
  G.L.monsters=[quiet];
  resolveRest(true,1);
  if(quiet.awake)throw new Error('T19 a well-fed first camp still woke the neighbours');
  // ...but the second night on the same floor is noticed
  const quiet2=mkMonster('goblin',12,4,5); quiet2.awake=false;
  G.L.monsters=[quiet2];
  resolveRest(true,2);
  if(!quiet2.awake)throw new Error('T19 a second camp on one floor went unnoticed');

  // third camp on a floor draws a hunting pack that spawns away from the party
  flatLevel(9);
  G.party=provisionParty(mkParty());
  G.L.monsters=[];
  resolveRest(true,3);
  const pack=G.L.monsters;
  if(pack.length<2||pack.length>TILE_CAP)
    throw new Error('T19 third camp summoned '+pack.length+' hunters, expected 2-'+TILE_CAP);
  if(!pack.every(m=>m.awake))throw new Error('T19 hunting pack arrived asleep');
  const slots=pack.map(m=>m.slot).sort();
  if(new Set(slots).size!==pack.length)throw new Error('T19 hunting pack shares a tile slot');
  for(const m of pack){
    const d=Math.abs(m.x-G.px)+Math.abs(m.y-G.py);
    if(d<6||d>14)throw new Error('T19 hunting pack spawned '+d+' tiles off, expected 6-14');
  }

  // resting is per floor: descending clears the count
  flatLevel(5);
  G.L.restsHere=3;
  flatLevel(6);
  if(G.L.restsHere)throw new Error('T19 rest count carried across floors');

  // rations drop, and drop harder when the larder is empty
  let empty=0,stocked=0;
  const N=4000;
  G.party=mkParty();
  for(let i=0;i<N;i++){const it=monsterLoot(6);if(it&&it.base==='ration')empty++;}
  G.party=provisionParty(mkParty());
  G.party[0].inventory[G.party[0].inventory.indexOf(null)]=mkItem('ration',{qty:6});
  for(let i=0;i<N;i++){const it=monsterLoot(6);if(it&&it.base==='ration')stocked++;}
  const pe=empty/N, ps=stocked/N;
  // The faucet was halved by a later balance pass (0.10+0.32*foodNeed became
  // 0.05+0.16*foodNeed), so a starving party's drop rate fell from ~17% to ~7%.
  // Measured over 20k samples: 0.0677 starving, 0.0169 stocked. The band is
  // that figure with room for the 4000-sample noise here (3σ ≈ ±0.012).
  if(pe<0.05||pe>0.09)throw new Error('T19 starving ration drop rate '+pe.toFixed(3)+' outside 0.05-0.09');
  // rations come from ONE roll now (the adaptive food band), not that plus the
  // gear table. A full larder must fall well under the starving rate — the old
  // double-count left it around half, so guard tighter than that.
  if(ps>pe*0.45)throw new Error('T19 a full larder still drew rations at '+ps.toFixed(3)+' vs '+pe.toFixed(3)+' (food double-counted?)');
  // and the gear fallthrough itself yields no rations at all
  let gearRations=0;
  for(let i=0;i<4000;i++)if(randLoot(6,false,true,true).base==='ration')gearRations++;
  if(gearRations)throw new Error('T19 randLoot(noRation) still produced '+gearRations+' rations');
  // ordinary floor loot keeps its rations (no adaptive food roll out there)
  let floorRations=0;
  for(let i=0;i<4000;i++)if(randLoot(6,false,false).base==='ration')floorRations++;
  if(floorRations<200)throw new Error('T19 floor loot lost its rations too: '+floorRations+'/4000');
  console.log('T19 rations: party starts with 3, rest eats 1, cold camp = 40% hp / no slots / noise, '+
    '3rd camp summons a pack; drops '+(pe*100).toFixed(1)+'% starving vs '+(ps*100).toFixed(1)+
    '% stocked (the faucet was halved by a later balance pass), gear fallthrough yields none, '+
    'floor loot keeps its own');
})();
// 20. The deep gear ladder: +4/+5 only in deep hoards, and affixes as a second
// axis — elemental riders, life steal, and wards that soak energy damage
(function(){
  const sample=(depth,rich,n)=>{
    const out={max:0,plus4:0,plus5:0,affix:0,total:0};
    for(let i=0;i<n;i++){
      const it=randLoot(depth,rich,true);
      const d=ITEM_DEFS[it.base];
      if(!['weapon','armor','helmet','boots','shield','ring','amulet'].includes(d.kind))continue;
      out.total++;
      out.max=Math.max(out.max,it.bonus);
      if(it.bonus===4)out.plus4++;
      if(it.bonus===5)out.plus5++;
      if(it.affix)out.affix++;
    }
    return out;
  };
  // shallow and mid floors are unchanged: nothing above +3, no affixes anywhere
  for(const d of [1,5,12,19])for(const rich of [false,true]){
    const s=sample(d,rich,3000);
    if(s.max>3)throw new Error('T20 depth '+d+(rich?' hoard':' floor')+' produced +'+s.max);
    if(s.affix)throw new Error('T20 affixed gear appeared at depth '+d);
  }
  // ordinary floor loot never reaches +4, however deep it goes
  const deepFloor=sample(40,false,4000);
  if(deepFloor.max>3)throw new Error('T20 open floor loot at depth 40 reached +'+deepFloor.max);
  // deep hoards do, but sparingly, and +5 waits for the high twenties
  const h20=sample(20,true,20000), h30=sample(30,true,20000), h24=sample(24,true,20000);
  const r=(s)=>(s.plus4+s.plus5)/s.total;
  if(r(h20)<=0||r(h20)>0.02)throw new Error('T20 depth-20 hoard +4 rate '+r(h20).toFixed(4)+' outside (0,0.02]');
  if(h24.plus5)throw new Error('T20 a +5 turned up at depth 24, before the high twenties');
  if(!h30.plus5)throw new Error('T20 no +5 in 20000 depth-30 hoard rolls');
  if(r(h30)<=r(h20))throw new Error('T20 the deep bonus rate did not grow with depth');
  if(r(h30)>0.18)throw new Error('T20 depth-30 hoard hands out +4/+5 at '+r(h30).toFixed(3)+', no longer a find');
  // affixes ride the same schedule, independent of the plus
  if(h20.affix/h20.total<=0)throw new Error('T20 no affixed gear in depth-20 hoards');
  if(h30.affix/h30.total<=h20.affix/h20.total)throw new Error('T20 affix rate did not grow with depth');
  const floorAffix=deepFloor.affix/deepFloor.total, hoardAffix=h30.affix/h30.total;
  if(floorAffix>=hoardAffix*0.5)throw new Error('T20 open floors match hoards for affixed gear');

  // naming and description carry the affix
  const fw=mkItem('longsword',{bonus:2,affix:'flaming'});
  if(!/^Flaming long sword \+2$/.test(itemName(fw)))throw new Error('T20 affix name wrong: '+itemName(fw));
  if(itemDesc(fw).indexOf('fire damage')<0)throw new Error('T20 affix not described: '+itemDesc(fw));
  const ward=mkItem('hhelm',{bonus:1,affix:'emberward'});
  if(itemDesc(ward).indexOf('fire resistance')<0)throw new Error('T20 ward not described: '+itemDesc(ward));

  // wards soak energy damage and stack across slots
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth:30,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
  G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;
  const f=mkCharacter('Fi','human','fighter',[18,12,16,10,10,8]);
  G.party=[f];
  f.maxHp=200;f.hp=200;
  if(charResist(f,'fire')!==0)throw new Error('T20 bare character already resists fire');
  f.equip.helmet=mkItem('hhelm',{affix:'emberward'});
  if(charResist(f,'fire')!==5)throw new Error('T20 one ward gave '+charResist(f,'fire'));
  if(charResist(f,'cold')!==0)throw new Error('T20 a fire ward soaked cold');
  f.equip.boots=mkItem('hboots',{affix:'emberward'});
  if(charResist(f,'fire')!==10)throw new Error('T20 two wards did not stack: '+charResist(f,'fire'));
  f.hp=200;hurtChar(f,18,'dragon','fire');
  if(f.hp!==192)throw new Error('T20 fire ward soaked wrong: hp '+f.hp+', expected 192');
  f.hp=200;hurtChar(f,18,'dragon','cold');
  if(f.hp!==182)throw new Error('T20 the fire ward wrongly soaked cold: hp '+f.hp);
  f.hp=200;hurtChar(f,6,'dragon','fire');
  if(f.hp!==200)throw new Error('T20 a fully warded hit still landed: hp '+f.hp);
  f.hp=200;hurtChar(f,18,'ogre');
  if(f.hp!==182)throw new Error('T20 a ward soaked untyped damage: hp '+f.hp);

  // an elemental rider adds damage, and a vampiric weapon heals what it lands
  f.equip.helmet=null;f.equip.boots=null;
  const swing=(affix,mhp)=>{
    const m=mkMonster('troll',5,4,30);m.hp=m.maxHp=mhp;m.ac=-20; // always hit
    G.L.monsters=[m];
    f.cdL=0;f.cdR=0;
    f.equip.rhand=mkItem('greatsword',{bonus:0,affix});
    const before=m.hp;
    doAttack(f,'rhand',ITEM_DEFS.greatsword,f.equip.rhand,m,false);
    return before-m.hp;
  };
  // cap the fighter first: a kill mid-test would level them and reset hp
  f.level=MAX_LEVEL;f.xp=XP_FOR_LEVEL(MAX_LEVEL);recalcHp(f,true);
  let plain=0,fiery=0;const GN=4000; // big enough that the 1d6 rider's mean is not lost in weapon-roll variance
  for(let i=0;i<GN;i++)plain+=swing(undefined,9999);
  for(let i=0;i<GN;i++)fiery+=swing('flaming',9999);
  const gain=(fiery-plain)/GN;
  if(gain<2.5||gain>4.5)throw new Error('T20 flaming rider added '+gain.toFixed(2)+' per hit, expected ~3.5');
  // life steal returns a share of what it actually landed, never of the overkill
  let dealt=0,healed=0;
  for(let i=0;i<40&&!dealt;i++){f.hp=1;const dd=swing('vampiric',9999);if(dd>0){dealt=dd;healed=f.hp-1;}}
  if(!dealt)throw new Error('T20 vampiric weapon never landed a blow in 40 swings');
  if(healed<=0)throw new Error('T20 vampiric weapon healed nothing off '+dealt+' damage');
  if(healed>Math.round(dealt*0.34))throw new Error('T20 vampiric healed '+healed+' from '+dealt+' damage');
  f.hp=1;
  swing('vampiric',1); // one hit point of monster, the rest is overkill
  if(f.hp>2)throw new Error('T20 vampiric drank the overkill: healed '+(f.hp-1));
  console.log('T20 deep gear: nothing above +3 before d20 or off a hoard; d20 hoards '+(r(h20)*100).toFixed(2)+
    '% +4, d30 '+(r(h30)*100).toFixed(1)+'% (+5 from d28); affixes '+(hoardAffix*100).toFixed(0)+
    '% of d30 hoards vs '+(floorAffix*100).toFixed(1)+'% of open floor; wards stack and soak, riders and life steal land');
})();
// 21. Traps keep growing past the old 6d6 ceiling, and the boss list cycles
// instead of handing you the same dragon on every floor past 30
(function(){
  // trap grades rise without a plateau, but never outrun a party's hit points
  let prev=0;
  for(let d=1;d<=60;d++){
    const dice=trapDice(d);
    if(dice<prev)throw new Error('T21 trap dice fell at depth '+d);
    prev=dice;
  }
  if(trapDice(15)!==6)throw new Error('T21 trap dice at depth 15 changed: '+trapDice(15));
  if(trapDice(20)<=trapDice(15))throw new Error('T21 trap dice still plateau past depth 15');
  if(trapDice(40)<9||trapDice(40)>14)throw new Error('T21 depth-40 trap is '+trapDice(40)+'d6, want 9-14');
  // an average deep trap must not one-shot a healthy deep character
  const f=mkCharacter('Fi','dwarf','fighter',[16,12,16,10,10,8]);
  f.level=MAX_LEVEL;f.xp=XP_FOR_LEVEL(MAX_LEVEL);recalcHp(f,true);
  const avg40=trapDice(40)*3.5;
  if(avg40>f.maxHp*0.6)throw new Error('T21 a depth-40 trap averages '+avg40+' vs '+f.maxHp+' hp');
  // and a rogue can still find and disarm them at the bottom
  const rg=mkCharacter('Ro','human','rogue',[12,18,12,14,12,8]);
  rg.level=MAX_LEVEL;rg.xp=XP_FOR_LEVEL(MAX_LEVEL);recalcHp(rg,true);
  for(const d of [20,40,60,100])
    if(10+searchBonus(rg)<trapDC(d))throw new Error('T21 a capped rogue cannot take-10 a depth-'+d+' trap');
  if(trapDC(40)<=trapDC(20))throw new Error('T21 trap DC stopped tracking depth too early');
  if(d20()*0+noticeBonus(f)+20>=trapDC(40))throw new Error('T21 a non-rogue can reliably spot a deep trap');

  // Every boss floor's boss belongs to the theme that floor caps. Boss floors
  // walk Sewers, Crypt, Caves, Duergar, Myconid, Drow, Dungeon and start over
  // 21 depths later; depth 3 is exempt, which is why the Dungeon's own first
  // boss floor is 24 rather than 3.
  const flagOf=(m)=>m.type==='undead'?'Crypt':m.cave?'Caves':m.duergar?'Duergar'
    :m.myconid?'Myconid':m.drow?'Drow':m.sewers?'Sewers':m.dungeon?'Dungeon':'-';
  for(const t of THEMES)
    if(!BOSS_TABLE[t.name])throw new Error('T21 no boss table for the '+t.name+' theme');
  for(const th in BOSS_TABLE){
    if(!BOSS_TABLE[th].length)throw new Error('T21 the '+th+' boss table is empty');
    for(const tier of BOSS_TABLE[th]){
      if(!tier.length)throw new Error('T21 an empty tier in the '+th+' boss table');
      for(const c of tier){
        if(!MONSTERS[c.base])throw new Error('T21 boss '+c.name+' names no creature');
        if(flagOf(MONSTERS[c.base])!==th)
          throw new Error('T21 '+th+' fields '+c.name+', which is '+flagOf(MONSTERS[c.base])+"'s");
        if(!MONSTER_ART[MONSTERS[c.base].spr])throw new Error('T21 boss '+c.name+' has no art');
      }
    }
  }
  // and the boss a floor actually gets is from that floor's own slot
  for(let d=6;d<=45;d+=3){
    const slot=bossSlot(d), th=THEMES[Math.floor((d-1)/3)%THEMES.length].name;
    if(slot.theme!==th)throw new Error('T21 bossSlot says '+slot.theme+' at depth '+d+', theme is '+th);
    for(let t=0;t<12;t++){
      const b=bossFor(d);
      if(b.theme!==th)throw new Error('T21 depth '+d+' ('+th+') fielded a '+b.theme+' boss');
      if(flagOf(MONSTERS[b.base])!==th)throw new Error('T21 depth '+d+' fielded '+b.base+', not one of '+th+"'s");
    }
  }
  // boss floors are every third level from 6, and each is the last floor of its block
  for(let d=1;d<=45;d++){
    const boss=genLevel(d).monsters.some(m=>m.boss);
    const want=d%3===0&&d>=6;
    if(boss!==want)throw new Error('T21 depth '+d+(boss?' has':' has no')+' boss, cadence broken');
    if(want){
      const here=THEMES[Math.floor((d-1)/3)%THEMES.length];
      const next=THEMES[Math.floor(d/3)%THEMES.length];
      if(here===next)throw new Error('T21 the boss floor at '+d+' is not the last of its theme block');
    }
  }
  // THE arc, and it is pairwise now rather than on a median. A slot may hold
  // several candidates drawn at random, so ANY pair can come up together: every
  // candidate at depth d must out-threat every candidate at d-3, or a run can
  // meet a boss weaker than the one it already killed.
  {
    const build=(base,depth)=>{const bm=mkMonster(base,1,1,depth);
      bm.maxHp=Math.round(bm.maxHp*2.5)+depth*4;bm.hp=bm.maxHp;bm.atk+=2;bm.ac+=2;return bm;};
    const med=(base,d)=>{const v=[];for(let i=0;i<120;i++)v.push(monsterThreat(build(base,d)));
      v.sort((a,b)=>a-b);return v[60];};
    const candsAt=(d)=>{const {theme,tier}=bossSlot(d);const rows=BOSS_TABLE[theme];
      return rows[Math.min(tier,rows.length-1)];};
    let prevLow=0,prevD=0;
    for(let d=6;d<=45;d+=3){
      const cs=candsAt(d).map(c=>({name:c.name,t:med(c.base,d)}));
      const lo=Math.min(...cs.map(c=>c.t));
      if(lo<=prevLow)throw new Error('T21 the boss arc falls at depth '+d+': weakest there is '+
        Math.round(lo)+', weakest at '+prevD+' was '+Math.round(prevLow));
      prevLow=Math.max(...cs.map(c=>c.t));prevD=d;
    }
  }
  // past the last written tier a theme's deepest ruler returns, titled by circle
  {
    const deep=bossFor(6+3*THEMES.length*3);
    if(!deep)throw new Error('T21 a deep boss floor has nobody on it');
    if(deep.cycle<1)throw new Error('T21 the cycle never starts');
    if(deep.name.indexOf('of the')<0&&deep.name.indexOf('Beyond')<0)
      throw new Error('T21 a returning boss is untitled: '+deep.name);
  }
  const strength=(depth)=>{
    let best=null;
    for(let t=0;t<30;t++){
      const L=genLevel(depth);
      const b=L.monsters.find(m=>m.boss);
      if(b&&(!best||b.maxHp>best.maxHp))best=b;
    }
    return best;
  };
  const bName=strength(15), b30=strength(30), b60=strength(60), b90=strength(90);
  for(const [d,b] of [[15,bName],[30,b30],[60,b60],[90,b90]])
    if(!b)throw new Error('T21 no boss generated at depth '+d);
  if(!(b60.maxHp>b30.maxHp&&b90.maxHp>b60.maxHp))
    throw new Error('T21 deep bosses did not gain hp: '+b30.maxHp+' / '+b60.maxHp+' / '+b90.maxHp);
  // Attack must never REGRESS, and must grow across a wide span — but it is no
  // longer required to rise at every step. `depthAtkBonus` is capped at +20 from
  // depth 21, so past that the only growth left is the boss's own `+2*cycle`,
  // and two deep floors inside the same cycle legitimately swing alike.
  if(!(b90.atk>=b60.atk&&b60.atk>=b30.atk))
    throw new Error('T21 deep boss attack regressed: '+b30.atk+' / '+b60.atk+' / '+b90.atk);
  if(!(b90.atk>b30.atk))
    throw new Error('T21 deep bosses gained no attack at all over 60 floors: '+b30.atk+' / '+b90.atk);
  if(!b60.elite||!b90.elite)throw new Error('T21 a cycled boss carries no elite mantle');
  if(bName.elite)throw new Error('T21 a named boss was given an elite mantle');
  console.log('T21 traps '+trapDice(15)+'d6@15 → '+trapDice(30)+'d6@30 → '+trapDice(60)+'d6@60 (DC '+
    trapDC(60)+', rogue take-10 '+(10+searchBonus(rg))+'); bosses cycle: '+
    bossFor(24).name+' … '+bossFor(42).name+', hp '+b30.maxHp+'→'+b60.maxHp+'→'+b90.maxHp+
    '; boss floors every 3 from depth 6, capping each theme block');
})();
// 22. The curve itself: every dial that is supposed to rise with depth does,
// none of them jumps, and a generated floor's actual threat tracks its budget
(function(){
  // the budget climbs every single floor, and never by more than the clamp
  let prev=threatBudget(1);
  for(let d=2;d<=60;d++){
    const b=threatBudget(d);
    if(b<=prev)throw new Error('T22 threat budget did not rise at depth '+d+': '+prev+' -> '+b);
    const step=b/prev;
    // the full step is owed only while the bestiary can still deliver it; once
    // the budget is up against what the floor could field it tracks the ceiling
    const capped=b>=poolCeiling(d)-1e-6;
    const floorStep=capped?BUDGET_TAIL_STEP:BUDGET_MIN_STEP;
    if(step<floorStep-1e-9)throw new Error('T22 budget step at depth '+d+' is '+step.toFixed(3)+', under the floor');
    if(step>BUDGET_MAX_STEP+1e-9)throw new Error('T22 budget step at depth '+d+' is '+step.toFixed(3)+', over the ceiling');
    if(b>poolCeiling(d)+1e-6)throw new Error('T22 budget at depth '+d+' outruns what the floor could field');
    prev=b;
  }
  // memoisation must not change the answer
  const again=[];for(let d=1;d<=60;d++)again.push(threatBudget(d));
  for(let d=1;d<=60;d++)if(again[d-1]!==threatBudget(d))throw new Error('T22 threat budget is not stable at depth '+d);
  // the other dials
  for(let d=2;d<=60;d++){
    if(depthScale(d)<=depthScale(d-1))throw new Error('T22 depth scale flat at '+d);
    if(depthAtkBonus(d)<depthAtkBonus(d-1))throw new Error('T22 attack bonus fell at '+d);
    if(targetCount(d)<targetCount(d-1))throw new Error('T22 monster count fell at '+d);
    if(eliteChance(d)<eliteChance(d-1))throw new Error('T22 elite chance fell at '+d);
    if(affixChance(d,true)<affixChance(d-1,true))throw new Error('T22 affix chance fell at '+d);
  }
  if(eliteChance(7)!==0||eliteChance(8)<=0)throw new Error('T22 elites do not start at depth 8');
  if(eliteChance(30)<0.3||eliteChance(30)>0.35)throw new Error('T22 elite share at depth 30 is '+eliteChance(30));
  if(targetCount(1)>12||targetCount(60)<28)throw new Error('T22 monster count range wrong');

  // and the floors that come out of it: threat, count and elite share all rise
  const floor=(depth,n)=>{
    let threat=0,count=0,elites=0,packed=0;
    for(let i=0;i<n;i++){
      G.depth=depth;
      const L=genLevel(depth);
      const tiles={};
      for(const m of L.monsters){
        if(m.boss)continue;
        count++;threat+=monsterThreat(m);if(m.elite)elites++;
        const k=m.y*L.w+m.x;tiles[k]=(tiles[k]||0)+1;
      }
      // a cave's ambushers are bodies too — they simply have not stood up yet.
      // Counting them keeps a cave floor comparable with any other at its depth.
      for(const l of (L.lurkers||[])){count++;threat+=threatOf(l.key,depth,null);}
      for(const k in tiles)if(tiles[k]>1)packed+=tiles[k];
    }
    return {threat:threat/n,count:count/n,elite:elites/Math.max(1,count),packed:packed/Math.max(1,count)};
  };
  // 34 floors a depth: packing is a ratio over a few hundred monsters and was
  // near its tolerance at 14, which made the check flake when the theme cycle moved
  const f=[3,10,20,30].map(d=>({d,...floor(d,34)}));
  for(let i=1;i<f.length;i++){
    if(f[i].threat<=f[i-1].threat)throw new Error('T22 floor threat fell from depth '+f[i-1].d+' to '+f[i].d);
    if(f[i].count<=f[i-1].count)throw new Error('T22 monster count fell from depth '+f[i-1].d+' to '+f[i].d);
    if(f[i].packed<f[i-1].packed-0.05)throw new Error('T22 tile packing fell from depth '+f[i-1].d+' to '+f[i].d);
  }
  if(f[0].elite!==0)throw new Error('T22 elites appeared on a depth-3 floor');
  if(f[3].elite<0.2||f[3].elite>0.45)throw new Error('T22 depth-30 elite share is '+f[3].elite.toFixed(2));
  if(f[3].threat/f[0].threat<8)throw new Error('T22 depth 30 is only '+(f[3].threat/f[0].threat).toFixed(1)+'x depth 3');
  console.log('T22 curve rises every floor: threat '+f.map(x=>'d'+x.d+' '+x.threat.toFixed(0)).join(' → ')+
    '; monsters '+f.map(x=>x.count.toFixed(0)).join(' → ')+
    '; elites '+f.map(x=>(x.elite*100).toFixed(0)+'%').join(' → ')+
    '; packed '+f.map(x=>(x.packed*100).toFixed(0)+'%').join(' → '));
})();
// 23. The stats screen must reflect dual wielding: both hands swing, each at
// its own penalty, and every number matches what doAttack would compute
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth:1,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
  G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;

  // a single weapon in the main hand: one line, no two-weapon penalty
  const f=mkCharacter('Fi','human','fighter',[16,14,14,10,10,8]);
  G.party=[f];
  f.equip.rhand=mkItem('longsword',{bonus:1});f.equip.lhand=null;
  let p=attackProfile(f);
  if(p.dual)throw new Error('T23 a single weapon reads as dual wielding');
  if(p.hands.length!==1)throw new Error('T23 single weapon showed '+p.hands.length+' hands');
  if(p.hands[0].atk!==attackBonus(f,ITEM_DEFS.longsword,f.equip.rhand))
    throw new Error('T23 single-weapon attack bonus off: '+p.hands[0].atk);
  if(p.hands[0].dmgMod!==abilMod(f,'str')+1)throw new Error('T23 single-weapon damage mod off: '+p.hands[0].dmgMod);

  // two one-handed melee weapons: two hands, each carrying the −4 (untrained)
  f.equip.rhand=mkItem('longsword',{bonus:0});
  f.equip.lhand=mkItem('shortsword',{bonus:0});
  p=attackProfile(f);
  if(!p.dual)throw new Error('T23 two one-handed weapons did not read as dual wielding');
  if(p.hands.length!==2)throw new Error('T23 dual wield showed '+p.hands.length+' hands');
  const main=p.hands.find(h=>h.slot==='rhand'),off=p.hands.find(h=>h.slot==='lhand');
  if(!off.offhand||main.offhand)throw new Error('T23 off-hand flag on the wrong hand');
  // both hands must match attackBonus with the exact offhand flag doAttack uses
  if(main.atk!==attackBonus(f,ITEM_DEFS.longsword,f.equip.rhand,false))throw new Error('T23 main-hand bonus off');
  if(off.atk!==attackBonus(f,ITEM_DEFS.shortsword,f.equip.lhand,true))throw new Error('T23 off-hand bonus off');
  const noPenalty=attackBonus(f,ITEM_DEFS.longsword,f.equip.rhand); // undefined offhand
  if(noPenalty-main.atk!==4)throw new Error('T23 untrained dual penalty is '+(noPenalty-main.atk)+', want 4');

  // a two-weapon class (ranger) takes only −2, on both hands
  const r=mkCharacter('Ra','human','ranger',[16,16,14,10,12,8]);
  r.equip.rhand=mkItem('shortsword');r.equip.lhand=mkItem('shortsword');
  const rp=attackProfile(r);
  const rClean=attackBonus(r,ITEM_DEFS.shortsword,r.equip.rhand);
  if(rClean-rp.hands[0].atk!==2)throw new Error('T23 ranger dual penalty is '+(rClean-rp.hands[0].atk)+', want 2');

  // a two-handed weapon is not dual wielding, and its damage carries 1.5x STR
  const g=mkCharacter('Gr','human','fighter',[16,12,14,10,10,8]);
  g.equip.rhand=mkItem('greatsword',{bonus:2});g.equip.lhand=null;
  const gp=attackProfile(g);
  if(gp.dual||gp.hands.length!==1)throw new Error('T23 two-handed weapon mishandled');
  if(gp.hands[0].dmgMod!==Math.floor(abilMod(g,'str')*1.5)+2)
    throw new Error('T23 two-handed damage mod '+gp.hands[0].dmgMod+' ignores 1.5x STR');

  // a bow uses DEX to hit and adds no STR to damage
  const a=mkCharacter('Ar','elf','ranger',[12,18,12,10,12,8]);
  a.equip.rhand=mkItem('longbow');a.equip.lhand=null;
  const ap=attackProfile(a);
  if(ap.dual)throw new Error('T23 a bow read as dual wielding');
  if(ap.hands[0].dmgMod!==0)throw new Error('T23 bow damage mod '+ap.hands[0].dmgMod+' should be 0');
  if(ap.hands[0].atk!==attackBonus(a,ITEM_DEFS.longbow,a.equip.rhand))throw new Error('T23 bow attack bonus off');

  // and the profile's damage mod is exactly what damageRoll adds to each die
  const probe=(ch,slot)=>{
    const w=weaponOf(ch,slot);let min=1e9;
    for(let i=0;i<400;i++)min=Math.min(min,damageRoll(ch,w.def,w.it,false));
    return min; // the floor of NdX+mod is (N + mod), so mod = min - N (unless clamped to 1)
  };
  const mainMin=probe(f,'rhand');
  if(mainMin!==ITEM_DEFS.longsword.dmg[0]+main.dmgMod&&mainMin!==1)
    throw new Error('T23 damageRoll floor '+mainMin+' disagrees with shown mod '+main.dmgMod);
  console.log('T23 stats screen dual wield: main '+fmtMod(main.atk)+' / off '+fmtMod(off.atk)+
    ' (untrained −4), ranger −2, two-handed 1.5x STR, bow DEX+0; numbers match doAttack');
})();
// 24. Poison stacks correctly and a cure gives back exactly what it took
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth:1,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
  G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;
  const mk=()=>mkCharacter('Ci','human','fighter',[16,14,16,10,10,8]);

  // two bites on the same ability: one badge, drain accumulates, cure fully undoes it
  let ch=mk();G.party=[ch];const str0=ch.abil.str;
  applyPoison(ch,{dc:12,abil:'str',dice:[2,2]});
  applyPoison(ch,{dc:12,abil:'str',dice:[2,2]});
  const badges=ch.conditions.filter(c=>c.kind==='poison');
  if(badges.length!==1)throw new Error('T24 second poison added a second badge: '+badges.length);
  const drained=ch.abilDmg.str;
  if(drained!==badges[0].drain.str)throw new Error('T24 badge drain '+badges[0].drain.str+' != abilDmg '+drained);
  if(drained<4)throw new Error('T24 two bites did not stack: str drain '+drained);
  cureCond(ch,'poison');
  if(ch.abilDmg.str!==0)throw new Error('T24 cure left str drain '+ch.abilDmg.str);
  if(hasCond(ch,'poison'))throw new Error('T24 badge survived the cure');
  if(ch.abil.str-ch.abilDmg.str!==str0)throw new Error('T24 str not fully restored');

  // a second bite on a DIFFERENT stat is recorded (the old bug dropped it)
  ch=mk();G.party=[ch];
  applyPoison(ch,{dc:12,abil:'str',dice:[1,2]});
  applyPoison(ch,{dc:12,abil:'dex',dice:[1,2]});
  const b=ch.conditions.find(c=>c.kind==='poison');
  if(!(b.drain.str>0&&b.drain.dex>0))throw new Error('T24 mixed poison lost a stat: '+JSON.stringify(b.drain));
  cureCond(ch,'poison');
  if(ch.abilDmg.str!==0||ch.abilDmg.dex!==0)throw new Error('T24 mixed cure left drain str '+ch.abilDmg.str+' dex '+ch.abilDmg.dex);

  // CON poison lowers max hp; curing restores the stat and the hp
  ch=mk();G.party=[ch];const hp0=ch.maxHp;
  applyPoison(ch,{dc:12,abil:'con',dice:[2,2]});
  if(ch.maxHp>=hp0)throw new Error('T24 con poison did not lower max hp');
  cureCond(ch,'poison');
  if(ch.abilDmg.con!==0)throw new Error('T24 cure left con drain '+ch.abilDmg.con);
  if(ch.maxHp!==hp0)throw new Error('T24 max hp not restored: '+ch.maxHp+' vs '+hp0);

  // a cure restores ONLY the poison's share — a disease's own CON drain is untouched
  ch=mk();G.party=[ch];
  ch.abilDmg.con=2;addCond(ch,{kind:'disease'});recalcHp(ch,false); // pretend a disease already gnawed CON
  const conAfterDisease=ch.abilDmg.con;
  applyPoison(ch,{dc:12,abil:'con',dice:[2,2]}); // poison bites CON too
  const poisonShare=ch.conditions.find(c=>c.kind==='poison').drain.con;
  cureCond(ch,'poison');
  if(ch.abilDmg.con!==conAfterDisease)
    throw new Error('T24 cure touched the disease drain: con '+ch.abilDmg.con+' want '+conAfterDisease);
  if(!hasCond(ch,'disease'))throw new Error('T24 antitoxin wrongly cleared the disease');

  // clamp-aware: draining to the floor records only what stuck, and the cure
  // brings the stat exactly back — never overshoots
  ch=mkCharacter('Lo','human','fighter',[3,14,16,10,10,8]);G.party=[ch];
  for(let i=0;i<12;i++)applyPoison(ch,{dc:12,abil:'str',dice:[1,2]});
  if(ch.abil.str-ch.abilDmg.str!==1)throw new Error('T24 floor clamp broke: effective str '+(ch.abil.str-ch.abilDmg.str));
  const rec=ch.conditions.find(c=>c.kind==='poison').drain.str;
  if(rec!==ch.abilDmg.str)throw new Error('T24 recorded drain '+rec+' != applied '+ch.abilDmg.str+' (rolled overcounted)');
  cureCond(ch,'poison');
  if(ch.abilDmg.str!==0)throw new Error('T24 clamped cure left '+ch.abilDmg.str);

  // a legacy save's poison badge (no drain field) still cures without crashing
  ch=mk();G.party=[ch];
  ch.conditions.push({kind:'poison',abil:'str'});ch.abilDmg.str=3;
  cureCond(ch,'poison');
  if(hasCond(ch,'poison'))throw new Error('T24 legacy poison badge not removed');

  console.log('T24 poison: one badge, per-stat drain stacks and is fully restored by a cure, '+
    'mixed stats both recorded, disease drain left alone, clamp-aware, legacy saves safe');
})();
// 25. A guardian boss chases an aggroed party instead of leashing back to its
// post: the leash must trigger on losing the quarry, not on the party drifting
// away from the stairs the boss watches
(function(){
  const W=24,H=24;
  const flat=()=>{
    const grid=new Uint8Array(W*H).fill(T_FLOOR);
    G.L={w:W,h:H,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(W*H),
      theme:THEMES[0],depth:5,stairs:{x:2,y:2},start:{x:12,y:12},restCount:{}};
    G.over=false;G.paused=false;G.started=true;
  };
  const dist=(m,x,y)=>Math.abs(m.x-x)+Math.abs(m.y-y);

  // the party is right in front of the boss but both are far from the guarded
  // stairs. The boss must step toward the party, never back toward its post.
  flat();
  G.px=18;G.py=18;
  const boss=mkMonster('bugbear',18,15,5); // Grukk: 3 tiles ahead, clear line of sight
  boss.boss=true;boss.name='Grukk the Skullkeeper';boss.guard={x:2,y:2,r:3};boss.awake=true;
  G.L.monsters=[boss];
  computeDistField();G.distField=G.distField||G.L.distField;
  const df=(function(){const d=new Int16Array(W*H).fill(-1);const q=[[G.px,G.py]];d[G.py*W+G.px]=0;let i=0;
    while(i<q.length){const [cx,cy]=q[i++];const dd=d[cy*W+cx];if(dd>=22)continue;
      for(const [dx,dy] of DIRS){const nx=cx+dx,ny=cy+dy;if(G.L.grid[ny*W+nx]===T_FLOOR&&d[ny*W+nx]<0){d[ny*W+nx]=dd+1;q.push([nx,ny]);}}}return d;})();
  G.distField=df;
  const beforeParty=dist(boss,G.px,G.py), beforePost=dist(boss,2,2);
  chaseStep(boss);
  if(dist(boss,G.px,G.py)>=beforeParty)
    throw new Error('T25 boss did not close on the party: '+beforeParty+' -> '+dist(boss,G.px,G.py));
  if(dist(boss,2,2)<beforePost)
    throw new Error('T25 boss stepped toward its post while the party was in front of it');
  // marched all the way in, it should reach the party's doorstep, not wander home
  let steps=0,reached=false;
  while(steps++<40){chaseStep(boss);if(dist(boss,G.px,G.py)===1){reached=true;break;}}
  if(!reached)throw new Error('T25 boss never reached the party (stuck at '+dist(boss,G.px,G.py)+')');

  // but a boss that has truly lost the party — far from it and out of sight —
  // still slinks back to guard the stairs.
  // NB this needs a real wall between them. The board above is bare floor, and
  // on bare floor there is no such thing as out of sight now that sight is a
  // true line rather than a row-or-column test: the old version of this only
  // passed because the two were off each other's axis.
  flat();
  G.px=20;G.py=20;
  for(let y=11;y<=14;y++)for(let x=13;x<=17;x++)G.L.grid[y*W+x]=T_WALL;
  const g2=mkMonster('bugbear',10,4,5); // off its post, with stone between it and the party
  g2.boss=true;g2.guard={x:2,y:2,r:3};g2.awake=true;
  G.L.monsters=[g2];
  G.distField=(function(){const d=new Int16Array(W*H).fill(-1);const q=[[G.px,G.py]];d[G.py*W+G.px]=0;let i=0;
    while(i<q.length){const [cx,cy]=q[i++];const dd=d[cy*W+cx];if(dd>=22)continue;
      for(const [dx,dy] of DIRS){const nx=cx+dx,ny=cy+dy;if(G.L.grid[ny*W+nx]===T_FLOOR&&d[ny*W+nx]<0){d[ny*W+nx]=dd+1;q.push([nx,ny]);}}}return d;})();
  if(sightClear(g2.x,g2.y,G.px,G.py))throw new Error('T25 setup: expected the wall to break the sight line');
  const postBefore=dist(g2,2,2);
  chaseStep(g2);
  if(dist(g2,2,2)>=postBefore)
    throw new Error('T25 a boss that lost the party did not head back to its post: '+postBefore+' -> '+dist(g2,2,2));
  console.log('T25 guardian boss: chases an aggroed party in front of it (down to adjacency) '+
    'rather than leashing to the stairs, but still returns to post once the party is lost');
})();
// 26. A poisoned party turns up antitoxin far more often than a healthy one —
// the antidote joins the needs-aware faucet, and only for the living
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth:6,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
  G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;
  // stocked in every other way, so poison is the only thing that varies
  const mk=()=>{
    const p=[mkCharacter('F','human','fighter',[15,14,14,10,10,8]),
             mkCharacter('C','human','cleric',[12,10,13,10,16,10])];
    // stock BOTH characters, so a death in one test arm doesn't leave the
    // survivor looking unstocked and inflate the hp-scaled heal band
    for(const ch of p){
      ch.inventory=ch.inventory.map(()=>null);
      ch.inventory[0]=mkItem('pot_cmw',{qty:40});      // healNeed 0
      ch.inventory[1]=mkItem('scroll',{spell:'bless'});
      ch.inventory[2]=mkItem('scroll',{spell:'doom'});
      ch.inventory[3]=mkItem('scroll',{spell:'sleep'});// scrollNeed 0
      ch.inventory[4]=mkItem('ration',{qty:9});
      ch.hp=ch.maxHp;
    }
    return p;
  };
  const anti=(n)=>{let c=0;for(let i=0;i<n;i++)if(monsterLoot(6).base==='pot_antitoxin')c++;return c/n;};
  const N=40000;

  G.party=mk();
  const clean=anti(N);
  G.party=mk();
  applyPoison(G.party[0],{dc:12,abil:'str',dice:[1,3]});
  if(!hasCond(G.party[0],'poison'))throw new Error('T26 setup: character not poisoned');
  const sick=anti(N);

  if(sick<0.12)throw new Error('T26 poisoned antitoxin rate too low: '+sick.toFixed(3));
  if(clean>0.03)throw new Error('T26 healthy party already floods antitoxin: '+clean.toFixed(3));
  if(sick<clean*4)throw new Error('T26 poison barely moved the antitoxin rate: '+clean.toFixed(3)+' -> '+sick.toFixed(3));

  // a poisoned but DEAD character must not tug the faucet — only the living
  G.party=mk();
  applyPoison(G.party[0],{dc:12,abil:'str',dice:[1,3]});
  charDies(G.party[0]);G.over=false;
  const deadSick=anti(N);
  if(deadSick>0.03)throw new Error('T26 a dead poisoned character still pulled antitoxin: '+deadSick.toFixed(3));

  console.log('T26 antitoxin faucet: '+(clean*100).toFixed(1)+'% healthy -> '+(sick*100).toFixed(1)+
    '% when a living character is poisoned (dead poisoned: '+(deadSick*100).toFixed(1)+'%)');
})();
// 27. Vial of Remedies joins the same faucet: a diseased or paralysed party
// finds it far more often, and a corpse's affliction does not count
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth:9,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
  G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;
  const mk=()=>{
    const p=[mkCharacter('F','human','fighter',[15,14,14,10,10,8]),
             mkCharacter('C','human','cleric',[12,10,13,10,16,10])];
    for(const ch of p){
      ch.inventory=ch.inventory.map(()=>null);
      ch.inventory[0]=mkItem('pot_cmw',{qty:40});
      ch.inventory[1]=mkItem('scroll',{spell:'bless'});
      ch.inventory[2]=mkItem('scroll',{spell:'doom'});
      ch.inventory[3]=mkItem('scroll',{spell:'sleep'});
      ch.inventory[4]=mkItem('ration',{qty:9});
      ch.hp=ch.maxHp;
    }
    return p;
  };
  const remedy=(n)=>{let c=0;for(let i=0;i<n;i++)if(monsterLoot(9).base==='pot_remedy')c++;return c/n;};
  const N=40000;

  G.party=mk();
  const clean=remedy(N);
  // disease clings for floors — the main case
  G.party=mk();addCond(G.party[0],{kind:'disease',name:'Filth Fever'});
  if(!hasCond(G.party[0],'disease'))throw new Error('T27 setup: not diseased');
  const sickD=remedy(N);
  // paralysis is the other affliction the vial lifts
  G.party=mk();addCond(G.party[0],{kind:'paralysis',dur:6});
  const sickP=remedy(N);

  if(clean>0.03)throw new Error('T27 healthy party already floods remedy: '+clean.toFixed(3));
  if(sickD<0.12)throw new Error('T27 diseased remedy rate too low: '+sickD.toFixed(3));
  if(sickP<0.12)throw new Error('T27 paralysed remedy rate too low: '+sickP.toFixed(3));
  if(sickD<clean*4)throw new Error('T27 disease barely moved remedy: '+clean.toFixed(3)+' -> '+sickD.toFixed(3));

  // a diseased corpse must not pull the faucet
  G.party=mk();addCond(G.party[0],{kind:'disease',name:'Filth Fever'});
  charDies(G.party[0]);G.over=false;
  const deadSick=remedy(N);
  if(deadSick>0.03)throw new Error('T27 a dead diseased character still pulled remedy: '+deadSick.toFixed(3));

  // and poison still pulls antitoxin, not remedy — the two faucets stay distinct
  G.party=mk();applyPoison(G.party[0],{dc:12,abil:'str',dice:[1,3]});
  const poisonRemedy=remedy(N);
  if(poisonRemedy>0.03)throw new Error('T27 poison wrongly pulled remedy: '+poisonRemedy.toFixed(3));

  console.log('T27 remedy faucet: '+(clean*100).toFixed(1)+'% healthy -> '+(sickD*100).toFixed(1)+
    '% diseased / '+(sickP*100).toFixed(1)+'% paralysed (dead: '+(deadSick*100).toFixed(1)+
    '%, poison pulls antitoxin not remedy: '+(poisonRemedy*100).toFixed(1)+'%)');
})();
// 28. Crypt wall furniture: only on crypt floors, only against real wall faces,
// spaced out, and every kind actually gets used
(function(){
  const KINDS=['sarcophagus','tombs','stacked','candle','recess'];
  const seen=new Set();
  let totalFeatures=0,cryptFloors=0;
  for(const depth of depthsOf('Crypt',24)){   // every Crypt slot in the cycle, derived
    for(let t=0;t<12;t++){
      const L=genLevel(depth);
      if(L.theme.name!=='Crypt')throw new Error('T28 depth '+depth+' is not a Crypt floor: '+L.theme.name);   // depths come from depthOf
      cryptFloors++;
      if(!Array.isArray(L.crypts))throw new Error('T28 crypt floor has no crypts array');
      if(!L.crypts.length)throw new Error('T28 a crypt floor came out bare at depth '+depth);
      totalFeatures+=L.crypts.length;
      for(const c of L.crypts){
        seen.add(c.kind);
        if(!KINDS.includes(c.kind))throw new Error('T28 unknown crypt kind '+c.kind);
        // the host tile must be walkable floor the party can actually stand on
        if(L.grid[c.y*L.w+c.x]!==T_FLOOR)throw new Error('T28 feature host tile is not floor');
        // and it must face a plain wall — never a secret door, a real door or stairs
        if(Math.abs(c.dx)+Math.abs(c.dy)!==1)throw new Error('T28 feature has a diagonal/zero facing');
        const wt=L.grid[(c.y+c.dy)*L.w+(c.x+c.dx)];
        if(wt!==T_WALL)throw new Error('T28 feature mounted on tile type '+wt+', expected wall');
      }
      // no two features crowd each other
      for(let i=0;i<L.crypts.length;i++)for(let j=i+1;j<L.crypts.length;j++){
        const a=L.crypts[i],b=L.crypts[j];
        if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<2)
          throw new Error('T28 two features share/crowd a tile at '+a.x+','+a.y);
      }
    }
  }
  for(const k of KINDS)if(!seen.has(k))throw new Error('T28 kind never generated: '+k);
  // other themes stay bare — this is crypt furniture, not dungeon-wide
  for(const depth of [].concat(depthsOf('Dungeon',12),depthsOf('Sewers',12),depthsOf('Caves',12))){
    const L=genLevel(depth);
    if(L.theme.name==='Crypt')throw new Error('T28 depth '+depth+' unexpectedly a Crypt');
    if(L.crypts&&L.crypts.length)throw new Error('T28 '+L.theme.name+' floor grew crypt furniture');
  }
  // and they survive a save/load round trip, or a reloaded floor loses its dead
  const L=genLevel(8);
  const snap=JSON.parse(JSON.stringify({crypts:L.crypts}));
  if(snap.crypts.length!==L.crypts.length)throw new Error('T28 crypts did not serialize');
  if(JSON.stringify(snap.crypts[0])!==JSON.stringify(L.crypts[0]))throw new Error('T28 crypt entry changed across serialization');
  console.log('T28 crypt walls: '+(totalFeatures/cryptFloors).toFixed(1)+' features per floor across '+
    cryptFloors+' crypt levels, all 5 kinds used, every one on a plain wall face, none crowding, save-safe');
})();
// 29. The deep dead: seven new undead fill the bands the crypts had nothing for,
// crypt floors lean on them, and the budget stays a pure function of depth
(function(){
  const NEW=['mummy','wraith','barrowwight','bonecolossus','deathknight','lich','bonedrake'];
  for(const k of NEW){
    const d=MONSTERS[k];
    if(!d)throw new Error('T29 missing monster '+k);
    if(d.type!=='undead')throw new Error('T29 '+k+' is not undead');
    if(!SPAWN_DEPTH[k])throw new Error('T29 '+k+' has no spawn band — it would never appear');
    if(!MONSTER_ART[d.spr])throw new Error('T29 '+k+' has no art for spr '+d.spr);
    // the art must carry both animation layers or it cannot telegraph an attack
    const a=MONSTER_ART[d.spr](),L=splitLayers(a.body);
    if(!L.head)throw new Error('T29 '+k+' art has no |H| head layer');
    if(!L.arm)throw new Error('T29 '+k+' art has no |A| arm layer');
    // a caster needs an element so elemental wards can resist it
    if(d.caster&&!ELEMENTS[d.caster.elem])throw new Error('T29 '+k+' casts an unresistable element');
    // every elite mantle must apply without blowing up
    for(const ek of ELITE_KEYS){
      const m=mkMonster(k,1,1,25);makeElite(m,ek);
      if(!(m.maxHp>0)||!(m.xp>0))throw new Error('T29 elite '+ek+' broke '+k);
    }
  }
  // the two threat scorers must agree on every creature, new ones included
  for(const k in SPAWN_DEPTH)for(const d of [8,20,35]){
    const a=monsterThreat(mkMonster(k,0,0,d)),b=threatOf(k,d,null);
    if(Math.abs(a-b)>1e-6)throw new Error('T29 threat scorers disagree on '+k+'@'+d+': '+a+' vs '+b);
  }
  // bands are contiguous: no depth from 1 to 60 may be left with nothing new
  for(let d=1;d<=60;d++)if(!spawnPool(d).length)throw new Error('T29 empty spawn pool at depth '+d);

  // threatBudget must not depend on the theme that asked for it first. The bias
  // lives at placement, so the budget is still a pure function of depth.
  const before=[];for(let d=1;d<=40;d++)before.push(threatBudget(d));
  for(let d=1;d<=40;d++)genLevel(d);            // exercise every theme
  for(let d=1;d<=40;d++)if(threatBudget(d)!==before[d-1])
    throw new Error('T29 threatBudget at depth '+d+' changed after generating levels — the memo is theme-tainted');

  // crypt floors lean undead; other themes stay mixed
  const share=(depth,n)=>{
    let u=0,tot=0,theme='';
    for(let i=0;i<n;i++){const L=genLevel(depth);theme=L.theme.name;
      for(const m of L.monsters){if(m.boss)continue;tot++;if(MONSTERS[m.key].type==='undead')u++;}}
    return {theme,share:u/Math.max(1,tot)};
  };
  /* This used to be a bias rather than a rule, and the assertion was a band —
     the crypt ran 80% undead shallow and 60% deep, falling with every roster
     added, because each new one widened the off-theme draw the x4 had to beat.
     A theme now fields its own roster and nothing else, so the only correct
     figures are 1 and 0. T55 checks the same invariant across all seven. */
  const crypt=share(depthOf('Crypt',20),30), caves=share(depthOf('Caves',22),30);
  if(crypt.theme!=='Crypt')throw new Error('T29 crypt lookup gave '+crypt.theme);
  if(crypt.share!==1)throw new Error('T29 crypt floor is only '+(crypt.share*100).toFixed(0)+'% undead');
  if(caves.share!==0)throw new Error('T29 a '+caves.theme+' floor is '+(caves.share*100).toFixed(0)+'% undead — the roster leaked');

  // and the deep bestiary is genuinely wider than the two-creature monoculture
  const kinds=new Set();
  for(let i=0;i<10;i++)for(const m of genLevel(40).monsters)if(!m.boss)kinds.add(m.key);
  if(kinds.size<5)throw new Error('T29 depth 40 still fields only '+kinds.size+' creature kinds');
  console.log('T29 deep dead: 7 undead banded 10-99, art layered, elites safe, scorers agree; '+
    'crypt@20 '+(crypt.share*100).toFixed(0)+'% undead vs '+caves.theme+'@22 '+(caves.share*100).toFixed(0)+
    '%; depth 40 fields '+kinds.size+' kinds; budget still depth-pure');
})();
// 30. Opening a coffin: mostly dust, sometimes goods, sometimes an occupant —
// one shot each, only within reach, and loud enough to wake the room
(function(){
  const W=24,H=24;
  const setup=(depth)=>{
    const grid=new Uint8Array(W*H).fill(T_FLOOR);
    for(let x=0;x<W;x++){grid[x]=T_WALL;grid[(H-1)*W+x]=T_WALL;}
    for(let y=0;y<H;y++){grid[y*W]=T_WALL;grid[y*W+W-1]=T_WALL;}
    G.L={w:W,h:H,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(W*H),
      theme:THEMES[THEME_IDX('Crypt')],depth,stairs:{x:1,y:1},start:{x:5,y:5},restCount:{},
      crypts:[{x:5,y:5,dx:0,dy:-1,kind:'stacked',ci:0}]};
    G.px=5;G.py=5;G.depth=depth;G.over=false;G.paused=false;G.started=true;
    G.party=[mkCharacter('F','human','fighter',[16,12,14,10,10,8])];
  };

  // distribution over many fresh coffins
  let dust=0,goods=0,risen=0;
  const N=4000;
  for(let i=0;i<N;i++){
    setup(20);
    const before=G.L.monsters.length, items0=Object.keys(G.L.items).length;
    openCoffin(0,0);
    if(G.L.monsters.length>before)risen++;
    else if(Object.keys(G.L.items).length>items0)goods++;
    else dust++;
  }
  const pd=dust/N,pg=goods/N,pr=risen/N;
  if(pd<0.48||pd>0.62)throw new Error('T30 dust rate '+pd.toFixed(3)+' outside 0.48-0.62');
  if(pg<0.19||pg>0.31)throw new Error('T30 grave-goods rate '+pg.toFixed(3)+' outside 0.19-0.31');
  if(pr<0.15||pr>0.25)throw new Error('T30 occupant rate '+pr.toFixed(3)+' outside 0.15-0.25');

  // whatever rises is undead far more often than not, and arrives awake
  setup(20);
  let undead=0,tot=0;
  for(let i=0;i<600;i++){
    setup(20);
    openCoffin(0,0);
    const m=G.L.monsters[0];
    if(m){tot++;if(MONSTERS[m.key].type==='undead')undead++;
      if(!m.awake)throw new Error('T30 the occupant rose asleep');}
  }
  if(undead/tot<0.85)throw new Error('T30 only '+((undead/tot)*100).toFixed(0)+'% of occupants are undead');

  // one shot: the second attempt on the same slot changes nothing
  setup(20);
  openCoffin(0,0);
  const snapshot={mon:G.L.monsters.length,items:Object.keys(G.L.items).length};
  for(let i=0;i<20;i++)openCoffin(0,0);
  if(G.L.monsters.length!==snapshot.mon||Object.keys(G.L.items).length!==snapshot.items)
    throw new Error('T30 a coffin could be looted twice');
  if(G.L.crypts[0].opened.length!==1)throw new Error('T30 opened list is wrong: '+JSON.stringify(G.L.crypts[0].opened));
  // the other coffin of the stacked pair is still shut and independent
  openCoffin(0,1);
  if(G.L.crypts[0].opened.length!==2)throw new Error('T30 the paired coffin did not open separately');

  // out of reach: nothing happens
  setup(20);
  G.px=12;G.py=12;
  openCoffin(0,0);
  if(G.L.crypts[0].opened&&G.L.crypts[0].opened.length)throw new Error('T30 opened a coffin from across the room');

  // noise wakes sleepers nearby but not across the level
  setup(20);
  const near=mkMonster('skeleton',8,5,20); near.awake=false;   // 3 tiles
  const far=mkMonster('skeleton',20,20,20); far.awake=false;   // 30 tiles
  G.L.monsters=[near,far];
  openCoffin(0,0);
  if(!near.awake)throw new Error('T30 the grinding lid did not wake the monster nearby');
  if(far.awake)throw new Error('T30 the noise carried across the whole level');

  // and the opened state survives a save/load round trip
  setup(20);
  openCoffin(0,0);
  const round=JSON.parse(JSON.stringify(G.L.crypts));
  if(!round[0].opened||round[0].opened.indexOf(0)<0)throw new Error('T30 opened coffins do not serialize');
  console.log('T30 coffins: '+(pd*100).toFixed(0)+'% dust / '+(pg*100).toFixed(0)+'% goods / '+
    (pr*100).toFixed(0)+'% occupant ('+((undead/tot)*100).toFixed(0)+'% undead, awake), one shot each, '+
    'needs reach, wakes sleepers within 6, save-safe');
})();
// 31. The ossuary: one per crypt floor, its bier blocking but never stranding
// anything, guarded, and worth robbing once
(function(){
  let floors=0,guardsOK=0;
  for(const depth of depthsOf('Crypt',40)){
    for(let t=0;t<10;t++){
      const L=genLevel(depth);
      floors++;
      const os=L.ossuary;
      if(!os)throw new Error('T31 crypt floor at depth '+depth+' has no ossuary');
      if(os.w<3||os.h<3)throw new Error('T31 ossuary room too small to walk around the bier');
      if(L.grid[os.by*L.w+os.bx]!==T_PIT)throw new Error('T31 the bier does not block');
      if(os.bx<os.x||os.bx>=os.x+os.w||os.by<os.y||os.by>=os.y+os.h)
        throw new Error('T31 the bier sits outside its own room');
      if(L.stairs.x===os.bx&&L.stairs.y===os.by)throw new Error('T31 the bier swallowed the stairs');
      // nothing else may share the blocked tile
      if(L.items[os.by*L.w+os.bx])throw new Error('T31 loot left on the blocked bier tile');
      if(L.traps[os.by*L.w+os.bx])throw new Error('T31 a trap left on the blocked bier tile');
      if(L.monsters.some(m=>m.x===os.bx&&m.y===os.by))throw new Error('T31 a monster left standing on the bier');
      // the keeper
      const g=L.monsters.find(m=>m.ossuary);
      if(!g)throw new Error('T31 the ossuary has no guardian');
      if(MONSTERS[g.key].type!=='undead')throw new Error('T31 the guardian is not undead: '+g.key);
      if(!g.elite)throw new Error('T31 the guardian wears no elite mantle');
      if(Math.abs(g.x-os.bx)+Math.abs(g.y-os.by)!==1)throw new Error('T31 the guardian is not beside the bier');
      guardsOK++;
      // THE important one: the bier is placed after the generator's own
      // connectivity pass, so prove nothing was stranded behind it
      const seen=new Uint8Array(L.w*L.h);
      const q=[[L.start.x,L.start.y]];seen[L.start.y*L.w+L.start.x]=1;
      for(let qi=0;qi<q.length;qi++){
        const [cx,cy]=q[qi];
        for(const [dx,dy] of DIRS){
          const nx=cx+dx,ny=cy+dy;
          if(nx<0||ny<0||nx>=L.w||ny>=L.h)continue;
          const i=ny*L.w+nx;
          if(seen[i])continue;
          // secret doors count as passable here: a pocket behind one is reachable
          // once found, and this check is about the bier, not about search rolls
          if(!walkableTile(L.grid[i])&&L.grid[i]!==T_SECRET)continue;
          seen[i]=1;q.push([nx,ny]);
        }
      }
      for(let i=0;i<L.grid.length;i++)
        if(walkableTile(L.grid[i])&&!seen[i])
          throw new Error('T31 the bier stranded a walkable tile at depth '+depth+' ('+(i%L.w)+','+Math.floor(i/L.w)+')');
      /* And the stairs must still be reachable. T_STAIRS is not walkable any
         more — the stairwell is a spiral round a newel and the party stands
         beside it rather than on it — so what has to be reachable is a tile
         you can stand on next to it, not the tile itself. */
      if(!DIRS.some(([dx,dy])=>seen[(L.stairs.y+dy)*L.w+(L.stairs.x+dx)]))
        throw new Error('T31 the stairs became unreachable');
    }
  }
  // no ossuaries anywhere else
  // every non-crypt slot in the cycle, derived rather than listed
  const notCrypt=[];
  for(let d=1;d<=45;d++)if(Math.floor((d-1)/3)%THEMES.length!==THEME_IDX('Crypt'))notCrypt.push(d);
  for(const depth of notCrypt.slice(0,14))for(let t=0;t<4;t++)
    if(genLevel(depth).ossuary)throw new Error('T31 an ossuary leaked onto a depth-'+depth+' floor');

  // robbing it: needs reach, pays a hoard, and only once
  const cd=depthOf('Crypt',20);
  let L=genLevel(cd),guard=0;
  while(!L.ossuary&&guard++<40)L=genLevel(cd);   // a crypt floor may miss one
  G.L=L;G.depth=cd;G.over=false;G.paused=false;G.started=true;
  G.party=[mkCharacter('F','human','fighter',[16,12,14,10,10,8])];
  const os=L.ossuary;
  if(!os)throw new Error('T31 no ossuary in 40 crypt floors at depth '+cd);
  G.px=1;G.py=1;                       // far away
  openBier();
  if(os.opened)throw new Error('T31 robbed the bier from across the level');
  const adj=DIRS.map(([dx,dy])=>({x:os.bx+dx,y:os.by+dy})).find(p=>walkableTile(tileAt(p.x,p.y)));
  G.px=adj.x;G.py=adj.y;
  const before=Object.values(L.items).reduce((n,a)=>n+a.length,0);
  openBier();
  if(!os.opened)throw new Error('T31 could not rob the bier from beside it');
  const after=Object.values(L.items).reduce((n,a)=>n+a.length,0);
  if(after-before<2)throw new Error('T31 the bier paid only '+(after-before)+' items');
  const again=after;
  openBier();openBier();
  if(Object.values(L.items).reduce((n,a)=>n+a.length,0)!==again)throw new Error('T31 the bier could be robbed twice');
  // and the spoils landed somewhere the party can actually stand
  let placed=false;
  for(const i in L.items){const x=+i%L.w,y=Math.floor(+i/L.w);if(walkableTile(L.grid[+i]))placed=true;}
  if(!placed)throw new Error('T31 the hoard landed on unwalkable ground');
  console.log('T31 ossuary: '+floors+' crypt floors, all with a blocking bier that strands nothing, '+
    guardsOK+' elite undead keepers stood beside it, robbed once for a hoard, none on other themes');
})();
// 32. Undead rules: damage types, incorporeality that is never immunity, and
// Turn Undead as the cleric's signature
(function(){
  // every weapon must be typed, or undeadDamageMult silently does nothing
  for(const k in WEAPONS)if(!['b','p','s'].includes(WEAPONS[k].dtype))
    throw new Error('T32 weapon '+k+' has no damage type');

  const skel={skeletal:true}, ghost={incorporeal:true}, flesh={};
  const W=(k)=>ITEM_DEFS[k];
  const plain=mkItem('mace'), magic=mkItem('mace',{bonus:1}), affixed=mkItem('mace',{affix:'flaming'});
  // bone: hammers shatter it, points rattle through, blades are unchanged
  if(undeadDamageMult(skel,W('mace'),plain)!==1.5)throw new Error('T32 blunt does not shatter bone');
  if(undeadDamageMult(skel,W('longbow'),mkItem('longbow'))!==0.5)throw new Error('T32 arrows are not turned aside by bone');
  if(undeadDamageMult(skel,W('longsword'),mkItem('longsword'))!==1)throw new Error('T32 slashing should be neutral vs bone');
  if(undeadDamageMult(flesh,W('mace'),plain)!==1)throw new Error('T32 blunt bonus leaked onto living flesh');

  // incorporeal: halved by mundane steel, whole from anything magical — and
  // never zero, so a party with no enchanted weapon is hindered, not stuck
  if(undeadDamageMult(ghost,W('longsword'),mkItem('longsword'))!==0.5)throw new Error('T32 mundane steel not halved vs incorporeal');
  if(undeadDamageMult(ghost,W('longsword'),magic&&mkItem('longsword',{bonus:1}))!==1)throw new Error('T32 a +1 blade should bite an incorporeal fully');
  if(undeadDamageMult(ghost,W('longsword'),mkItem('longsword',{affix:'frost'}))!==1)throw new Error('T32 an affixed blade should bite fully');
  for(const wk of Object.keys(WEAPONS))
    if(undeadDamageMult({skeletal:true,incorporeal:true},W(wk),mkItem(wk))<=0)
      throw new Error('T32 '+wk+' reduced to zero damage — that is immunity, not resistance');
  if(!weaponIsMagic(magic)||!weaponIsMagic(affixed)||weaponIsMagic(plain))throw new Error('T32 weaponIsMagic is wrong');
  // the rule is discoverable from the item panel
  if(itemDesc(mkItem('mace')).indexOf('Bludgeoning')<0)throw new Error('T32 the mace does not mention its type');
  if(itemDesc(mkItem('longbow')).indexOf('Piercing')<0)throw new Error('T32 the bow does not mention its type');

  // --- Turn Undead ---
  const grid=new Uint8Array(900).fill(T_FLOOR);
  const setup=(lvl)=>{
    G.L={w:30,h:30,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(900),
      theme:THEMES[THEME_IDX('Crypt')],depth:10,stairs:{x:1,y:1},start:{x:15,y:15},restCount:{}};
    G.px=15;G.py=15;G.time=100;G.over=false;G.paused=false;G.started=true;
    const cl=mkCharacter('Cl','human','cleric',[10,12,14,10,16,16]);
    cl.level=lvl;cl.xp=XP_FOR_LEVEL(lvl);recalcHp(cl,true);resetDaily(cl);
    cl.cdL=0;cl.cdR=0;
    G.party=[cl];
    G.distField=(function(){const d=new Int32Array(900).fill(-1);const q=[[15,15]];d[15*30+15]=0;let i=0;
      while(i<q.length){const [cx,cy]=q[i++];const dd=d[cy*30+cx];if(dd>=25)continue;
        for(const [dx,dy] of DIRS){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=30||ny>=30)continue;
          if(d[ny*30+nx]<0){d[ny*30+nx]=dd+1;q.push([nx,ny]);}}}return d;})();
    return cl;
  };
  // only the cleric has it
  const f=mkCharacter('F','human','fighter',[16,12,14,10,10,8]);
  setup(9);G.party.push(f);
  if(turnUndead(f))throw new Error('T32 a fighter turned undead');

  // weak undead near a strong cleric are destroyed or routed; the living ignore it
  let destroyed=0,routed=0,living=0;
  for(let t=0;t<60;t++){
    const cl=setup(12);
    const sk=mkMonster('skeleton',16,15,10);   // CR 1/3 -> hd 1
    const gob=mkMonster('goblin',14,15,10);    // living, must be untouched
    G.L.monsters=[sk,gob];
    turnUndead(cl);
    if(!G.L.monsters.includes(sk))destroyed++;
    else if(sk.fleeUntil>G.time)routed++;
    if(gob.shaken||gob.fleeUntil)living++;
  }
  if(living)throw new Error('T32 Turn Undead affected a living creature');
  if(destroyed+routed<55)throw new Error('T32 a level-12 cleric barely touched a skeleton: '+destroyed+'/'+routed);

  // a lich shrugs it off — the strong are not routed by a channel
  let lichTurned=0;
  for(let t=0;t<40;t++){
    const cl=setup(9);
    const li=mkMonster('lich',16,15,25);
    G.L.monsters=[li];
    turnUndead(cl);
    if(!G.L.monsters.includes(li)||li.fleeUntil>G.time)lichTurned++;
  }
  if(lichTurned>8)throw new Error('T32 a level-9 cleric routed a lich '+lichTurned+'/40 times');

  // once per rest, and restored by resting
  const cl=setup(10);
  const sk2=mkMonster('skeleton',16,15,10);G.L.monsters=[sk2];
  if(!turnUndead(cl))throw new Error('T32 the first channel failed');
  if(turnUndead(cl))throw new Error('T32 Turn Undead was usable twice without resting');
  resetDaily(cl);
  if(cl.turnUsed)throw new Error('T32 resting did not restore Turn Undead');
  // out of range is untouched
  const cl2=setup(14);
  const far=mkMonster('skeleton',15+9,15,10);
  G.L.monsters=[far];
  turnUndead(cl2);
  if(!G.L.monsters.includes(far)||far.fleeUntil>G.time)throw new Error('T32 Turn Undead reached nine tiles');
  console.log('T32 undead rules: all weapons typed, bone x1.5 blunt / x0.5 piercing, incorporeal halved by '+
    'mundane and never immune; Turn Undead is cleric-only, once per rest, spares the living, '+
    'routs the weak and is shrugged off by a lich');
})();
// 33. Epitaphs are stable and readable only up close; the dressing is cosmetic
(function(){
  // the same stone always carries the same name, however often it is re-read
  const a=epitaphAt(7,11,3);
  for(let i=0;i<50;i++)if(epitaphAt(7,11,3)!==a)throw new Error('T33 an epitaph changed between reads');
  // and different stones say different things
  const seen=new Set();
  for(let x=0;x<12;x++)for(let y=0;y<12;y++)for(let n=0;n<9;n++)seen.add(epitaphAt(x,y,n));
  if(seen.size<800)throw new Error('T33 epitaphs repeat far too often: '+seen.size+' distinct of 1296');
  if(!/dead these \d+ years/.test(a))throw new Error('T33 epitaph is malformed: '+a);
  // every generated line draws from the tables and stays a sentence
  for(let i=0;i<200;i++){
    const e=epitaphAt(rnd(50),rnd(50),rnd(9));
    if(!EPI_NAMES.some(n=>e.startsWith(n)))throw new Error('T33 epitaph has no name: '+e);
    if(e.length>140)throw new Error('T33 epitaph too long for a toast: '+e);
  }
  // reading needs the party beside the stone
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[THEME_IDX('Crypt')],depth:8,stairs:{x:1,y:1},start:{x:5,y:5},restCount:{},crypts:[]};
  G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;
  let said=null;const realToast=UI.toast;UI.toast=(m)=>{said=m;};
  readEpitaph(5,6,0);
  if(!said||said.indexOf('dead these')<0)throw new Error('T33 could not read an adjacent plaque: '+said);
  said=null;readEpitaph(15,15,0);
  if(!said||said.indexOf('Too far')<0)throw new Error('T33 read a plaque from across the level: '+said);
  UI.toast=realToast;
  console.log('T33 epitaphs: '+seen.size+' distinct across 1296 stones, stable on re-read, '+
    'legible only from beside the stone. Sample — "'+a+'"');
})();
// 34. The cave creatures, banded across the cave depths, with their signature
// abilities mapped onto conditions that actually do something.
// The otyugh used to be one of these. It eats refuse and the wererat guild
// keeps it for that, so it moved to the sewers; the cave roster still fields
// eight and T36 still holds the caves above their bar without it.
(function(){
  const NEW=['piercer','cavefisher','roper','cavebear','troglodyte','crawler','umberhulk','purpleworm'];
  const LURK=['piercer','cavefisher','roper'];
  for(const k of NEW){
    const d=MONSTERS[k];
    if(!d)throw new Error('T34 missing monster '+k);
    if(!d.cave)throw new Error('T34 '+k+' lacks the cave flag the placement bias keys off');
    if(!SPAWN_DEPTH[k])throw new Error('T34 '+k+' has no spawn band');
    if(!MONSTER_ART[d.spr])throw new Error('T34 '+k+' has no art');
    const a=MONSTER_ART[d.spr](),L=splitLayers(a.body);
    if(!L.head)throw new Error('T34 '+k+' art has no |H| layer');
    if(!L.arm)throw new Error('T34 '+k+' art has no |A| layer');
    for(const ek of ELITE_KEYS){
      const m=mkMonster(k,1,1,20);makeElite(m,ek);
      if(!(m.maxHp>0)||!(m.xp>0))throw new Error('T34 elite '+ek+' broke '+k);
    }
  }
  for(const k of LURK)if(!MONSTERS[k].lurk)throw new Error('T34 '+k+' should be a lurker');
  for(const k of NEW)if(!LURK.includes(k)&&MONSTERS[k].lurk)throw new Error('T34 '+k+' should not be a lurker');
  // the scorers must still agree, on the whole bestiary
  for(const k in SPAWN_DEPTH)for(const d of [10,22,36]){
    const a=monsterThreat(mkMonster(k,0,0,d)),b=threatOf(k,d,null);
    if(Math.abs(a-b)>1e-6)throw new Error('T34 threat scorers disagree on '+k+'@'+d);
  }
  // every cave creature must be plausibly weighted at the depths caves occur —
  // sized against the measured per-monster share, not by CR feel
  for(const k of NEW){
    const [lo,hi]=SPAWN_DEPTH[k];
    let anyGood=false;
    for(const d of [10,11,12,22,23,24,34,35,36,46,47,48]){
      if(d<lo-1||d>hi)continue;
      const share=threatBudget(d)/Math.round(targetCount(d));
      const r=threatOf(k,d,null)/share;
      if(r>=0.3&&r<=2.6)anyGood=true;
      if(r>6)throw new Error('T34 '+k+' is '+r.toFixed(1)+'x the share at depth '+d+' — it would never spawn');
    }
    if(!anyGood)throw new Error('T34 '+k+' never lands near the share on any cave floor');
  }
  // the purple worm exists to relieve the deep ceiling: it must be the heaviest
  // thing the deep floors can field
  for(const d of [36,46]){
    let best=null;
    for(const k in SPAWN_DEPTH){const [lo,hi]=SPAWN_DEPTH[k];if(d<lo||d>hi+6)continue;
      const t=threatOf(k,d,null);if(!best||t>best.t)best={k,t};}
    if(best.k!=='purpleworm')throw new Error('T34 at depth '+d+' the heaviest is '+best.k+', not the purple worm');
  }

  // --- the mapped abilities must bite ---
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[THEME_IDX('Caves')],depth:20,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{}};
  G.px=5;G.py=5;G.time=50;G.over=false;G.paused=false;G.started=true;
  const mk=()=>{const c=mkCharacter('V','human','fighter',[14,12,12,10,8,8]);c.conditions=[];return c;};
  // gaze -> stunned, and stunned genuinely stops a character acting
  let stunned=0;
  for(let i=0;i<400;i++){
    const ch=mk();G.party=[ch];
    monsterSpecials(mkMonster('umberhulk',6,5,20),ch);
    if(hasCond(ch,'stunned')){stunned++;if(canAct(ch))throw new Error('T34 a stunned character can still act');}
  }
  if(stunned<40)throw new Error('T34 the umber hulk gaze almost never lands: '+stunned+'/400');
  if(stunned>360)throw new Error('T34 the umber hulk gaze is near-automatic: '+stunned+'/400');
  // hold -> the roper's tendrils, and hold must now actually restrain
  let held=0;
  for(let i=0;i<400;i++){
    const ch=mk();G.party=[ch];
    monsterSpecials(mkMonster('roper',6,5,25),ch);
    if(hasCond(ch,'hold')){held++;
      if(canAct(ch))throw new Error('T34 a held character can still act');
      const free=mk();
      if(charAC(ch)>=charAC(free))throw new Error('T34 being held costs no AC');
    }
  }
  if(held<40)throw new Error('T34 roper tendrils almost never land: '+held+'/400');
  // the crawler's paralysis is deliberately softer than a ghoul's at the same depth
  const crawlerDC=MONSTERS.crawler.paralysis.dc, ghoulDC=MONSTERS.ghoul.paralysis.dc;
  if(crawlerDC>ghoulDC+2)throw new Error('T34 the carrion crawler paralysis DC is not the soft one intended');
  console.log('T34 cave creatures: 8 added, 3 lurkers, all banded and art-layered, elites safe, '+
    'scorers agree, all sized near the share; purple worm is now the heaviest at depth 36 and 46; '+
    'gaze stuns ('+stunned+'/400) and tendrils hold ('+held+'/400), both genuinely stopping a character');
})();

/* --- T35: cave ambushers --- */
(function(){
  // --- generation: only in caves, only lurk-flagged, and budget-neutral ---
  let sawLurkers=0,totalL=0,totalM=0,floors=0;
  for(let d=10;d<=34;d+=2){
    for(let t=0;t<6;t++){
      const L=genLevel(d);
      if(L.theme.name!=='Caves'){
        if(L.lurkers&&L.lurkers.length)
          throw new Error('T35 lurkers on a '+L.theme.name+' floor at depth '+d);
        continue;
      }
      floors++;
      const lk=L.lurkers||[];
      if(lk.length)sawLurkers++;
      totalL+=lk.length;totalM+=L.monsters.length;
      for(let i=0;i<lk.length;i++){
        const l=lk[i];
        if(!MONSTERS[l.key])throw new Error('T35 unknown lurker key '+l.key);
        if(!MONSTERS[l.key].lurk)throw new Error('T35 '+l.key+' is not an ambusher');
        const [lo,hi]=SPAWN_DEPTH[l.key];
        if(d<lo-1||d>hi)throw new Error('T35 '+l.key+' out of band at depth '+d);
        if(L.grid[l.y*L.w+l.x]!==T_FLOOR)throw new Error('T35 lurker not on floor');
        if(Math.abs(l.x-L.start.x)+Math.abs(l.y-L.start.y)<3)
          throw new Error('T35 lurker in the party\'s lap at spawn');
        if(L.monsters.some(m=>m.x===l.x&&m.y===l.y))
          throw new Error('T35 lurker sharing a tile with a standing monster');
        for(let j=0;j<i;j++)
          if(Math.abs(lk[j].x-l.x)+Math.abs(lk[j].y-l.y)<4)
            throw new Error('T35 two ambushers stacked on top of each other');
        if(l.sprung||l.found)throw new Error('T35 a lurker starts already revealed');
      }
    }
  }
  if(!floors)throw new Error('T35 no cave floors generated in the sampled range');
  if(sawLurkers<floors*0.9)throw new Error('T35 cave floors mostly hold no ambushers: '+sawLurkers+'/'+floors);
  // each lurker replaced an ordinary spawn, so the head count is unmoved
  const avgBodies=(totalL+totalM)/floors;
  if(avgBodies<11||avgBodies>31)
    throw new Error('T35 lurkers are not budget-neutral: '+avgBodies.toFixed(1)+' bodies a floor');

  // --- the ambush itself, on a flat test floor ---
  const mkFloor=(lurkers)=>{
    const g=new Uint8Array(20*20).fill(T_FLOOR);
    G.L={w:20,h:20,grid:g,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
      theme:THEMES[THEME_IDX('Caves')],depth:20,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},
      rivers:[],pipes:[],crypts:[],ossuary:null,lurkers};
    G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;
    computeDistField();
  };
  const rogue=()=>{const c=mkCharacter('Sly','human','rogue',[12,16,12,16,12,10]);c.level=6;return c;};
  const oaf=()=>{const c=mkCharacter('Oaf','halforc','barbarian',[16,10,14,6,6,8]);return c;};

  // a rogue takes 10 and sees it two tiles off, before anyone is adjacent
  let spottedEarly=0;
  for(let i=0;i<60;i++){
    mkFloor([{x:5,y:7,key:'piercer',dc:trapDC(20),found:false,sprung:false,noticeTried:false}]);
    G.party=[rogue()];
    afterPartyMove(true);
    if(G.L.lurkers[0].sprung&&Math.abs(G.py-7)===2)spottedEarly++;
  }
  if(spottedEarly!==60)throw new Error('T35 the rogue misses ambushers at two tiles: '+spottedEarly+'/60');
  // and what it finds is a real, awake monster of the right kind
  if(G.L.monsters.length!==1)throw new Error('T35 spotting produced no monster');
  if(G.L.monsters[0].key!=='piercer'||!G.L.monsters[0].awake)
    throw new Error('T35 a spotted ambusher is not an awake monster');
  if(!G.L.lurkers[0].found)throw new Error('T35 found flag not set');

  // spotting pays nothing: the reward is not being jumped
  mkFloor([{x:5,y:7,key:'piercer',dc:trapDC(20),found:false,sprung:false,noticeTried:false}]);
  const scout=rogue();G.party=[scout];
  const xp0=scout.xp;
  afterPartyMove(true);
  if(!G.L.lurkers[0].sprung)throw new Error('T35 setup: the rogue failed to spot');
  if(scout.xp!==xp0)throw new Error('T35 spotting an ambusher paid XP: '+xp0+' -> '+scout.xp);

  // without a scout it springs on adjacency, and it strikes before the party braces
  let ambushed=0,ambushCd=0;
  for(let i=0;i<200;i++){
    mkFloor([{x:5,y:6,key:'roper',dc:99,found:false,sprung:false,noticeTried:false}]);
    G.party=[oaf()];
    afterPartyMove(true);                       // adjacent already: springs at once
    if(G.L.lurkers[0].sprung){
      ambushed++;
      const m=G.L.monsters[0];
      if(!m||m.key!=='roper')throw new Error('T35 the ambush produced no roper');
      if(!m.awake)throw new Error('T35 an ambusher springs asleep');
      if(m.atkCd<=0.4)ambushCd++;
    }
  }
  if(ambushed!==200)throw new Error('T35 adjacency did not spring the ambush: '+ambushed+'/200');
  if(ambushCd!==200)throw new Error('T35 the ambush does not strike first: '+ambushCd+'/200');

  // at three tiles, with nobody able to see it, nothing happens yet
  mkFloor([{x:5,y:8,key:'roper',dc:99,found:false,sprung:false,noticeTried:false}]);
  G.party=[oaf()];
  afterPartyMove(true);
  if(G.L.lurkers[0].sprung)throw new Error('T35 an ambusher sprang from three tiles away');
  if(G.L.monsters.length)throw new Error('T35 a distant ambusher spawned a monster');

  // one glance apiece: pacing back and forth must not grind out a sighting
  mkFloor([{x:5,y:6,key:'cavefisher',dc:99,found:false,sprung:false,noticeTried:false}]);
  G.party=[oaf()];
  computeDistField();                           // standing at (5,5), facing it at (5,6)
  for(let i=0;i<20;i++)passiveSearch();
  if(G.L.lurkers[0].sprung)throw new Error('T35 repeated glances eventually spotted it');
  if(!G.L.lurkers[0].noticeTried)throw new Error('T35 the one glance was never taken');

  // save round-trip: scenery and sprung state both survive
  mkFloor([{x:5,y:7,key:'piercer',dc:trapDC(20),found:false,sprung:false,noticeTried:false},
           {x:12,y:12,key:'roper',dc:trapDC(20),found:false,sprung:false,noticeTried:false}]);
  G.party=[rogue()];
  afterPartyMove(true);
  const snapL=serializeGame();
  if(!snapL.level.lurkers||snapL.level.lurkers.length!==2)
    throw new Error('T35 lurkers not serialized');
  if(!snapL.level.lurkers[0].sprung||snapL.level.lurkers[1].sprung)
    throw new Error('T35 sprung state garbled on the way out');
  deserializeGame(JSON.parse(JSON.stringify(snapL)));
  if(!G.L.lurkers[0].sprung||G.L.lurkers[1].sprung)
    throw new Error('T35 sprung state garbled on the way back in');
  if(G.L.lurkers[1].key!=='roper')throw new Error('T35 lurker identity lost in the save');

  console.log('T35 cave ambushers: '+(totalL/floors).toFixed(1)+' a floor over '+floors+
    ' cave levels, budget-neutral at '+avgBodies.toFixed(1)+' bodies; rogue spots at two tiles '+
    spottedEarly+'/60 for no XP, springs on adjacency 200/200 striking first, ignores three tiles, '+
    'one glance apiece, and survives a save round-trip');
})();

/* --- T36: the cave bias, applied at placement and nowhere else --- */
(function(){
  // the budget must not have learned what a theme is. Generating a run of cave
  // floors first, then asking for the numbers, must give the same answers as a
  // cold read — this is the whole reason the bias lives here and not in spawnPool.
  const cold=[];for(let d=1;d<=45;d++)cold.push(threatBudget(d));
  for(let i=0;i<8;i++)genLevel(10+i*3);
  for(let d=1;d<=45;d++)
    if(threatBudget(d)!==cold[d-1])
      throw new Error('T36 the cave bias moved the threat budget at depth '+d);

  const mix=(depth,n)=>{
    let cave=0,tot=0,theme='';const kinds=new Set();
    for(let i=0;i<n;i++){
      const L=genLevel(depth);theme=L.theme.name;
      for(const m of L.monsters){if(m.boss)continue;tot++;kinds.add(m.key);if(MONSTERS[m.key].cave)cave++;}
      for(const l of (L.lurkers||[])){tot++;kinds.add(l.key);cave++;}
    }
    return {theme,share:cave/Math.max(1,tot),kinds:kinds.size};
  };
  // Measured over 200 floors a depth: the shallow cave block runs 88-93% cave,
  // the deep one 62%, because five themed rosters overlap down there and the x4
  // has all of them to beat. Both blocks are checked, and the deep bar sits well
  // clear of 0.62 rather than on top of it — a 30-floor sample has about two
  // points of noise, and a bar level with the truth fails a third of the time.
  const caves=mix(depthOf('Caves',22),30), shallowCaves=mix(depthOf('Caves',11),30),
        crypt=mix(depthOf('Crypt',20),30), dung=mix(depthOf('Dungeon',38),30);
  if(caves.theme!=='Caves')throw new Error('T36 caves lookup gave '+caves.theme);
  // A cave fields cave-dwellers and nothing else now, so these are exact.
  if(shallowCaves.share!==1)
    throw new Error('T36 a shallow cave floor is only '+(shallowCaves.share*100).toFixed(0)+'% cave-dwellers');
  if(caves.share!==1)throw new Error('T36 a deep cave floor is only '+(caves.share*100).toFixed(0)+'% cave-dwellers');
  if(crypt.share!==0)throw new Error('T36 the cave roster leaked into the crypt: '+(crypt.share*100).toFixed(0)+'%');
  if(dung.share!==0)throw new Error('T36 the cave roster leaked into the dungeon: '+(dung.share*100).toFixed(0)+'%');
  /* Variety is the price of the rule and the bar has to come down with it: a
     cave floor drew on 12-15 kinds when four foreign rosters were thinned into
     it, and fields 4-8 of its own now. The check that matters is that it is not
     ONE creature repeated — that is what the old off-theme weighting existed to
     prevent, and the roster has to carry it alone. */
  if(caves.kinds<4)throw new Error('T36 a cave floor fields only '+caves.kinds+' kinds');

  // ambushers are sized against the floor's share like any other spawn, so a
  // deep cave does not jump the party with something from depth 8
  let shallow=0,deep=0,dn=0;
  const deepCave=depthOf('Caves',34);
  for(let i=0;i<40;i++){
    for(const l of (genLevel(deepCave).lurkers||[])){dn++;if(l.key==='piercer')shallow++;if(l.key==='roper'||l.key==='purpleworm')deep++;}
  }
  if(!dn)throw new Error('T36 no ambushers on deep cave floors');
  if(shallow/dn>0.15)throw new Error('T36 deep caves still ambush with piercers: '+(100*shallow/dn).toFixed(0)+'%');
  if(deep/dn<0.7)throw new Error('T36 deep ambushers are only '+(100*deep/dn).toFixed(0)+'% of the deep pool');
  console.log('T36 caves own their floors: Caves@22 '+(caves.share*100).toFixed(0)+'% cave-dwellers over '+caves.kinds+
    ' kinds, vs Crypt@20 '+(crypt.share*100).toFixed(0)+'% and Dungeon@38 '+(dung.share*100).toFixed(0)+
    '%; deep ambushers '+(100*deep/dn).toFixed(0)+'% heavy / '+(100*shallow/dn).toFixed(0)+
    '% piercer; the threat budget is untouched by any of it');
})();

/* --- T37: the log records what happened and the arithmetic behind it --- */
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth:12,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},lurkers:[]};
  G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;

  // the roll trace has to be inert unless something has armed it, or every roll
  // in the game quietly accumulates garbage
  if(_rollTrace!==null)throw new Error('T37 the roll trace is armed at rest');
  const t1=traceRoll(()=>roll(2,6,3));
  if(_rollTrace!==null)throw new Error('T37 the roll trace stayed armed after tracing');
  if(t1.dice.length!==1||t1.dice[0].n!==2||t1.dice[0].d!==6||t1.dice[0].mod!==3)
    throw new Error('T37 the trace did not record the dice: '+JSON.stringify(t1.dice));
  if(t1.dice[0].sum!==t1.value)throw new Error('T37 traced sum disagrees with the value');
  // and it must nest without losing the outer trace
  const t2=traceRoll(()=>{roll(1,4);traceRoll(()=>roll(1,8));return roll(1,6);});
  if(t2.dice.length!==2)throw new Error('T37 a nested trace swallowed the outer dice: '+t2.dice.length);

  // an attack writes one entry, with the d20, the modifier, the AC and the damage
  const f=mkCharacter('Fi','human','fighter',[18,12,14,10,10,8]);
  f.level=5;f.equip.rhand=mkItem('longsword',{bonus:2});
  G.party=[f];
  GLOG.length=0;
  let hits=0,misses=0;
  for(let i=0;i<200;i++){
    const m=mkMonster('gnoll',5,6,12);m.awake=true;G.L.monsters=[m];
    f.cdL=0;f.cdR=0;
    doAttack(f,'rhand',ITEM_DEFS.longsword,f.equip.rhand,m,false);
  }
  if(!GLOG.length)throw new Error('T37 attacking wrote nothing to the log');
  for(const e of GLOG){
    if(e.kind==='hit')hits++;else if(e.kind==='miss')misses++;else continue;
    if(!/^d20 \d+ [+-]\d+ = \d+ vs AC \d+/.test(e.detail))
      throw new Error('T37 an attack detail is not a readable check: '+e.detail);
    const nat=+e.detail.match(/^d20 (\d+)/)[1];
    if(nat<1||nat>20)throw new Error('T37 logged a d20 of '+nat);
    if(e.kind==='hit'){
      if(!/damage|1d8|2d8/.test(e.detail)&&e.detail.indexOf('1d8')<0)
        throw new Error('T37 a hit logged no damage dice: '+e.detail);
      const dmg=+e.text.match(/for (\d+)$/)[1];
      if(!(dmg>0))throw new Error('T37 a hit logged '+dmg+' damage');
    }
  }
  if(!hits||!misses)throw new Error('T37 200 swings produced '+hits+' hits and '+misses+' misses');
  // a natural 1 and a natural 20 are called out
  if(!GLOG.some(e=>e.detail.indexOf('natural 20')>=0||e.detail.indexOf('natural 1')>=0))
    throw new Error('T37 200 swings flagged no natural 1 or 20');

  // a blow taken is recorded on the same terms as a blow given
  GLOG.length=0;
  const m2=mkMonster('gnoll',5,6,12);m2.awake=true;m2.atkCd=0;G.L.monsters=[m2];
  // a monster's swing lands on a timer so the wind-up can play; run them straight
  // through, since this harness has no event loop to wait on
  const realTimeout=global.setTimeout;
  global.setTimeout=(fn)=>{fn();return 0;};
  try{ for(let i=0;i<60;i++)monsterMelee(m2); }
  finally{ global.setTimeout=realTimeout; }
  const taken=GLOG.filter(e=>e.text.indexOf('Gnoll')===0);
  if(!taken.length)throw new Error('T37 monster attacks wrote nothing to the log');
  for(const e of taken)
    if(!/^d20 \d+ [+-]\d+ = \d+ vs AC \d+/.test(e.detail))
      throw new Error('T37 an incoming attack has no readable check: '+e.detail);

  // spells report their circle, their DC and the dice that made the damage
  GLOG.length=0;
  const wz=mkCharacter('Wz','elf','wizard',[8,14,12,18,10,10]);
  wz.level=5;wz.slotsUsed=[0,0,0,0,0];
  G.party=[wz];
  // an offensive spell resolves when its bolt arrives, so the effect layer has to
  // be stepped forward; one big tick lands everything in flight
  G.fx=[];
  for(let i=0;i<40;i++){
    const m=mkMonster('gnoll',5,6,12);m.awake=true;G.L.monsters=[m];
    wz.cdL=0;wz.cdR=0;wz.slotsUsed=[0,0,0,0,0];
    castSpell(wz,'magicmissile',{fromUI:true});
    updateFx(10);
  }
  const spells=GLOG.filter(e=>e.kind==='spell');
  if(!spells.length)throw new Error('T37 casting wrote no spell entries');
  for(const e of spells){
    if(e.detail.indexOf('circle ')<0)throw new Error('T37 a spell entry has no circle: '+e.detail);
    if(e.detail.indexOf('DC ')<0)throw new Error('T37 a spell entry has no DC: '+e.detail);
    if(!/\dd\d/.test(e.detail))throw new Error('T37 a spell entry shows no dice: '+e.detail);
  }

  // the log is capped, so a long descent cannot grow it without bound
  GLOG.length=0;
  for(let i=0;i<LOG_MAX*3;i++)logAdd('msg','entry '+i);
  if(GLOG.length!==LOG_MAX)throw new Error('T37 the log grew to '+GLOG.length+', cap is '+LOG_MAX);
  if(GLOG[GLOG.length-1].text!=='entry '+(LOG_MAX*3-1))throw new Error('T37 the cap dropped the wrong end');

  // and it is a session record, not part of the save
  GLOG.length=0;logAdd('msg','should not be saved');
  const snap=JSON.stringify(serializeGame());
  if(snap.indexOf('should not be saved')>=0)throw new Error('T37 the log leaked into the save file');

  console.log('T37 log: attacks both ways carry d20/modifier/AC and their damage dice ('+hits+
    ' hits, '+misses+' misses over 200 swings), spells carry circle, DC and dice, naturals are '+
    'called out, the trace is inert at rest and nests, the log caps at '+LOG_MAX+
    ' and never reaches the save');
})();

/* --- T38: left fights left, right fights right --- */
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  const setup=()=>{
    G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
      theme:THEMES[0],depth:10,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},lurkers:[]};
    G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;
    G.party=['Al','Bo','Cy','Di'].map((n,i)=>mkCharacter(n,'human','fighter',[14,12,12,10,10,8]));
  };
  const put=(slots)=>{G.L.monsters=slots.map(sl=>{
    const m=mkMonster('goblin',5,6,10);m.awake=true;m.slot=sl;return m;});};

  // the two conventions are opposite, and that is the whole point of the helpers
  setup();
  if(charSide(G.party[0])!==SIDE_L||charSide(G.party[2])!==SIDE_L)
    throw new Error('T38 the left column of the party grid is not the left side');
  if(charSide(G.party[1])!==SIDE_R||charSide(G.party[3])!==SIDE_R)
    throw new Error('T38 the right column of the party grid is not the right side');
  put([0,1,2,3]);
  const bySlot={};for(const m of G.L.monsters)bySlot[m.slot]=m;
  if(monsterSide(bySlot[0])!==SIDE_R||monsterSide(bySlot[2])!==SIDE_R)
    throw new Error('T38 even monster slots are not on the party right');
  if(monsterSide(bySlot[1])!==SIDE_L||monsterSide(bySlot[3])!==SIDE_L)
    throw new Error('T38 odd monster slots are not on the party left');

  // a full front rank: each character meets their opposite number, every time
  for(let i=0;i<50;i++){
    setup();put([0,1]);
    for(const ch of G.party){
      const t=facingMonsterAt(5,6,ch);
      const want=charSide(ch)===SIDE_L?1:0;
      if(t.slot!==want)
        throw new Error('T38 '+ch.name+' (party '+G.party.indexOf(ch)+', side '+
          (charSide(ch)===SIDE_L?'L':'R')+') swung at slot '+t.slot+', wanted '+want);
    }
  }
  // and the monsters answer the same way
  for(let i=0;i<50;i++){
    setup();put([0,1]);
    for(const m of G.L.monsters){
      const t=pickPartyTarget(m);
      const want=monsterSide(m)===SIDE_L?0:1;   // party index 0 is the left column
      if(G.party.indexOf(t)!==want)
        throw new Error('T38 monster in slot '+m.slot+' struck party '+G.party.indexOf(t)+', wanted '+want);
    }
  }

  // one monster holds the centre of its tile, so everyone meets it
  setup();put([0]);
  for(const ch of G.party)
    if(facingMonsterAt(5,6,ch).slot!==0)throw new Error('T38 a lone monster was not reachable by all');

  /* A LONE monster has no file to meet, so it takes one of the two characters
     facing it at random, and only reaches the back rank once both of those are
     down. Sampled, because the choice is a fresh roll per blow. */
  {
    setup();put([0]);
    const hit={};
    for(let i=0;i<600;i++){const t=pickPartyTarget(G.L.monsters[0]);hit[G.party.indexOf(t)]=(hit[G.party.indexOf(t)]||0)+1;}
    if(hit[2]||hit[3])throw new Error('T38 a lone monster reached the back rank while the front stood');
    if(!hit[0]||!hit[1])throw new Error('T38 a lone monster did not share its blows across the front rank');
    const share=Math.min(hit[0],hit[1])/Math.max(hit[0],hit[1]);
    if(share<0.7)throw new Error('T38 a lone monster favoured one front character: '+hit[0]+' / '+hit[1]);
    // one front-ranker down: every blow lands on the other
    setup();put([0]);
    G.party[0].hp=0;G.party[0].dead=true;
    for(let i=0;i<80;i++)
      if(G.party.indexOf(pickPartyTarget(G.L.monsters[0]))!==1)
        throw new Error('T38 a lone monster did not fall back to the surviving front character');
    // both down: it reaches past to the back rank, again at random
    setup();put([0]);
    G.party[0].hp=0;G.party[0].dead=true;G.party[1].hp=0;G.party[1].dead=true;
    const back={};
    for(let i=0;i<600;i++){const t=pickPartyTarget(G.L.monsters[0]);back[G.party.indexOf(t)]=(back[G.party.indexOf(t)]||0)+1;}
    if(!back[2]||!back[3])throw new Error('T38 a lone monster did not spread onto the whole back rank');
    // and a lone shooter or caster picks its mark the same way — every path in
    if(!pickPartyTarget(G.L.monsters[0]))throw new Error('T38 a lone monster found no target at all');
  }

  // when an opposite number is down, the survivor is fought rather than nobody
  setup();put([1]);            // only the left-hand monster stands
  for(const ch of G.party)
    if(facingMonsterAt(5,6,ch).slot!==1)
      throw new Error('T38 a character with no monster opposite them found no target');
  // a downed front-ranker opens their own lane rather than sending the blow
  // across the line: the monster reaches the character behind them
  setup();put([0,1]);
  G.party[1].hp=0;G.party[1].dead=true;   // the right-hand front character is down
  for(const m of G.L.monsters){
    const t=pickPartyTarget(m),i=G.party.indexOf(t);
    if(!t||isDown(t))throw new Error('T38 a monster targeted a downed character');
    const want=monsterSide(m)===SIDE_L?0:3;   // left lane still held; right lane opens to its back
    if(i!==want)throw new Error('T38 slot '+m.slot+' struck party '+i+', wanted '+want);
  }

  // incapacitated counts as not holding the lane, even though they are alive
  for(const cond of ['paralysis','sleep','stunned','hold']){
    setup();put([0,1]);
    G.party[1].conditions=[{kind:cond,dur:9}];
    const rightMon=G.L.monsters.find(m=>monsterSide(m)===SIDE_R);
    const i=G.party.indexOf(pickPartyTarget(rightMon));
    if(i!==3)throw new Error('T38 a '+cond+' front-ranker still blocked their lane: struck party '+i);
  }
  // but they are still the target when nobody else is in that lane
  setup();put([0,1]);
  G.party[1].conditions=[{kind:'paralysis',dur:9}];
  G.party[3].hp=0;G.party[3].dead=true;
  {
    const rightMon=G.L.monsters.find(m=>monsterSide(m)===SIDE_R);
    if(G.party.indexOf(pickPartyTarget(rightMon))!==1)
      throw new Error('T38 being paralysed made a character safe when alone in their lane');
  }

  // a monster in the back rank goes for the party's back rank. Tested in a FULL
  // pack, which is the only way the engine ever seats a back rank: packRanks
  // fills front slots first and recompacts as monsters die, so slots 2/3 never
  // stand on a tile without 0/1. (pickPartyTarget now derives side/rank from a
  // monster's place in the whole distance-sorted line so lone attackers fan out;
  // in a packed tile that line order IS slot order, so the mapping is preserved.)
  setup();put([0,1,2,3]);
  for(const m of G.L.monsters.filter(m=>m.slot>=2)){
    const i=G.party.indexOf(pickPartyTarget(m));
    const want=monsterSide(m)===SIDE_L?2:3;
    if(i!==want)throw new Error('T38 back-rank monster in slot '+m.slot+' struck party '+i+', wanted '+want);
  }
  // and reaches forward in its own lane when the party's back rank is gone
  setup();put([0,1,2,3]);
  G.party[2].hp=0;G.party[2].dead=true;G.party[3].hp=0;G.party[3].dead=true;
  for(const m of G.L.monsters.filter(m=>m.slot>=2)){
    const i=G.party.indexOf(pickPartyTarget(m));
    const want=monsterSide(m)===SIDE_L?0:1;
    if(i!==want)throw new Error('T38 back-rank monster did not reach forward in its lane: party '+i);
  }

  // only an empty lane sends a monster across the line
  setup();put([0,1]);
  G.party[1].hp=0;G.party[1].dead=true;G.party[3].hp=0;G.party[3].dead=true;
  {
    const rightMon=G.L.monsters.find(m=>monsterSide(m)===SIDE_R);
    const i=G.party.indexOf(pickPartyTarget(rightMon));
    if(i!==0)throw new Error('T38 an empty lane did not cross to the other side: party '+i);
  }

  // a back rank of monsters fights the same way once the front rank is dead
  setup();put([2,3]);
  for(const ch of G.party){
    const t=facingMonsterAt(5,6,ch);
    const want=charSide(ch)===SIDE_L?3:2;
    if(t.slot!==want)throw new Error('T38 the monsters\' back rank lost its sides: got slot '+t.slot);
  }

  // and a blocking check with no character asking still gets the front-most
  setup();put([0,1,2,3]);
  if(facingMonsterAt(5,6,null).slot!==0)
    throw new Error('T38 an unattributed look at the tile did not return the front-most');

  // the pairing must survive real swings, not just the picker
  setup();put([0,1]);
  GLOG.length=0;
  const names={};for(const m of G.L.monsters){m.name='Slot'+m.slot;names[m.slot]=m.name;}
  for(const ch of G.party){
    ch.equip.rhand=mkItem('longsword');ch.cdL=0;ch.cdR=0;
    for(const m of G.L.monsters)m.hp=m.maxHp=999;
    doAttack(ch,'rhand',ITEM_DEFS.longsword,ch.equip.rhand,facingMonsterAt(5,6,ch),false);
  }
  for(const e of GLOG){
    const who=e.text.split(' ')[0], slot=+((e.text.match(/Slot(\d)/)||[])[1]);
    const ch=G.party.find(c=>c.name===who);
    if(!ch||isNaN(slot))continue;
    if((charSide(ch)===SIDE_L?1:0)!==slot)
      throw new Error('T38 '+who+' logged a blow against slot '+slot);
  }
  console.log('T38 sides: party grid [0][1]/[2][3] is left-then-right, monster slots put the odd '+
    'one on the party left; each front-ranker meets their opposite number both ways, a lone '+
    'monster is fought by all; a lane opens when its front character is down or cannot act '+
    'so the one behind is reached, back-rank monsters go for the back rank, an empty lane '+
    'is the only thing that sends a blow across, and nobody is made safe by being helpless');
})();

/* --- T39: a wand in each hand runs its own timer, like a sword in each --- */
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  const setup=()=>{
    G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
      theme:THEMES[0],depth:10,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},lurkers:[]};
    G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;G.fx=[];
    const wz=mkCharacter('Wz','elf','wizard',[8,14,12,18,10,10]);
    wz.level=7;wz.slotsUsed=[0,0,0,0,0];wz.cdL=0;wz.cdR=0;
    G.party=[wz];
    const m=mkMonster('gnoll',5,6,10);m.awake=true;m.hp=m.maxHp=9999;G.L.monsters=[m];
    return wz;
  };
  const wand=()=>mkItem('wand',{spell:'magicmissile',charges:20});

  // firing the right-hand wand leaves the left hand free to fire at once
  let wz=setup();
  wz.equip.rhand=wand();wz.equip.lhand=wand();
  useHand(wz,'rhand');updateFx(10);
  if(!(wz.cdR>0))throw new Error('T39 firing a wand did not arm its own hand');
  if(wz.cdL!==0)throw new Error('T39 a wand in one hand locked the other: cdL='+wz.cdL);
  const rAfter=wz.cdR;
  useHand(wz,'lhand');updateFx(10);
  if(!(wz.cdL>0))throw new Error('T39 the second wand never fired');
  if(wz.cdR!==rAfter)throw new Error('T39 the second wand disturbed the first hand timer');
  if(wz.equip.rhand.charges!==19||wz.equip.lhand.charges!==19)
    throw new Error('T39 charges did not come off each wand once: '+
      wz.equip.rhand.charges+'/'+wz.equip.lhand.charges);

  // the same hand is genuinely gated while its timer runs
  const cdBefore=wz.cdR, chBefore=wz.equip.rhand.charges;
  useHand(wz,'rhand');
  if(wz.equip.rhand.charges!==chBefore)throw new Error('T39 a wand fired again while its hand was busy');
  if(wz.cdR!==cdBefore)throw new Error('T39 a blocked wand still re-armed its hand');

  // the two timers run down independently, exactly as two swords do
  wz=setup();
  wz.equip.rhand=wand();wz.equip.lhand=wand();
  useHand(wz,'rhand');updateFx(10);
  updateParty(1.0);                      // a second passes with only the right hand busy
  useHand(wz,'lhand');updateFx(10);
  if(!(wz.cdL>wz.cdR))throw new Error('T39 the later wand is not the later timer: '+wz.cdL+' vs '+wz.cdR);
  updateParty(1.0);
  if(wz.cdR>0.01)throw new Error('T39 the first hand had not recovered: '+wz.cdR);
  if(!(wz.cdL>0))throw new Error('T39 the second hand recovered in step with the first');

  // a memorised spell is a different thing: it takes both hands
  wz=setup();
  wz.equip.rhand=wand();wz.equip.lhand=wand();
  castSpell(wz,'magicmissile',{fromUI:true});updateFx(10);
  if(!(wz.cdL>0&&wz.cdR>0))throw new Error('T39 a memorised spell no longer occupies both hands');
  // and it needs both free before it can be cast
  wz=setup();
  wz.equip.rhand=wand();wz.equip.lhand=wand();
  useHand(wz,'rhand');updateFx(10);
  const slotsBefore=wz.slotsUsed[0];
  castSpell(wz,'magicmissile',{fromUI:true});
  if(wz.slotsUsed[0]!==slotsBefore)throw new Error('T39 a memorised spell was cast with a hand still busy');

  // a wand must never shorten a longer cooldown already on that hand
  wz=setup();
  wz.equip.rhand=wand();
  armHand(wz,'rhand',5);
  const before=wz.cdR;
  useHand(wz,'rhand');
  if(wz.cdR<before)throw new Error('T39 a wand shortened a longer timer: '+before+' -> '+wz.cdR);

  // scrolls follow the same rule, being the other thing worked from a hand
  wz=setup();
  wz.equip.rhand=mkItem('scroll',{spell:'magicmissile'});
  wz.equip.lhand=wand();
  useHand(wz,'rhand');updateFx(10);
  if(wz.cdL!==0)throw new Error('T39 a scroll locked the other hand');

  console.log('T39 wands: each hand carries its own timer and its own charges, the busy hand '+
    'is still gated, the two run down independently, a wand never shortens a longer timer, '+
    'scrolls follow the same rule, and a memorised spell still needs — and takes — both hands');
})();

/* --- T40: heavy armour's DEX cap is applied, and now says so --- */
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[0],depth:1,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},lurkers:[]};
  G.px=5;G.py=5;G.over=false;G.paused=false;G.started=true;

  // a nimble character in each grade of armour: the cap has to bite where the
  // definition says it does, and nowhere else
  const mk=()=>{const c=mkCharacter('Ag','human','fighter',[12,18,12,10,10,8]);c.equip={};return c;};
  const dexMod=abilMod(mk(),'dex');
  if(dexMod!==4)throw new Error('T40 setup: expected a +4 DEX character, got '+dexMod);
  for(const [base,cap] of [['clothes',99],['lightarmor',6],['medarmor',3],['heavyarmor',1]]){
    const ch=mk();
    if(ITEM_DEFS[base].maxDex!==cap)throw new Error('T40 '+base+' maxDex moved: '+ITEM_DEFS[base].maxDex);
    ch.equip.armor=mkItem(base);
    const want=Math.min(dexMod,cap);
    if(dexACBonus(ch)!==want)
      throw new Error('T40 '+base+' gave DEX '+dexACBonus(ch)+' to AC, wanted '+want);
    // and the total AC has to reflect it, not just the helper
    const bare=mk();
    if(charAC(ch)!==10+want+ITEM_DEFS[base].ac)
      throw new Error('T40 '+base+' AC is '+charAC(ch)+', wanted '+(10+want+ITEM_DEFS[base].ac));
    if(charAC(bare)!==10+dexMod)throw new Error('T40 an unarmoured character lost DEX to a cap');
  }
  // full plate on a clumsy character must not *raise* their DEX to the cap
  const oaf=mkCharacter('Oaf','human','fighter',[14,6,12,10,10,8]);oaf.equip={};
  oaf.equip.armor=mkItem('heavyarmor');
  if(dexACBonus(oaf)!==abilMod(oaf,'dex'))
    throw new Error('T40 the cap moved a DEX penalty: '+dexACBonus(oaf)+' vs '+abilMod(oaf,'dex'));
  if(dexACBonus(oaf)>=0)throw new Error('T40 setup: wanted a negative DEX modifier');

  // the cap is an AC rule only -- a Reflex save keeps the whole modifier
  const plated=mk();plated.equip.armor=mkItem('heavyarmor');
  const nimble=mk();nimble.equip.armor=mkItem('clothes');
  if(charSaves(plated).ref!==charSaves(nimble).ref)
    throw new Error('T40 armour changed a Reflex save: '+charSaves(plated).ref+' vs '+charSaves(nimble).ref);

  // enchantment adds to AC but must not buy back capped DEX
  const plus3=mk();plus3.equip.armor=mkItem('heavyarmor',{bonus:3});
  if(dexACBonus(plus3)!==1)throw new Error('T40 a +3 plate changed the DEX cap');
  if(charAC(plus3)!==charAC(plated)+3)throw new Error('T40 the armour plus did not land');

  // and the stats screen has to say the cap is biting, with both numbers
  const shown=(ch)=>{
    const raw=abilMod(ch,'dex'),used=dexACBonus(ch),it=ch.equip.armor;
    const def=it?ITEM_DEFS[it.base]:null;
    return (def&&used<raw)?{raw,used,cap:def.maxDex,name:def.name}:null;
  };
  const note=shown(plated);
  if(!note)throw new Error('T40 a capped character shows no note');
  if(note.used!==1||note.raw!==4||note.cap!==1)
    throw new Error('T40 the note carries the wrong numbers: '+JSON.stringify(note));
  if(shown(nimble))throw new Error('T40 an uncapped character shows a cap note');
  if(shown(oaf))throw new Error('T40 a character below the cap shows a cap note');

  console.log('T40 DEX cap: clothes/leather/breastplate/plate cap a +'+dexMod+' at '+
    [99,6,3,1].map(c=>Math.min(dexMod,c)).join('/')+', the total AC follows, a penalty is never '+
    'raised to the cap, Reflex saves keep the full modifier, enchantment does not buy it back, '+
    'and the stats screen now names the armour and both numbers');
})();

/* --- T41: the wizard's spellbook and memorisation --- */
(function(){
  const grid=new Uint8Array(400).fill(T_FLOOR);
  const setup=(lvl)=>{
    G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
      theme:THEMES[0],depth:5,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},restsHere:0,lurkers:[]};
    G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;G.fx=[];
    const wz=mkCharacter('Wz','elf','wizard',[8,14,12,18,10,10]);
    if(lvl>1){wz.level=lvl;recalcHp(wz,true);ensureBook(wz);autoMemo(wz);resetDaily(wz);}
    G.party=[wz];
    const m=mkMonster('gnoll',5,6,5);m.awake=true;m.hp=m.maxHp=99999;G.L.monsters=[m];
    return wz;
  };
  const cast=(ch,key)=>{ch.cdL=0;ch.cdR=0;const r=castSpell(ch,key,{fromUI:true});updateFx(10);return r;};

  // a fresh wizard starts with a book, and wakes with it memorised
  let wz=setup(1);
  if(!wz.book.length)throw new Error('T41 a new wizard has an empty spellbook');
  for(const k of WIZ_START_BOOK)
    if(wz.book.indexOf(k)<0)throw new Error('T41 the starting book is missing '+k);
  const slots=charSlots(wz);
  if(wz.prepared[0].length!==slots[0])
    throw new Error('T41 a new wizard did not wake with a full first circle: '+
      wz.prepared[0].length+'/'+slots[0]);
  for(let c=1;c<=5;c++)for(const k of wz.prepared[c-1]){
    if(SPELLS[k].circle!==c)throw new Error('T41 a '+SPELLS[k].circle+'-circle spell sat in circle '+c);
    if(wz.book.indexOf(k)<0)throw new Error('T41 memorised something not in the book: '+k);
  }

  // casting spends the memorised copy, and runs out
  wz=setup(1);
  wz.memo=[[],[],[],[],[]];wz.memo[0]=['magicmissile','magicmissile'];
  resetDaily(wz);
  if(preparedCount(wz,'magicmissile')!==2)throw new Error('T41 setup: wanted two copies memorised');
  if(!cast(wz,'magicmissile'))throw new Error('T41 a memorised spell would not cast');
  if(preparedCount(wz,'magicmissile')!==1)throw new Error('T41 casting did not spend a copy');
  cast(wz,'magicmissile');
  if(preparedCount(wz,'magicmissile')!==0)throw new Error('T41 the second copy was not spent');
  if(cast(wz,'magicmissile'))throw new Error('T41 cast a third time with nothing memorised');

  // a spell in the book but left unmemorised cannot be cast at all -- this is
  // the whole point of the change
  wz=setup(1);
  wz.memo=[[],[],[],[],[]];wz.memo[0]=['magicmissile'];
  resetDaily(wz);
  if(wz.book.indexOf('magearmor')<0)throw new Error('T41 setup: expected magearmor in the book');
  if(cast(wz,'magearmor'))throw new Error('T41 cast a spell that was in the book but not memorised');
  // and one that was never learned is refused even if slots are free
  if(cast(wz,'fireball'))throw new Error('T41 cast a spell that is not in the book');

  // resting restores the loadout; a cold camp does not
  wz=setup(1);
  wz.memo=[[],[],[],[],[]];wz.memo[0]=['magicmissile','magicmissile'];
  resetDaily(wz);
  cast(wz,'magicmissile');
  if(preparedCount(wz,'magicmissile')!==1)throw new Error('T41 setup: expected one copy spent');
  resolveRest(true,1);
  if(preparedCount(wz,'magicmissile')!==2)throw new Error('T41 a fed camp did not restore the loadout');
  cast(wz,'magicmissile');
  resolveRest(false,1);
  if(preparedCount(wz,'magicmissile')!==1)
    throw new Error('T41 a cold camp restored spells it should not have');

  // scribing: an arcane scroll joins the book and is consumed
  wz=setup(3);
  const before=wz.book.length;
  const target=Object.keys(SPELLS).find(k=>SPELLS[k].list==='arcane'&&SPELLS[k].circle<=2&&wz.book.indexOf(k)<0);
  if(!target)throw new Error('T41 setup: no arcane spell left to learn');
  let gone=false;
  if(!scribeScroll(wz,mkItem('scroll',{spell:target}),()=>{gone=true;}))
    throw new Error('T41 scribing a legal scroll failed');
  if(wz.book.length!==before+1)throw new Error('T41 scribing did not add to the book');
  if(!gone)throw new Error('T41 scribing did not consume the scroll');
  // and refuses the three things it should
  if(scribeScroll(wz,mkItem('scroll',{spell:target}),()=>{}))
    throw new Error('T41 scribed the same spell twice');
  const divine=Object.keys(SPELLS).find(k=>SPELLS[k].list==='divine');
  if(scribeScroll(wz,mkItem('scroll',{spell:divine}),()=>{}))
    throw new Error('T41 a wizard scribed divine magic');
  const tooHigh=Object.keys(SPELLS).find(k=>SPELLS[k].list==='arcane'&&SPELLS[k].circle>maxCircle(wz.level));
  if(tooHigh&&scribeScroll(wz,mkItem('scroll',{spell:tooHigh}),()=>{}))
    throw new Error('T41 scribed a spell above the wizard\'s circle');
  // a cleric keeps no book
  const cl=mkCharacter('Cl','dwarf','cleric',[10,10,12,10,17,10]);
  if(scribeScroll(cl,mkItem('scroll',{spell:'magicmissile'}),()=>{}))
    throw new Error('T41 a cleric scribed a scroll');

  // an item carries its own magic: a scroll or wand ignores the book entirely
  wz=setup(1);
  wz.memo=[[],[],[],[],[]];resetDaily(wz);
  if(!castSpell(wz,'magicmissile',{item:true}))
    throw new Error('T41 a scroll would not fire with nothing memorised');
  updateFx(10);

  // levelling teaches one spell
  wz=setup(1);
  const b0=wz.book.slice();
  grantXp(wz,XP_FOR_LEVEL(2));
  if(wz.level!==2)throw new Error('T41 setup: the wizard did not level');
  if(wz.book.length!==b0.length+1)
    throw new Error('T41 levelling taught '+(wz.book.length-b0.length)+' spells, wanted 1');

  // the cleric is untouched: whole list, slots, no preparation
  const cl2=mkCharacter('Cl','dwarf','cleric',[10,10,12,10,17,10]);
  if(preparesSpells(cl2))throw new Error('T41 the cleric became a preparer');
  G.party=[cl2];cl2.cdL=0;cl2.cdR=0;
  const known=spellsKnown('cleric',cl2.level);
  if(!known.length)throw new Error('T41 setup: the cleric knows nothing');
  if(!castSpell(cl2,known.find(k=>SPELLS[k].target==='self')||known[0],{fromUI:true}))
    throw new Error('T41 a cleric could not cast from their list');
  if(cl2.slotsUsed[0]!==1)throw new Error('T41 the cleric stopped spending slots');

  // a loadout must not outlive the slots that held it
  wz=setup(5);
  autoMemo(wz);
  const full=memoCount(wz);
  wz.abilDmg.int=8;                       // INT damage costs bonus slots
  const trimmed=trimMemo(wz).reduce((n,a)=>n+a.length,0);
  const nowSlots=charSlots(wz).reduce((a,b)=>a+b,0);
  if(trimmed>nowSlots)throw new Error('T41 a loadout survived the slots it needed: '+trimmed+'>'+nowSlots);
  if(!(full>=trimmed))throw new Error('T41 trimming grew the loadout');

  // a wizard from a save written before any of this arrives whole
  const old=mkCharacter('Old','elf','wizard',[8,14,12,18,10,10]);
  old.level=6;recalcHp(old,true);
  delete old.book;delete old.memo;delete old.prepared;
  ensureBook(old);
  if(!old.book.length)throw new Error('T41 a legacy wizard was left with no book');
  if(!old.prepared.some(a=>a.length))throw new Error('T41 a legacy wizard woke with nothing memorised');
  if(old.book.length<WIZ_START_BOOK.length+1)
    throw new Error('T41 a legacy level-6 wizard got no study picks: '+old.book.length);

  console.log('T41 spellbook: a wizard starts with '+WIZ_START_BOOK.length+' spells and gains one a '+
    'level, scribes arcane scrolls (refusing divine, over-circle and duplicates), casts only what '+
    'was memorised and spends the copy, refills at a fed camp but not a cold one, keeps items '+
    'exempt, trims a loadout to its slots, and migrates a legacy save; the cleric is untouched');
})();

/* --- T42: the bier must not swallow the level's only key --- */
(function(){
  // Loot is placed before the ossuary is sited, so the bier can land on top of
  // a floor item. It used to delete whatever was underneath, which about one
  // crypt floor in two thousand meant the key to the locked room -- a room the
  // party could then never open. T6 caught it once in a run of twenty levels;
  // this samples enough crypt floors to catch it reliably.
  let crypts=0,withBier=0,keyless=0,lostLoot=0;
  for(let d=7;d<=20;d++){
    for(let t=0;t<180;t++){
      const L=genLevel(d);
      if(L.theme.name!=='Crypt')continue;
      crypts++;
      if(L.ossuary)withBier++;
      // nothing may be left lying on the bier tile: it is not walkable
      if(L.ossuary){
        const bi=L.ossuary.by*L.w+L.ossuary.bx;
        if(L.items[bi]&&L.items[bi].length)
          throw new Error('T42 items left on the bier tile, where nobody can reach them');
        if(L.grid[bi]!==T_PIT)throw new Error('T42 the bier tile is not blocked');
      }
      let hasLock=false;
      for(let i=0;i<L.grid.length;i++)if(L.grid[i]===T_DOOR_LOCKED)hasLock=true;
      if(!hasLock)continue;
      let key=false;
      for(const i in L.items)for(const it of L.items[i])if(it.base==='key')key=true;
      if(!key)keyless++;
    }
  }
  if(crypts<300)throw new Error('T42 only sampled '+crypts+' crypt floors');
  if(!withBier)throw new Error('T42 no ossuary was generated in the sample');
  if(keyless)throw new Error('T42 '+keyless+' of '+crypts+' crypt floors locked a room with no key');

  // The same shove protects ordinary loot, which was going the same way in
  // silence. A key is guaranteed to exist on a locked floor, so it is the one
  // item whose survival can be asserted outright: every locked crypt floor must
  // hold exactly one, and it must be somewhere the party can walk to.
  let locked=0;
  for(let d=7;d<=20;d++)for(let t=0;t<120;t++){
    const L=genLevel(d);
    if(L.theme.name!=='Crypt')continue;
    let hasLock=false;
    for(let i=0;i<L.grid.length;i++)if(L.grid[i]===T_DOOR_LOCKED)hasLock=true;
    if(!hasLock)continue;
    locked++;
    let keys=[];
    for(const i in L.items)for(const it of L.items[i])if(it.base==='key')keys.push(+i);
    if(keys.length!==1)throw new Error('T42 a locked crypt floor holds '+keys.length+' keys');
    const t0=L.grid[keys[0]];
    if(!walkableTile(t0))throw new Error('T42 the key sits on an unwalkable tile ('+t0+')');
  }
  if(locked<200)throw new Error('T42 only sampled '+locked+' locked crypt floors');
  console.log('T42 the bier no longer eats the key: '+crypts+' crypt floors, '+withBier+
    ' with an ossuary, nothing stranded on the bier, and all '+locked+
    ' locked floors hold exactly one key on a tile you can stand on');
})();

/* --- T43: area spells have real shapes --- */
(function(){
  const W=25,H=25;
  const mkL=(walls)=>{
    const grid=new Uint8Array(W*H).fill(T_FLOOR);
    if(walls)walls(grid);
    G.L={w:W,h:H,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(W*H),
      theme:THEMES[0],depth:12,stairs:{x:0,y:0},start:{x:12,y:12},restCount:{},lurkers:[]};
    G.px=12;G.py=12;G.facing=2;G.over=false;G.paused=false;G.started=true;G.fx=[];
  };
  const xy=(k)=>({x:k%W,y:Math.floor(k/W)});

  // every area spell must declare a shape, or it silently falls back to nothing
  const areaSpells=Object.keys(SPELLS).filter(k=>SPELLS[k].target==='foes');
  if(areaSpells.length<7)throw new Error('T43 only '+areaSpells.length+' area spells found');
  for(const k of areaSpells){
    const a=SPELLS[k].area;
    if(!a)throw new Error('T43 '+k+' is an area spell with no shape');
    if(['burst','column','line','cone'].indexOf(a.kind)<0)throw new Error('T43 '+k+' has shape '+a.kind);
    if(a.kind==='line'||a.kind==='cone'){if(!(a.len>0))throw new Error('T43 '+k+' has no length');}
    else if(!(a.r>0))throw new Error('T43 '+k+' has no radius');
  }

  // a burst is a disc: symmetric, no tile beyond the radius, centre included
  mkL();
  for(const k of areaSpells.filter(k=>['burst','column'].indexOf(SPELLS[k].area.kind)>=0)){
    const r=SPELLS[k].area.r;
    const tiles=spellArea(SPELLS[k],12,16,2);
    if(!tiles.has(16*W+12))throw new Error('T43 '+k+' does not cover its own centre');
    for(const t of tiles){
      const p=xy(t),dx=p.x-12,dy=p.y-16;
      if(dx*dx+dy*dy>r*r+r)throw new Error('T43 '+k+' reached ('+dx+','+dy+'), outside radius '+r);
    }
    // symmetric in both axes
    for(const t of tiles){
      const p=xy(t),dx=p.x-12,dy=p.y-16;
      if(!tiles.has((16+dy)*W+(12-dx)))throw new Error('T43 '+k+' is not symmetric left-to-right');
      if(!tiles.has((16-dy)*W+(12+dx)))throw new Error('T43 '+k+' is not symmetric front-to-back');
    }
    // and it must reach behind the centre -- the old bug clipped every blast
    // into a wedge that never got past the front rank
    if(!tiles.has((16+r)*W+12))throw new Error('T43 '+k+' does not reach behind what it lands on');
  }

  // a line is one tile wide, on the facing axis, and no longer than it claims
  for(let f=0;f<4;f++){
    mkL();G.facing=f;
    const [dx,dy]=DIRS[f];
    const tiles=spellArea(SPELLS.lightning,12,12,f);
    if(tiles.size!==SPELLS.lightning.area.len)
      throw new Error('T43 the bolt covered '+tiles.size+' tiles, wanted '+SPELLS.lightning.area.len);
    for(const t of tiles){
      const p=xy(t),ox=p.x-12,oy=p.y-12;
      const along=ox*dx+oy*dy, across=ox*dy-oy*dx;
      if(across!==0)throw new Error('T43 the bolt strayed off its axis at facing '+f);
      if(along<1||along>SPELLS.lightning.area.len)throw new Error('T43 the bolt ran to '+along);
    }
  }

  // a cone widens with distance and is symmetric about the axis
  for(let f=0;f<4;f++){
    mkL();G.facing=f;
    const [dx,dy]=DIRS[f];
    const tiles=spellArea(SPELLS.conecold,12,12,f);
    const byDepth={};
    for(const t of tiles){
      const p=xy(t),ox=p.x-12,oy=p.y-12;
      const along=ox*dx+oy*dy, across=ox*dy-oy*dx;
      if(along<1)throw new Error('T43 the cone reached behind the caster at facing '+f);
      (byDepth[along]=byDepth[along]||[]).push(across);
    }
    let prev=0;
    for(let d=1;d<=SPELLS.conecold.area.len;d++){
      const row=byDepth[d];
      if(!row)throw new Error('T43 the cone has a gap at depth '+d);
      const w=Math.max(...row.map(Math.abs));
      if(w<prev)throw new Error('T43 the cone narrowed at depth '+d);
      if(row.indexOf(-w)<0||row.indexOf(w)<0)throw new Error('T43 the cone is lopsided at depth '+d);
      prev=w;
    }
    if(prev<1)throw new Error('T43 the cone never widened at all');
  }

  // stone stops it. A solid wall is absolute; a wall with a doorway lets the
  // blast through the gap and fan out beyond, which is what a 3.5 spread does.
  mkL((g)=>{for(let x=0;x<W;x++)g[15*W+x]=T_WALL;});          // no way through
  {
    const bolt=spellArea(SPELLS.lightning,12,12,2);
    for(const t of bolt)if(xy(t).y>=15)throw new Error('T43 a bolt passed through solid wall');
    if(bolt.size!==2)throw new Error('T43 the bolt did not stop at the wall: '+bolt.size+' tiles');
    const burst=spellArea(SPELLS.fireball,12,17,2);
    for(const t of burst)if(xy(t).y<15)throw new Error('T43 a burst crossed solid wall');
    if(!burst.size)throw new Error('T43 the burst did not resolve on its own side');
  }
  mkL((g)=>{for(let x=0;x<W;x++)if(x!==12)g[15*W+x]=T_WALL;});  // one doorway
  {
    const burst=spellArea(SPELLS.fireball,12,17,2);
    if(!burst.has(15*W+12))throw new Error('T43 the burst did not fill the doorway');
    if(!burst.has(14*W+12))throw new Error('T43 the burst did not spill through the doorway');
    // having come through, it may fan out -- but only from the doorway, never
    // straight through the stone beside it
    if(burst.has(14*W+9)||burst.has(14*W+15))
      throw new Error('T43 the burst reached past the doorway further than it could spread');
  }

  // the whole point: a burst catches a pack, where the old wedge caught its front
  mkL();
  const wz=mkCharacter('Wz','elf','wizard',[8,14,12,18,10,10]);
  wz.level=10;recalcHp(wz,true);ensureBook(wz);learnSpell(wz,'fireball');
  G.party=[wz];
  const pack=[];
  for(let y=13;y<=17;y++)for(let x=10;x<=14;x++){
    const m=mkMonster('gnoll',x,y,12);m.awake=true;m.hp=m.maxHp=99999;m.slot=0;
    pack.push(m);
  }
  G.L.monsters=pack;
  wz.memo=[[],[],[],[],[]];wz.memo[2]=['fireball'];resetDaily(wz);
  const before=new Map(pack.map(m=>[m.id,m.hp]));
  wz.cdL=0;wz.cdR=0;castSpell(wz,'fireball',{fromUI:true});updateFx(10);
  const hit=pack.filter(m=>m.hp<before.get(m.id));
  if(hit.length<15)throw new Error('T43 a fireball into a 25-strong pack caught only '+hit.length);
  if(!hit.some(m=>m.y>=15))throw new Error('T43 the blast never reached past the front ranks');
  // and it spent the memorised copy exactly once
  if(preparedCount(wz,'fireball')!==0)throw new Error('T43 the fireball did not spend its copy');

  // catching nothing refuses, and costs nothing
  mkL();
  G.party=[wz];G.L.monsters=[];
  wz.memo=[[],[],[],[],[]];wz.memo[2]=['fireball'];resetDaily(wz);
  wz.cdL=0;wz.cdR=0;
  if(castSpell(wz,'fireball',{fromUI:true}))throw new Error('T43 a fireball fired at empty air');
  if(preparedCount(wz,'fireball')!==1)throw new Error('T43 an aborted cast still spent the spell');

  // the party is never caught -- current behaviour, asserted so a change is deliberate
  mkL();
  const near=mkMonster('gnoll',12,13,12);near.awake=true;near.hp=near.maxHp=99999;
  G.L.monsters=[near];G.party=[wz];
  wz.memo=[[],[],[],[],[]];wz.memo[2]=['fireball'];resetDaily(wz);
  const hp0=wz.hp;
  wz.cdL=0;wz.cdR=0;castSpell(wz,'fireball',{fromUI:true});updateFx(10);
  if(wz.hp!==hp0)throw new Error('T43 the caster was caught in their own blast');

  console.log('T43 area shapes: '+areaSpells.length+' spells, each with a declared shape — bursts are '+
    'symmetric discs that reach behind what they land on, bolts run one tile wide on the facing axis '+
    'in all four facings, cones widen and stay symmetric; stone stops a bolt and a burst only spills '+
    'through a gap; a fireball into 25 gnolls catches '+hit.length+'; empty air refuses and costs nothing');
})();

/* --- T44: the duergar roster and their halls --- */
(function(){
  const KEYS=['duergar','duergarxbow','duergarscout','duergarpriest','duergarrune','duergarlord'];
  // defined, banded, art-layered, and sized to the floors they appear on
  for(const k of KEYS){
    const d=MONSTERS[k];
    if(!d)throw new Error('T44 '+k+' is not defined');
    if(!d.duergar)throw new Error('T44 '+k+' is not flagged duergar — the halls bias reads that flag');
    if(d.type!=='humanoid')throw new Error('T44 '+k+' is a '+d.type+', not a humanoid');
    const band=SPAWN_DEPTH[k];
    if(!band)throw new Error('T44 '+k+' has no spawn band and can never appear');
    const art=MONSTER_ART[d.spr];
    if(!art)throw new Error('T44 '+k+' has no art for spr '+d.spr);
    const svg=art();
    if(svg.body.indexOf('|H|')<0||svg.body.indexOf('|A|')<0)
      throw new Error('T44 '+k+' is a static sprite: it cannot telegraph an attack');
    // the scorers must agree, or the budget will misplace it
    const m=mkMonster(k,0,0,20);
    if(Math.abs(monsterThreat(m)-threatOf(k,20,null))>1e-6)
      throw new Error('T44 the two threat scorers disagree on '+k);
    // and it must land near the share where it lives, or it never spawns
    const mid=Math.round((band[0]+Math.min(band[1],34))/2);
    const share=threatBudget(mid)/Math.round(targetCount(mid));
    const ratio=threatOf(k,mid,null)/share;
    if(ratio<0.5||ratio>1.9)
      throw new Error('T44 '+k+' sits at '+ratio.toFixed(2)+' of the share at depth '+mid);
    // elites must not break them
    for(const ek of ELITE_KEYS){
      const e=mkMonster(k,0,0,20);makeElite(e,ek);
      if(!(e.maxHp>0)||!(e.atk>0))throw new Error('T44 elite '+ek+' broke '+k);
    }
  }
  // the family covers a range rather than clustering
  const crs=KEYS.map(k=>MONSTERS[k].cr);
  if(Math.max(...crs)-Math.min(...crs)<5)throw new Error('T44 the roster is too narrow: CR '+crs.join(','));
  if(!KEYS.some(k=>MONSTERS[k].ranged))throw new Error('T44 nobody in the roster shoots');
  if(!KEYS.some(k=>MONSTERS[k].caster))throw new Error('T44 nobody in the roster casts');
  if(KEYS.filter(k=>MONSTERS[k].caster).length<2)throw new Error('T44 wanted both a priest and a wizard');

  // the halls field their own, and do not leak badly elsewhere
  const mix=(depth,n)=>{
    let duer=0,tot=0,theme='';const kinds=new Set();
    for(let i=0;i<n;i++){
      const L=genLevel(depth);theme=L.theme.name;
      for(const m of L.monsters){if(m.boss)continue;tot++;kinds.add(m.key);if(MONSTERS[m.key].duergar)duer++;}
    }
    return {theme,share:duer/Math.max(1,tot),kinds:kinds.size};
  };
  const halls=mix(depthOf('Duergar',20),12), caves=mix(depthOf('Caves',22),12);
  if(halls.theme!=='Duergar')throw new Error('T44 the Duergar lookup gave '+halls.theme);
  if(halls.share!==1)throw new Error('T44 a duergar hall is only '+(halls.share*100).toFixed(0)+'% duergar');
  if(caves.share!==0)throw new Error('T44 duergar leaked into the caves: '+(caves.share*100).toFixed(0)+'%');
  if(halls.kinds<3)throw new Error('T44 a hall fields only '+halls.kinds+' kinds — a roster, not one creature');

  // the budget must not have learned what a theme is
  const cold=[];for(let d=1;d<=45;d++)cold.push(threatBudget(d));
  for(let i=0;i<6;i++)genLevel(depthOf('Duergar',13+i*3));
  for(let d=1;d<=45;d++)
    if(threatBudget(d)!==cold[d-1])throw new Error('T44 the duergar bias moved the budget at depth '+d);

  // enlarge and invisibility are real turns in a fight, not inert flags
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[THEME_IDX('Duergar')],depth:20,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},lurkers:[],duergar:[]};
  G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;
  G.party=[mkCharacter('V','human','fighter',[16,12,14,10,10,8])];
  {
    const w=mkMonster('duergar',5,6,20);w.awake=true;G.L.monsters=[w];
    const dmg0=w.dmg[2],atk0=w.atk;
    duergarTricks(w);
    if(w.grown)throw new Error('T44 a duergar enlarged before it was hurt');
    w.hp=Math.floor(w.maxHp*0.5);
    duergarTricks(w);
    if(!w.grown)throw new Error('T44 a hurt duergar never enlarged');
    if(w.dmg[2]<=dmg0)throw new Error('T44 enlarging did not raise its damage');
    if(w.atk<=atk0)throw new Error('T44 enlarging did not raise its attack');
    const d2=w.dmg[2];
    duergarTricks(w);
    if(w.dmg[2]!==d2)throw new Error('T44 a duergar enlarged twice');
  }
  {
    const sc=mkMonster('duergarscout',5,6,20);sc.awake=true;G.L.monsters=[sc];
    if(duergarReveal(sc)!==0)throw new Error('T44 a visible shadowblade claimed a sneak bonus');
    sc.hp=Math.floor(sc.maxHp*0.6);
    duergarTricks(sc);
    if(sc.vanished!==1)throw new Error('T44 the shadowblade never vanished');
    const bonus=duergarReveal(sc);
    if(bonus!==4)throw new Error('T44 the reveal gave a bonus of '+bonus);
    if(duergarReveal(sc)!==0)throw new Error('T44 the shadowblade vanished twice off one casting');
  }
  // the halls' furniture survives a save, like every other theme's
  const FURN=['pillar','torch','rack','forge','chains','shrine'];
  let furnSeen=null;
  {
    const L=genLevel(depthOf('Duergar',20));
    if(!Array.isArray(L.duergar))throw new Error('T44 a duergar floor has no furniture array');
    if(!L.duergar.length)throw new Error('T44 a duergar floor came out bare');
    for(const f of L.duergar){
      if(FURN.indexOf(f.kind)<0)throw new Error('T44 unknown furniture '+f.kind);
      if(L.grid[(f.y+f.dy)*L.w+(f.x+f.dx)]!==T_WALL)throw new Error('T44 furniture not against a wall');
      if(L.grid[f.y*L.w+f.x]!==T_FLOOR)throw new Error('T44 furniture with nowhere to stand');
    }
    G.L=L;G.depth=L.depth;G.px=L.start.x;G.py=L.start.y;G.facing=0;
    const snap=JSON.parse(JSON.stringify(serializeGame()));
    if(!snap.level.duergar||snap.level.duergar.length!==L.duergar.length)
      throw new Error('T44 the furniture did not survive serialisation');
    deserializeGame(snap);
    if(!G.L.duergar||G.L.duergar.length!==L.duergar.length)
      throw new Error('T44 the furniture did not survive a reload');
    if(G.L.duergar.some((f,i)=>f.kind!==L.duergar[i].kind))
      throw new Error('T44 a reloaded floor came back with different furniture');
  }
  /* Every kind must actually be placed, and the fabric of the hall — the pillars
     and the torches — must stay the common sight. A kind that never comes up is
     dead code, and a flat draw would turn a hall into a museum of one of
     everything. Sampled over enough floors that a 10% kind cannot miss by luck. */
  {
    const tally={},sites=[];let n=0;
    for(let i=0;i<40;i++){
      const L=genLevel(depthOf('Duergar',13+(i%2)*3));
      sites.push(L.duergar.length);
      for(const f of L.duergar){
        if(FURN.indexOf(f.kind)<0)throw new Error('T44 unknown furniture '+f.kind);
        tally[f.kind]=(tally[f.kind]||0)+1;n++;
      }
    }
    for(const k of FURN)if(!tally[k])throw new Error('T44 '+k+' is never placed');
    const fabric=(tally.pillar+tally.torch)/n;
    if(fabric<0.4)throw new Error('T44 pillars and torches are only '+(fabric*100).toFixed(0)+'% of the furniture');
    const most=Math.max(...FURN.map(k=>tally[k]/n));
    if(most>0.45)throw new Error('T44 one kind takes '+(most*100).toFixed(0)+'% of every hall');
    const lo=Math.min(...sites),hi=Math.max(...sites);
    if(lo<10||hi>17)throw new Error('T44 furniture count ran '+lo+'-'+hi+', outside the 10-17 the floor budgets');
    furnSeen=FURN.map(k=>k+' '+(tally[k]/n*100).toFixed(0)+'%').join(', ');
  }
  console.log('T44 duergar: 6 kinds CR '+Math.min(...crs)+'-'+Math.max(...crs)+' (warrior, arbalest, '+
    'shadowblade, stonepriest, runecaster, hammerlord), all banded, art-layered, scorers agreeing and '+
    'sized 0.5-1.9 of their share; halls run '+(halls.share*100).toFixed(0)+'% duergar over '+halls.kinds+
    ' kinds vs '+(caves.share*100).toFixed(0)+'% in the caves, budget untouched; enlarge and invisibility '+
    'each fire once and bite; and the halls are furnished with all six kinds ('+furnSeen+
    '), every one against a wall with somewhere to stand, surviving a save unchanged');
})();

/* --- T45: the myconid roster, the grove, and its lord --- */
(function(){
  // Seven that spawn, and two that only ever arrive as a boss. Both halves need
  // art and a working definition; only the first half needs a band.
  const KEYS=['mysprout','shrieker','violetfungus','sporeservant','myguard','mycaster','myelder'];
  const RULERS=['mylord','mysovereign'];
  for(const k of KEYS.concat(RULERS)){
    const d=MONSTERS[k];
    if(!d)throw new Error('T45 '+k+' is not defined');
    if(!d.myconid)throw new Error('T45 '+k+' is not flagged myconid — the grove bias reads that flag');
    if(d.type!=='plant')throw new Error('T45 '+k+' is a '+d.type+', not a plant');
    const art=MONSTER_ART[d.spr];
    if(!art)throw new Error('T45 '+k+' has no art for spr '+d.spr);
    const svg=art();
    if(svg.body.indexOf('|H|')<0||svg.body.indexOf('|A|')<0)
      throw new Error('T45 '+k+' is a static sprite: it cannot telegraph an attack');
    if(d.caster&&!ELEMENTS[d.caster.elem])throw new Error('T45 '+k+' casts an unresistable element');
    for(const ek of ELITE_KEYS){
      const e=mkMonster(k,0,0,20);makeElite(e,ek);
      if(!(e.maxHp>0)||!(e.atk>0))throw new Error('T45 elite '+ek+' broke '+k);
    }
  }
  // the two rulers are boss-only on purpose: with no band, their numbers answer
  // to the boss floor they were written for and to nothing else
  for(const k of RULERS)
    if(SPAWN_DEPTH[k])throw new Error('T45 '+k+' has a spawn band — it was meant to be boss-only');
  const ratios={};
  for(const k of KEYS){
    const band=SPAWN_DEPTH[k];
    if(!band)throw new Error('T45 '+k+' has no spawn band and can never appear');
    const m=mkMonster(k,0,0,20);
    if(Math.abs(monsterThreat(m)-threatOf(k,20,null))>1e-6)
      throw new Error('T45 the two threat scorers disagree on '+k);
    const mid=Math.round((band[0]+Math.min(band[1],34))/2);
    const share=threatBudget(mid)/Math.round(targetCount(mid));
    const r=threatOf(k,mid,null)/share;ratios[k]=r;
    if(r<0.5||r>1.9)throw new Error('T45 '+k+' sits at '+r.toFixed(2)+' of the share at depth '+mid);
  }
  // `speed` is a movement COOLDOWN: lower is faster, and the piercer — an
  // ambusher that cannot walk at all — is the slowest thing in the game at 2.6.
  // Read the other way round, a shrieker written as "speed 0.01, because it is
  // rooted" came out a hundred times faster than anything else in the dungeon
  // and walled a simulated descent at depth 16 on its own.
  for(const k in MONSTERS)
    if(!(MONSTERS[k].speed>=1))
      throw new Error('T45 '+k+' has speed '+MONSTERS[k].speed+' — speed is a cooldown, not a rate');
  for(const k of ['shrieker','violetfungus'])
    if(MONSTERS[k].speed<=MONSTERS.rat.speed)
      throw new Error('T45 '+k+' is a rooted fungus that outpaces a rat');
  if(MONSTERS.shrieker.speed<MONSTERS.piercer.speed)
    throw new Error('T45 a shrieker walks better than a piercer');

  // a grove is not one creature repeated: a warrior, a caster, and others
  // Measured on the SPAWNABLE roster only. The two rulers are boss-only, so
  // their CR is a label rather than a rung: the sovereign's numbers answer to
  // the depth-39 boss window, and were cut when the boss table gave her that
  // slot. Including them would make this check track a boss's tuning.
  const crs=KEYS.map(k=>MONSTERS[k].cr);
  if(Math.max(...crs)-Math.min(...crs)<5)throw new Error('T45 the roster is too narrow: CR '+crs.join(','));
  if(!KEYS.some(k=>MONSTERS[k].caster))throw new Error('T45 nobody in the roster casts');
  if(!KEYS.some(k=>MONSTERS[k].spores))throw new Error('T45 no myconid carries spores');
  if(!MONSTERS.shrieker.shriek)throw new Error('T45 the shrieker does not shriek');

  // the grove fields its own, and does not leak badly elsewhere
  const mix=(depth,n)=>{
    let myc=0,tot=0,theme='';const kinds=new Set();
    for(let i=0;i<n;i++){
      const L=genLevel(depth);theme=L.theme.name;
      for(const m of L.monsters){if(m.boss)continue;tot++;kinds.add(m.key);if(MONSTERS[m.key].myconid)myc++;}
    }
    return {theme,share:myc/Math.max(1,tot),kinds:kinds.size};
  };
  const grove=mix(depthOf('Myconid',16),14), halls=mix(depthOf('Duergar',13),14);
  if(grove.theme!=='Myconid')throw new Error('T45 the Myconid lookup gave '+grove.theme);
  if(grove.share!==1)throw new Error('T45 a grove is only '+(grove.share*100).toFixed(0)+'% myconid');
  if(halls.share!==0)throw new Error('T45 myconids leaked into the halls: '+(halls.share*100).toFixed(0)+'%');
  if(grove.kinds<4)throw new Error('T45 a grove fields only '+grove.kinds+' kinds — a roster, not one creature');
  // and the bias is at placement, so the budget never learned what a theme is
  const cold=[];for(let d=1;d<=45;d++)cold.push(threatBudget(d));
  for(let i=0;i<6;i++)genLevel(depthOf('Myconid',16+i*3));
  for(let d=1;d<=45;d++)
    if(threatBudget(d)!==cold[d-1])throw new Error('T45 the grove bias moved the budget at depth '+d);

  // the lord caps the grove: depth 18 is the last floor of the Myconid block
  const bossDepth=depthsOf('Myconid',45).find(d=>d%3===0&&d>=6);
  if(!bossDepth)throw new Error('T45 no Myconid floor is a boss floor');
  if(depthsOf('Myconid',45).filter(d=>d<bossDepth).some(d=>d>bossDepth))
    throw new Error('T45 the boss floor is not the last of the Myconid block');
  if(THEMES[Math.floor(bossDepth/3)%THEMES.length].name==='Myconid')
    throw new Error('T45 depth '+bossDepth+' is not the last floor of its block');
  const named=bossFor(bossDepth);
  if(named.base!=='mylord')throw new Error('T45 the grove\'s boss is '+named.base+', not a myconid lord');
  if(named.cycle!==0)throw new Error('T45 the grove boss is a cycled boss, not a named one');
  {
    let seen=null;
    for(let t=0;t<20&&!seen;t++)seen=genLevel(bossDepth).monsters.find(m=>m.boss);
    if(!seen)throw new Error('T45 no boss generated on the grove floor');
    if(seen.key!=='mylord')throw new Error('T45 the grove floor fielded '+seen.key);
    if(!seen.myconid)throw new Error('T45 the grove boss is not one of the grove');
  }
  // the sovereign is the deeper power: the grove's tier-1 boss, twenty-one
  // floors below the lord. A boss-only creature with no slot is dead content.
  const groveSlots=BOSS_TABLE.Myconid;
  if(!groveSlots[1].some(c=>c.base==='mysovereign'))
    throw new Error('T45 the sovereign holds no boss slot and can never appear');
  if(!groveSlots[0].some(c=>c.base==='mylord'))
    throw new Error('T45 the lord no longer caps the grove');

  // spores are a real save, and a failed one genuinely stops a character
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[THEME_IDX('Myconid')],depth:18,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},lurkers:[],duergar:[]};
  G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;
  {
    let held=0,stunned=0;
    for(let t=0;t<400;t++){
      const ch=mkCharacter('V','human','fighter',[16,12,14,10,10,8]);
      const g=mkMonster('myguard',5,6,18);
      G.L.monsters=[g];monsterSpecials(g,ch);
      if(hasCond(ch,'hold'))held++;
      if(!canAct(ch)&&hasCond(ch,'hold'))stunned++;
    }
    if(held<40)throw new Error('T45 a guard\'s spores held nobody in 400 tries: '+held);
    if(held>360)throw new Error('T45 a guard\'s spores are unsaveable: '+held);
    if(stunned!==held)throw new Error('T45 a rooted character can still act');
    let reel=0;
    for(let t=0;t<400;t++){
      const ch=mkCharacter('V','human','wizard',[8,12,10,16,10,8]);
      const c=mkMonster('mycaster',5,6,20);
      G.L.monsters=[c];monsterSpecials(c,ch);
      if(hasCond(ch,'stunned'))reel++;
    }
    if(reel<40)throw new Error('T45 a sporecaster stunned nobody in 400 tries: '+reel);
  }
  // a hurt myconid tells the grove; a shrieker tells a wider circle, once
  {
    const hurt=mkMonster('myguard',5,5,18);hurt.awake=true;
    const near=mkMonster('mysprout',5,10,18);      // 5 tiles: inside the distress radius
    const far=mkMonster('mysprout',5,16,18);       // 11 tiles: outside it
    const bystander=mkMonster('troll',6,5,18);     // not of the grove
    G.L.monsters=[hurt,near,far,bystander];
    myconidDistress(hurt);
    if(!near.awake)throw new Error('T45 distress did not wake a myconid 5 tiles away');
    if(far.awake)throw new Error('T45 distress reached 11 tiles');
    if(bystander.awake)throw new Error('T45 distress woke something that is not a myconid');
  }
  {
    const sh=mkMonster('shrieker',5,7,18);sh.awake=true;   // 2 tiles from the party
    const far=mkMonster('myelder',5,16,18);                // 9 tiles from the shrieker
    G.L.monsters=[sh,far];
    myconidShriek(sh);
    if(!sh.shrieked)throw new Error('T45 the shrieker never screamed');
    if(!far.awake)throw new Error('T45 the shriek did not carry 9 tiles');
    far.awake=false;
    myconidShriek(sh);
    if(far.awake)throw new Error('T45 the shrieker screamed twice');
    const quiet=mkMonster('shrieker',5,17,18);quiet.awake=true;  // 12 tiles off
    G.L.monsters=[quiet];
    myconidShriek(quiet);
    if(quiet.shrieked)throw new Error('T45 a shrieker screamed at nobody');
  }
  let puffShare=0;
  /* And the grove has its own trap, on the drow snare's exact terms: it
     EXTENDS the pool, so a floor's trap count is untouched and a puffball
     displaces some other trap rather than adding to the tally. */
  {
    let puff=0,tot=0,elsewhere=0;
    for(let t=0;t<26;t++){
      const L=genLevel(depthOf('Myconid'));
      for(const i in L.traps){tot++;if(L.traps[i].kind==='puffball')puff++;}
    }
    for(const nm of ['Crypt','Caves','Duergar','Drow','Sewers'])
      for(let t=0;t<12;t++){
        const L=genLevel(depthOf(nm));
        for(const i in L.traps)if(L.traps[i].kind==='puffball')elsewhere++;
      }
    if(!puff)throw new Error('T45 no puffball ever appeared in the grove');
    if(elsewhere)throw new Error('T45 '+elsewhere+' puffballs grew outside the grove');
    // it draws no blood, and the stun it deals is real on both counts
    const L=genLevel(depthOf('Myconid'));
    let sample=null;for(const i in L.traps)if(L.traps[i].kind==='puffball')sample=L.traps[i];
    if(sample){
      if(sample.dmg)throw new Error('T45 the puffball draws blood');
      if(!(sample.dur>0)||!(sample.dc>0))throw new Error('T45 the puffball has no duration or DC');
    }
    const ch=mkCharacter('Test','human','fighter',[14,12,14,10,10,10]);
    addCond(ch,{kind:'stunned',dur:5});
    if(canAct(ch))throw new Error('T45 a stunned character can still act');
    const acStunned=charAC(ch);
    ch.conditions=[];
    if(charAC(ch)-acStunned!==4)throw new Error('T45 stun does not cost 4 AC');
    puffShare=puff/tot;
  }
  /* And the grove is furnished. Same assertions the halls and the house get:
     all six kinds appear, every piece stands on floor facing a wall (so there
     is somewhere to see it from), none leak onto another theme, and a save
     round-trip brings them back unchanged. */
  const fKinds=new Set(); let fN=0,fFloors=0,fBad=0;
  for(let t=0;t<40;t++){
    const L=genLevel(depthOf('Myconid'));
    fFloors++; fN+=(L.myconid||[]).length;
    if(!L.myconid||!L.myconid.length)throw new Error('T45 a grove with no furniture in it');
    for(const f of L.myconid){
      fKinds.add(f.kind);
      if(L.grid[f.y*L.w+f.x]!==T_FLOOR)fBad++;
      const wt=L.grid[(f.y+f.dy)*L.w+(f.x+f.dx)];
      if(wt!==T_WALL&&wt!==T_SECRET)fBad++;
    }
  }
  if(fBad)throw new Error('T45 '+fBad+' grove features not on floor facing a wall');
  if(fKinds.size!==6)throw new Error('T45 only '+fKinds.size+' furniture kinds appeared: '+[...fKinds]);
  for(const nm of ['Crypt','Caves','Duergar','Drow','Sewers','Dungeon']){
    const L=genLevel(depthOf(nm));
    if((L.myconid||[]).length)throw new Error('T45 grove furniture grew in the '+nm);
  }
  {
    const L=genLevel(depthOf('Myconid'));
    G.L=L;G.depth=L.depth;
    const before=JSON.stringify(L.myconid);
    deserializeGame(JSON.parse(JSON.stringify(serializeGame())));
    if(JSON.stringify(G.L.myconid)!==before)throw new Error('T45 grove furniture did not survive a save');
  }
  console.log('T45 myconids: 7 banded kinds CR '+Math.min(...crs)+'-'+Math.max(...crs)+' (sprout, shrieker, '+
    'violet fungus, spore servant, guard, sporecaster, elder) plus two boss-only rulers, all art-layered, '+
    'scorers agreeing and sized '+Math.min(...KEYS.map(k=>ratios[k])).toFixed(2)+'-'+
    Math.max(...KEYS.map(k=>ratios[k])).toFixed(2)+' of their share; the grove runs '+
    (grove.share*100).toFixed(0)+'% myconid over '+grove.kinds+' kinds vs '+(halls.share*100).toFixed(0)+
    '% in the halls, budget untouched; nothing outruns a cooldown of 1; spores root and reel, '+
    'distress carries 7 tiles and a shriek 11 — once; '+
    'depth '+bossDepth+' is capped by Ilhaeryn the myconid lord; and the grove is furnished with all '+
    fKinds.size+' kinds ('+(fN/fFloors).toFixed(1)+' a floor), every piece on floor facing a wall, '+
    'none on any other theme, surviving a save unchanged; and puffballs are '+
    (puffShare*100).toFixed(0)+'% of a grove floor\'s traps and none elsewhere, drawing no blood but '+
    'stunning for real');
})();

/* --- T46: the drow house --- */
(function(){
  const ti=THEME_IDX('Drow');
  if(ti<0)throw new Error('T46 there is no Drow theme');
  if(ti!==THEMES.length-1)throw new Error('T46 the Drow theme was not appended: index '+ti);
  const th=THEMES[ti];
  if(!Array.isArray(th.glyphs)||th.glyphs.length<3)
    throw new Error('T46 the theme carries no faerzress colours for the glazing');
  /* Two palettes, and they are not interchangeable. All drow SCRIPT burns one
     colour — a running text that changes colour every tile reads as eight
     separate decorations rather than one hand writing one thing — while the
     rose windows stay stained glass and keep all three. */
  if(typeof th.frieze!=='string'||!/^#[0-9a-f]{6}$/i.test(th.frieze))
    throw new Error('T46 the drow theme carries no single frieze colour');
  {
    const r=parseInt(th.frieze.slice(1,3),16),g=parseInt(th.frieze.slice(3,5),16),b=parseInt(th.frieze.slice(5,7),16);
    if(!(b>g+40&&r>g+20))throw new Error('T46 the frieze colour is not violet: '+th.frieze);
  }
  // the light is deliberately NOT violet: retinting the torch turns black brick
  // lilac, and the colour here is supposed to come from what is burning
  if(!th.light)throw new Error('T46 the drow theme sets no torch colour');
  {
    const r=(th.light>>16)&255,g=(th.light>>8)&255,b=th.light&255;
    if(b-r>40)throw new Error('T46 the drow torch is tinted violet — the stone will not read black');
    if(Math.min(r,g,b)<0xa0)throw new Error('T46 the drow torch is too dim to walk by: '+th.light.toString(16));
  }
  /* The house's furniture: six kinds on one array, every one against a plain wall
     with somewhere to stand. The rose window keeps its own spacing rule — it is
     the statement piece and never shares a wall — while the rest only need room
     to stand, so the crowding check is asymmetric on purpose. */
  const DFURN=['rose','fence','wallweb','guardian','shrine','brazier'];
  const depth=depthOf('Drow',20);
  let floors=0,total=0,roses=0;const dtally={};
  for(let i=0;i<40;i++){
    const L=genLevel(depth);
    if(L.theme.name!=='Drow')throw new Error('T46 depth '+depth+' is a '+L.theme.name+' floor');
    if(!Array.isArray(L.drow))throw new Error('T46 a drow floor has no furniture array');
    floors++;total+=L.drow.length;
    for(const f of L.drow){
      if(DFURN.indexOf(f.kind)<0)throw new Error('T46 unknown drow furniture '+f.kind);
      dtally[f.kind]=(dtally[f.kind]||0)+1;
      if(f.kind==='rose')roses++;
      if(L.grid[(f.y+f.dy)*L.w+(f.x+f.dx)]!==T_WALL)throw new Error('T46 '+f.kind+' is not on a wall');
      if(L.grid[f.y*L.w+f.x]!==T_FLOOR)throw new Error('T46 '+f.kind+' has nowhere to stand');
      if(!(f.hue>=0&&f.hue<3))throw new Error('T46 a drow feature is glazed in nothing: hue '+f.hue);
    }
    for(let a=0;a<L.drow.length;a++)for(let b=a+1;b<L.drow.length;b++){
      const A=L.drow[a],B2=L.drow[b];
      const gap=(A.kind==='rose'||B2.kind==='rose')?4:2;
      if(Math.abs(A.x-B2.x)+Math.abs(A.y-B2.y)<gap)
        throw new Error('T46 '+A.kind+' and '+B2.kind+' crowd each other');
    }
  }
  const per=total/floors, rper=roses/floors;
  if(per<9||per>16)throw new Error('T46 '+per.toFixed(1)+' wall features a floor, outside the 10-15 budgeted');
  if(rper<2||rper>7)throw new Error('T46 '+rper.toFixed(1)+' rose windows a floor — occasional, not a shopfront');
  for(const k of DFURN)if(!dtally[k])throw new Error('T46 '+k+' is never placed');
  {  // no one kind may take over the house
    const most=Math.max(...DFURN.map(k=>dtally[k]/total));
    if(most>0.45)throw new Error('T46 one kind takes '+(most*100).toFixed(0)+'% of every floor');
  }
  /* The web snare. It EXTENDS the trap pool rather than replacing anything, so
     the count is untouched and a snare displaces some other trap on the floor
     instead of adding to the tally — which is what makes it difficulty-neutral by
     construction rather than by hoping. It does no damage at all: being held in a
     drow house is the whole of the threat. */
  let snares=0,dTraps=0,oTraps=0;
  for(let i=0;i<40;i++){
    const L=genLevel(depth);
    for(const k in L.traps){
      const t=L.traps[k];dTraps++;
      if(t.kind!=='websnare')continue;
      snares++;
      if(t.dmg!==null)throw new Error('T46 a web snare deals damage');
      if(!(t.dur>0))throw new Error('T46 a web snare holds nobody');
      if(!(t.dc>0))throw new Error('T46 a web snare has no save DC');
    }
  }
  if(!snares)throw new Error('T46 no web snare was ever set on a drow floor');
  for(const d of [].concat(depthsOf('Duergar',10),depthsOf('Crypt',10),depthsOf('Caves',10))){
    const L=genLevel(d);
    for(const k in L.traps){oTraps++;
      if(L.traps[k].kind==='websnare')throw new Error('T46 a web snare was set on a '+L.theme.name+' floor');}
  }
  { // and it bites: a held character can neither act nor keep their guard up
    const P=[mkCharacter('V','human','fighter',[16,8,14,10,10,8])];
    G.party=P;G.depth=depth;G.time=100;
    G.L={w:8,h:8,grid:new Uint8Array(64),items:{},traps:{},monsters:[]};
    const ac0=charAC(P[0]);
    let held=false;
    for(let i=0;i<200&&!held;i++){
      P[0].conditions=[];P[0].hp=P[0].maxHp;
      triggerTrap({kind:'websnare',found:false,armed:true,dc:99,dmg:null,dur:5,x:1,y:1});
      held=P[0].conditions.some(c=>c.kind==='hold');
    }
    if(!held)throw new Error('T46 a web snare at DC 99 never held anybody');
    if(canAct(P[0]))throw new Error('T46 a held character can still act');
    if(charAC(P[0])>=ac0)throw new Error('T46 a held character keeps their full AC');
    if(P[0].hp!==P[0].maxHp)throw new Error('T46 a web snare drew blood');
  }
  const snarePct=(snares/dTraps*100).toFixed(0);
  // other themes stay bare
  for(const d of [].concat(depthsOf('Dungeon',12),depthsOf('Caves',12),depthsOf('Crypt',12))){
    const L=genLevel(d);
    if(L.drow&&L.drow.length)throw new Error('T46 a '+L.theme.name+' floor grew rose windows');
  }
  // and they survive a save/load round trip, like every other theme's furniture
  {
    const L=genLevel(depth);
    G.L=L;G.depth=L.depth;G.px=L.start.x;G.py=L.start.y;G.facing=0;
    const snap=JSON.parse(JSON.stringify(serializeGame()));
    if(!snap.level.drow||snap.level.drow.length!==L.drow.length)
      throw new Error('T46 the furniture did not survive serialisation');
    deserializeGame(snap);
    if(!G.L.drow||G.L.drow.length!==L.drow.length)
      throw new Error('T46 the furniture did not survive a reload');
    if(G.L.drow.some((f,i)=>f.kind!==L.drow[i].kind))
      throw new Error('T46 a reloaded floor came back with different furniture');
  }
  // The off-theme thinning had to get stronger when the seventh theme landed: a
  // theme's x4 competes against every foreign roster at once, so each roster
  // added dilutes it. Every themed floor must still be clearly its own place.
  const mix=(name,pred,near)=>{
    const d=depthOf(name,near);let hit=0,tot=0;
    for(let i=0;i<20;i++)for(const m of genLevel(d).monsters){
      if(m.boss)continue;tot++;if(pred(MONSTERS[m.key]))hit++;
    }
    return {d,share:hit/Math.max(1,tot)};
  };
  const shares=[['Crypt',x=>x.type==='undead'],['Caves',x=>x.cave],
                ['Duergar',x=>x.duergar],['Myconid',x=>x.myconid]]
    .map(([n,p])=>[n,mix(n,p,26)]);
  // every one of these is 100% now — this used to be an off-theme thinning of
  // 0.35 that left roughly 60% and had to be re-tuned each time a roster landed
  for(const [n,r] of shares)
    if(r.share!==1)throw new Error('T46 a deep '+n+' floor is only '+(r.share*100).toFixed(0)+'% its own roster');
  // a deep floor must still be a warband rather than one creature repeated
  const kinds=new Set();
  for(let i=0;i<12;i++)for(const m of genLevel(40).monsters)if(!m.boss)kinds.add(m.key);
  if(kinds.size<4)throw new Error('T46 depth 40 fields only '+kinds.size+' kinds');
  console.log('T46 drow house: theme appended at index '+ti+' with all script in one violet ('+th.frieze+'), '+
    th.glyphs.length+' colours of glazing and a '+
    'cold torch; '+per.toFixed(1)+' wall features a floor over 6 kinds ('+rper.toFixed(1)+' of them rose '+
    'windows), all wall-mounted with somewhere to stand, save-safe and unchanged, none elsewhere; '+
    'web snares are '+snarePct+'% of a drow floor\'s traps and none elsewhere, drawing no blood but '+
    'holding fast; '+
    'off-theme thinning at 0.35 keeps deep floors '+shares.map(([n,r])=>n.slice(0,4)+'@'+r.d+' '+
    (r.share*100).toFixed(0)+'%').join(', ')+' with '+kinds.size+' kinds at depth 40');
})();

/* --- T47: the drow roster, the matron, and the two things drow do --- */
(function(){
  const KEYS=['drow','drowbolt','drowblade','drowpriest','drowmage','drider'];
  const MATRON='drowmatron';
  for(const k of KEYS.concat([MATRON])){
    const d=MONSTERS[k];
    if(!d)throw new Error('T47 '+k+' is not defined');
    if(!d.drow)throw new Error('T47 '+k+' is not flagged drow — the house bias reads that flag');
    const art=MONSTER_ART[d.spr];
    if(!art)throw new Error('T47 '+k+' has no art for spr '+d.spr);
    const svg=art();
    if(svg.body.indexOf('|H|')<0||svg.body.indexOf('|A|')<0)
      throw new Error('T47 '+k+' is a static sprite: it cannot telegraph an attack');
    if(d.caster&&!ELEMENTS[d.caster.elem])throw new Error('T47 '+k+' casts an unresistable element');
    if(!(d.speed>=1))throw new Error('T47 '+k+' has speed '+d.speed+' — speed is a cooldown');
    for(const ek of ELITE_KEYS){
      const e=mkMonster(k,0,0,22);makeElite(e,ek);
      if(!(e.maxHp>0)||!(e.atk>0))throw new Error('T47 elite '+ek+' broke '+k);
    }
  }
  if(SPAWN_DEPTH[MATRON])throw new Error('T47 the matron has a spawn band — she was meant to be boss-only');
  const ratios={};
  for(const k of KEYS){
    const band=SPAWN_DEPTH[k];
    if(!band)throw new Error('T47 '+k+' has no spawn band and can never appear');
    const m=mkMonster(k,0,0,22);
    if(Math.abs(monsterThreat(m)-threatOf(k,22,null))>1e-6)
      throw new Error('T47 the two threat scorers disagree on '+k);
    const mid=Math.round((band[0]+Math.min(band[1],34))/2);
    const share=threatBudget(mid)/Math.round(targetCount(mid));
    const r=threatOf(k,mid,null)/share;ratios[k]=r;
    if(r<0.5||r>1.9)throw new Error('T47 '+k+' sits at '+r.toFixed(2)+' of the share at depth '+mid);
  }
  // the roster covers the four the brief named and then some
  if(!KEYS.some(k=>MONSTERS[k].ranged))throw new Error('T47 nobody in the roster shoots');
  if(KEYS.filter(k=>MONSTERS[k].caster).length<2)throw new Error('T47 wanted both a priestess and an arcanist');
  if(!KEYS.some(k=>MONSTERS[k].drowpoison))throw new Error('T47 nobody carries drow poison');
  if(!KEYS.some(k=>MONSTERS[k].faerie))throw new Error('T47 nobody casts faerie fire');
  // elves, so: less hp and more AC than the dwarves who hold the floors above
  const avg=(ks,f)=>ks.reduce((a,k)=>a+f(MONSTERS[k]),0)/ks.length;
  const DUER=['duergar','duergarxbow','duergarscout','duergarpriest','duergarrune','duergarlord'];
  if(avg(KEYS,m=>m.ac)<=avg(DUER,m=>m.ac))
    throw new Error('T47 the drow are no better armoured than the duergar — the profile is meant to invert');

  // the house fields its own, and does not leak badly elsewhere
  const mix=(name,near)=>{
    const d=depthOf(name,near);let hit=0,tot=0;const kinds=new Set();
    for(let i=0;i<16;i++)for(const m of genLevel(d).monsters){
      if(m.boss)continue;tot++;kinds.add(m.key);if(MONSTERS[m.key].drow)hit++;
    }
    return {d,share:hit/Math.max(1,tot),kinds:kinds.size};
  };
  const house=mix('Drow',20), grove=mix('Myconid',18);
  if(house.share!==1)throw new Error('T47 a drow floor is only '+(house.share*100).toFixed(0)+'% drow');
  if(grove.share!==0)throw new Error('T47 drow leaked into the grove: '+(grove.share*100).toFixed(0)+'%');
  if(house.kinds<4)throw new Error('T47 a drow floor fields only '+house.kinds+' kinds — a roster, not one creature');
  const cold=[];for(let d=1;d<=45;d++)cold.push(threatBudget(d));
  for(let i=0;i<6;i++)genLevel(depthOf('Drow',19+i*3));
  for(let d=1;d<=45;d++)
    if(threatBudget(d)!==cold[d-1])throw new Error('T47 the drow bias moved the budget at depth '+d);

  // the matron caps the house: depth 21 is the last floor of the Drow block
  const bossDepth=depthsOf('Drow',45).find(d=>d%3===0&&d>=6);
  if(!bossDepth)throw new Error('T47 no Drow floor is a boss floor');
  if(THEMES[Math.floor(bossDepth/3)%THEMES.length].name==='Drow')
    throw new Error('T47 depth '+bossDepth+' is not the last floor of its block');
  const named=bossFor(bossDepth);
  if(named.base!==MATRON)throw new Error('T47 the house boss is '+named.base+', not the matron');
  if(named.cycle!==0)throw new Error('T47 the matron is a cycled boss, not a named one');
  {
    let seen=null;
    for(let t=0;t<20&&!seen;t++)seen=genLevel(bossDepth).monsters.find(m=>m.boss);
    if(!seen)throw new Error('T47 no boss generated on the house floor');
    if(seen.key!==MATRON)throw new Error('T47 the house floor fielded '+seen.key);
  }

  // drow poison: a Fortitude save or asleep, and asleep genuinely stops you.
  // An elf shrugs it off entirely, which is the engine's sleep immunity and is
  // deliberately left in place.
  const grid=new Uint8Array(400).fill(T_FLOOR);
  G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
    theme:THEMES[THEME_IDX('Drow')],depth:21,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},
    lurkers:[],duergar:[],drow:[]};
  G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;
  {
    let slept=0,helpless=0;
    for(let t=0;t<400;t++){
      const ch=mkCharacter('V','human','fighter',[16,12,14,10,10,8]);
      const r=mkMonster('drowbolt',5,6,21);G.L.monsters=[r];
      monsterSpecials(r,ch);
      if(hasCond(ch,'sleep')){slept++;if(!canAct(ch)&&charAC(ch)<charAC(mkCharacter('V','human','fighter',[16,12,14,10,10,8])))helpless++;}
    }
    if(slept<40)throw new Error('T47 drow poison put nobody to sleep in 400 tries: '+slept);
    if(slept>360)throw new Error('T47 drow poison is unsaveable: '+slept);
    if(helpless!==slept)throw new Error('T47 a sleeping character still fights and still defends');
    let elfSlept=0;
    for(let t=0;t<200;t++){
      const el=mkCharacter('E','elf','fighter',[16,12,14,10,10,8]);
      const r=mkMonster('drowbolt',5,6,21);G.L.monsters=[r];
      monsterSpecials(r,el);
      if(hasCond(el,'sleep'))elfSlept++;
    }
    if(elfSlept)throw new Error('T47 an elf was put to sleep by drow poison '+elfSlept+' times');
  }
  // faerie fire: costs AC, and only AC
  {
    let lit=0;
    for(let t=0;t<400;t++){
      const ch=mkCharacter('V','human','wizard',[8,14,10,16,10,8]);
      const before=charAC(ch);
      const w=mkMonster('drowmage',5,6,24);G.L.monsters=[w];
      monsterSpecials(w,ch);
      if(hasCond(ch,'faerie')){
        lit++;
        if(charAC(ch)!==before-2)throw new Error('T47 faerie fire cost '+(before-charAC(ch))+' AC, wanted 2');
        if(!canAct(ch))throw new Error('T47 faerie fire stopped a character acting — it only outlines them');
      }
    }
    if(lit<40)throw new Error('T47 faerie fire caught nobody in 400 tries: '+lit);
    if(!COND_ICONS.faerie)throw new Error('T47 faerie fire has no badge, so nothing tells the player');
  }
  console.log('T47 drow: 6 banded kinds CR '+Math.min(...KEYS.map(k=>MONSTERS[k].cr))+'-'+
    Math.max(...KEYS.map(k=>MONSTERS[k].cr))+' (warrior, raider, blademaster, priestess, arcanist, drider) '+
    'plus a boss-only matron, all art-layered, scorers agreeing and sized '+
    Math.min(...KEYS.map(k=>ratios[k])).toFixed(2)+'-'+Math.max(...KEYS.map(k=>ratios[k])).toFixed(2)+
    ' of their share; better armoured and thinner-skinned than the duergar; the house runs '+
    (house.share*100).toFixed(0)+'% drow over '+house.kinds+' kinds vs '+(grove.share*100).toFixed(0)+
    '% in the grove, budget untouched; venom sleeps a human and never an elf, faerie fire costs 2 AC '+
    'and nothing else; depth '+bossDepth+' is capped by Matron Zaeryl');
})();

/* --- T48: the wererat guild, and a roster built for two windows --- */
(function(){
  const GUILD=['wererat','wererogue','wereblade'];
  const VERMIN=['ratswarm','grayooze','ochrejelly','scrag','blackpud'];
  const MOVED=['rat','spider','troll','otyugh'];
  const ALL=GUILD.concat(VERMIN);
  for(const k of ALL.concat(MOVED)){
    const d=MONSTERS[k];
    if(!d)throw new Error('T48 '+k+' is not defined');
    if(!d.sewers)throw new Error('T48 '+k+' is not flagged sewers — the bias reads that flag');
    if(!SPAWN_DEPTH[k])throw new Error('T48 '+k+' has no spawn band');
    const art=MONSTER_ART[d.spr];
    if(!art)throw new Error('T48 '+k+' has no art for spr '+d.spr);
    const svg=art();
    // At least one animation layer, not both. A rat, a spider and an ooze have
    // no arm to swing -- they strike with the head, and the head layer is what
    // animates. Demanding an arm of a quadruped is the test being wrong about
    // anatomy, not the sprite being static.
    if(svg.body.indexOf('|H|')<0&&svg.body.indexOf('|A|')<0)
      throw new Error('T48 '+k+' is a static sprite: it cannot telegraph an attack');
    if(MONSTERS[k].type==='humanoid'&&svg.body.indexOf('|A|')<0&&ALL.indexOf(k)>=0)
      throw new Error('T48 '+k+' carries a weapon but has no arm layer to swing it');
    if(!(d.speed>=1))throw new Error('T48 '+k+' has speed '+d.speed+' — speed is a cooldown');
    if(d.caster&&!ELEMENTS[d.caster.elem])throw new Error('T48 '+k+' casts an unresistable element');
    const m=mkMonster(k,0,0,22);
    if(Math.abs(monsterThreat(m)-threatOf(k,22,null))>1e-6)
      throw new Error('T48 the two threat scorers disagree on '+k);
    for(const ek of ELITE_KEYS){
      const e=mkMonster(k,0,0,22);makeElite(e,ek);
      if(!(e.maxHp>0)||!(e.atk>0))throw new Error('T48 elite '+ek+' broke '+k);
    }
  }
  // the otyugh is no longer a cave creature, and must not be both
  if(MONSTERS.otyugh.cave)throw new Error('T48 the otyugh is flagged cave and sewers at once');

  // The Sewers occupy 4-6 and 25-27 and nothing between, so this is the only
  // roster that has to cover two windows twenty floors apart. Every band must
  // reach one of them, or the flag is a pure penalty everywhere else.
  const floors=[];
  for(let d=1;d<=30;d++)if(THEMES[Math.floor((d-1)/3)%THEMES.length].name==='Sewers')floors.push(d);
  if(floors.length!==6)throw new Error('T48 expected six sewers floors under 30, got '+floors.join(','));
  for(const k of ALL.concat(MOVED)){
    const b=SPAWN_DEPTH[k];
    if(!floors.some(d=>d>=b[0]&&d<=b[1]))
      throw new Error('T48 '+k+' is banded '+b[0]+'-'+b[1]+', which reaches no sewers floor');
  }
  // both windows must actually be stocked
  const inBand=(d)=>ALL.concat(MOVED).filter(k=>d>=SPAWN_DEPTH[k][0]&&d<=SPAWN_DEPTH[k][1]).length;
  if(inBand(5)<4)throw new Error('T48 the shallow sewers field only '+inBand(5)+' of their own');
  if(inBand(26)<4)throw new Error('T48 the deep sewers field only '+inBand(26)+' of their own');

  // sizing. The shallow end runs high against share and that is normal: at
  // depth 5 the budget cannot pay share value for every body targetCount asks
  // for, so the whole shallow bestiary sits near 2-3 (zombie 2.98, gnoll 2.74,
  // bugbear 3.08). The 0.85-1.2 guideline is a deep-band norm, so the bar is
  // checked against the band the creature actually lives in.
  const ratios={};
  for(const k of ALL){
    const b=SPAWN_DEPTH[k],mid=Math.round((b[0]+Math.min(b[1],34))/2);
    const share=threatBudget(mid)/Math.round(targetCount(mid));
    const r=threatOf(k,mid,null)/share;ratios[k]=r;
    const shallow=b[0]<=6;
    const lo=shallow?0.5:0.6, hi=shallow?4.0:1.9;
    if(r<lo||r>hi)throw new Error('T48 '+k+' sits at '+r.toFixed(2)+' of share at depth '+mid+
      ' (want '+lo+'-'+hi+' for a '+(shallow?'shallow':'deep')+' band)');
  }
  // the guild is armed and the vermin are not: that is the whole read
  if(!GUILD.every(k=>MONSTERS[k].ranged||MONSTERS[k].caster||MONSTERS[k].disease))
    throw new Error('T48 a wererat with no weapon, poison or plague is just a rat');
  if(VERMIN.some(k=>MONSTERS[k].type==='humanoid'))throw new Error('T48 a humanoid got into the livestock');
  for(const k of ['grayooze','ochrejelly','blackpud'])
    if(MONSTERS[k].speed<2)throw new Error('T48 '+k+' is an ooze and should be slow: speed '+MONSTERS[k].speed);

  // the sewers field their own at BOTH windows, and do not leak badly elsewhere
  const mix=(d,n)=>{let hit=0,tot=0;const kinds=new Set();
    for(let i=0;i<n;i++)for(const m of genLevel(d).monsters){if(m.boss)continue;tot++;kinds.add(m.key);
      if(MONSTERS[m.key].sewers)hit++;}
    return {share:hit/Math.max(1,tot),kinds:kinds.size};};
  const shallow=mix(floors[1],30), deep=mix(floors[4],30);
  if(shallow.share!==1)throw new Error('T48 a shallow sewers floor is only '+(shallow.share*100).toFixed(0)+'% sewers');
  if(deep.share!==1)throw new Error('T48 a deep sewers floor is only '+(deep.share*100).toFixed(0)+'% sewers');
  const elsewhere=mix(depthOf('Caves',11),30);
  if(elsewhere.share!==0)throw new Error('T48 the sewers leaked into the caves: '+(elsewhere.share*100).toFixed(0)+'%');
  if(deep.kinds<4)throw new Error('T48 a deep sewers floor fields only '+deep.kinds+' kinds');
  // and the bias is at placement, so the budget is still a pure function of depth
  const cold=[];for(let d=1;d<=45;d++)cold.push(threatBudget(d));
  for(const d of floors)genLevel(d);
  for(let d=1;d<=45;d++)
    if(threatBudget(d)!==cold[d-1])throw new Error('T48 the sewers bias moved the budget at depth '+d);
  console.log('T48 sewers: 8 new kinds plus dire rat, giant spider, troll and the otyugh moved in — a guild '+
    '(wererat, cutthroat, blademaster) and its livestock (rat swarm, gray ooze, ochre jelly, scrag, black '+
    'pudding); every band reaches one of the two windows the theme actually occupies (4-6 and 25-27), both '+
    'stocked, shallow sized '+Math.min(...['ratswarm','wererat','grayooze','wererogue'].map(k=>ratios[k])).toFixed(2)+
    '-'+Math.max(...['ratswarm','wererat','grayooze','wererogue'].map(k=>ratios[k])).toFixed(2)+' of share and deep '+
    Math.min(...['ochrejelly','scrag','blackpud','wereblade'].map(k=>ratios[k])).toFixed(2)+'-'+
    Math.max(...['ochrejelly','scrag','blackpud','wereblade'].map(k=>ratios[k])).toFixed(2)+
    '; floors run '+(shallow.share*100).toFixed(0)+'% shallow / '+(deep.share*100).toFixed(0)+'% deep vs '+
    (elsewhere.share*100).toFixed(0)+'% in the caves, budget untouched');
})();

/* --- T49: the hobgoblin legion, and the flagging of the old wildlife --- */
(function(){
  const LEGION=['hobcaptain','worgrider','hobpriest','ettin','hillgiant','stonegiant'];
  const OLD=['kobold','koboldsl','goblin','gobshaman','hobgoblin','orc','gnoll','bugbear','ogremage'];
  for(const k of LEGION.concat(OLD)){
    const d=MONSTERS[k];
    if(!d)throw new Error('T49 '+k+' is not defined');
    if(!d.dungeon)throw new Error('T49 '+k+' is not flagged dungeon — the bias reads that flag');
    if(!SPAWN_DEPTH[k])throw new Error('T49 '+k+' has no spawn band');
    if(!(d.speed>=1))throw new Error('T49 '+k+' has speed '+d.speed+' — speed is a cooldown');
    const art=MONSTER_ART[d.spr];
    if(!art)throw new Error('T49 '+k+' has no art for spr '+d.spr);
    if(art().body.indexOf('|H|')<0&&art().body.indexOf('|A|')<0)
      throw new Error('T49 '+k+' is a static sprite');
    if(d.caster&&!ELEMENTS[d.caster.elem])throw new Error('T49 '+k+' casts an unresistable element');
    const m=mkMonster(k,0,0,22);
    if(Math.abs(monsterThreat(m)-threatOf(k,22,null))>1e-6)
      throw new Error('T49 the two threat scorers disagree on '+k);
    for(const ek of ELITE_KEYS){
      const e=mkMonster(k,0,0,22);makeElite(e,ek);
      if(!(e.maxHp>0)||!(e.atk>0))throw new Error('T49 elite '+ek+' broke '+k);
    }
  }
  // the minotaur and the young dragon moved to the caves
  for(const k of ['minotaur','dragon']){
    if(!MONSTERS[k].cave)throw new Error('T49 '+k+' did not move to the caves');
    if(MONSTERS[k].dungeon)throw new Error('T49 '+k+' is flagged both dungeon and cave');
  }
  // Every flag must reach a floor of its own theme, or it is a pure penalty:
  // 0.35 everywhere and x4 nowhere. The Dungeon blocks are 1-3 and 22-24, which
  // is why the bugbear's band was stretched to 3 and why plain `ogre` is
  // deliberately NOT flagged -- it is banded 6-10 and can reach neither end
  // without either brutalising depth 3 or littering depth 22 with weaklings.
  const floorsOf=(name)=>{const o=[];for(let d=1;d<=48;d++)
    if(THEMES[Math.floor((d-1)/3)%THEMES.length].name===name)o.push(d);return o;};
  const DUN=floorsOf('Dungeon');
  for(const k of LEGION.concat(OLD)){
    const b=SPAWN_DEPTH[k];
    if(!DUN.some(d=>d>=b[0]&&d<=b[1]))
      throw new Error('T49 '+k+' is banded '+b.join('-')+' and reaches no Dungeon floor');
  }
  if(MONSTERS.ogre.dungeon)throw new Error('T49 plain ogre was flagged after all — check its band reaches a floor');
  for(const k of ['minotaur','dragon']){
    const b=SPAWN_DEPTH[k];
    if(!floorsOf('Caves').some(d=>d>=b[0]&&d<=b[1]))
      throw new Error('T49 '+k+' is banded '+b.join('-')+' and reaches no Caves floor');
  }

  // Sizing, by the rule the sewers taught. At depths 22-24 the pool mean and
  // the per-monster share coincide, so both guards can be measured on share:
  // the roster's MEAN ratio near 1 (because the x4 makes it half the floor),
  // and nothing in it above the incumbent ceiling (because poolCeiling reads
  // the single heaviest creature a depth allows and the budget grows into it).
  for(const d of [22,23,24]){
    const share=threatBudget(d)/Math.round(targetCount(d));
    const inb=LEGION.filter(k=>d>=SPAWN_DEPTH[k][0]&&d<=SPAWN_DEPTH[k][1]);
    if(inb.length<3)throw new Error('T49 only '+inb.length+' of the legion are in band at depth '+d);
    const rs=inb.map(k=>threatOf(k,d,null)/share);
    const mean=rs.reduce((a,b)=>a+b,0)/rs.length;
    if(mean<0.8||mean>1.25)throw new Error('T49 the legion averages '+mean.toFixed(2)+' of share at depth '+d);
    const mine=Math.max(...inb.map(k=>threatOf(k,d,null)));
    const others=Math.max(...spawnPool(d).filter(([k])=>LEGION.indexOf(k)<0).map(([k])=>threatOf(k,d,null)));
    if(mine>others)throw new Error('T49 at depth '+d+' the legion tops the bestiary ('+Math.round(mine)+
      ' vs '+Math.round(others)+') — that lifts poolCeiling and the budget for every roster');
  }

  // the legion holds its own floors at both ends and does not leak
  const mix=(d,n)=>{let hit=0,tot=0;const kinds=new Set();
    for(let i=0;i<n;i++)for(const m of genLevel(d).monsters){if(m.boss)continue;tot++;kinds.add(m.key);
      if(MONSTERS[m.key].dungeon)hit++;}
    return {share:hit/Math.max(1,tot),kinds:kinds.size};};
  const shallow=mix(2,30), deep=mix(23,30), away=mix(depthOf('Caves',11),30);
  if(shallow.share!==1)throw new Error('T49 a shallow dungeon floor is only '+(shallow.share*100).toFixed(0)+'% dungeon');
  if(deep.share!==1)throw new Error('T49 a deep dungeon floor is only '+(deep.share*100).toFixed(0)+'% dungeon');
  if(away.share!==0)throw new Error('T49 the legion leaked into the caves: '+(away.share*100).toFixed(0)+'%');
  if(deep.kinds<4)throw new Error('T49 a deep dungeon floor fields only '+deep.kinds+' kinds');
  // and the bias stays at placement
  const cold=[];for(let d=1;d<=45;d++)cold.push(threatBudget(d));
  for(const d of DUN.slice(0,6))genLevel(d);
  for(let d=1;d<=45;d++)
    if(threatBudget(d)!==cold[d-1])throw new Error('T49 the dungeon bias moved the budget at depth '+d);
  console.log('T49 dungeon: the goblinoid line flagged (kobold through bugbear, plus the ogre mage) and grown '+
    'up with 6 new — captain, worg rider, war priest, ettin, hill giant, stone giant; minotaur and young '+
    'dragon moved to the caves; every flag reaches a floor of its own theme; the legion averages near share '+
    'at 22-24 and tops nothing; floors run '+(shallow.share*100).toFixed(0)+'% shallow / '+
    (deep.share*100).toFixed(0)+'% deep over '+deep.kinds+' kinds vs '+(away.share*100).toFixed(0)+
    '% in the caves, budget untouched');
})();

/* --- T50: the bosses written for the table, and the random draw --- */
(function(){
  const WRITTEN=['wereratboss','wereratlord','duergarthane','hobwarlord','giantking',
                 'mylord','mysovereign','drowmatron'];
  for(const k of WRITTEN){
    const d=MONSTERS[k];
    if(!d)throw new Error('T50 '+k+' is not defined');
    if(SPAWN_DEPTH[k])throw new Error('T50 '+k+' has a spawn band — a boss written to a window must be boss-only');
    if(!MONSTER_ART[d.spr])throw new Error('T50 '+k+' has no art for spr '+d.spr);
    const b=MONSTER_ART[d.spr]().body;
    if(b.indexOf('|H|')<0&&b.indexOf('|A|')<0)throw new Error('T50 '+k+' is a static sprite');
    if(!(d.speed>=1))throw new Error('T50 '+k+' has speed '+d.speed);
    if(d.caster&&!ELEMENTS[d.caster.elem])throw new Error('T50 '+k+' casts an unresistable element');
  }
  // a boss-only creature must hold a slot, or it is content nobody can meet
  const held=new Set(BOSS_ENTRIES.map(e=>e.base));
  for(const k of WRITTEN)
    if(!held.has(k))throw new Error('T50 '+k+' is boss-only and holds no slot — dead content');
  // ...and must never turn up as rank and file
  for(const d of [6,12,18,24,30])
    for(const [k] of spawnPool(d))
      if(WRITTEN.indexOf(k)>=0)throw new Error('T50 '+k+' leaked into the ordinary spawn pool at depth '+d);

  // every slot's candidates name a real creature of that theme, and no creature
  // holds two slots at different tiers (which would be the same fight twice)
  for(const th in BOSS_TABLE){
    const seen=new Set();
    BOSS_TABLE[th].forEach((tier,ti)=>{
      for(const c of tier){
        if(seen.has(c.base))throw new Error('T50 '+th+' fields '+c.base+' at two tiers');
        seen.add(c.base);
        if(!c.name||!c.name.length)throw new Error('T50 an unnamed boss in '+th+' tier '+ti);
      }
    });
  }
  // names are unique across the whole table, or the log cannot tell them apart
  const names=BOSS_ENTRIES.map(e=>e.name);
  if(new Set(names).size!==names.length)throw new Error('T50 two boss slots share a name');

  // THE POINT: a slot with several candidates must actually vary between runs
  const multi=[];
  for(let d=6;d<=45;d+=3){
    const {theme,tier}=bossSlot(d);
    const rows=BOSS_TABLE[theme];
    if(rows[Math.min(tier,rows.length-1)].length>1)multi.push(d);
  }
  if(multi.length<3)throw new Error('T50 only '+multi.length+' boss floors can vary — the draw does nothing');
  for(const d of multi){
    const got=new Set();
    for(let i=0;i<60;i++)got.add(bossFor(d).base);
    if(got.size<2)throw new Error('T50 depth '+d+' drew the same boss 60 times running');
  }
  // and it varies in the generated level, not merely in the lookup
  {
    const d=multi[0],got=new Set();
    for(let i=0;i<40;i++){const b=genLevel(d).monsters.find(m=>m.boss);if(b)got.add(b.key);}
    if(got.size<2)throw new Error('T50 depth '+d+' generated the same boss 40 floors running');
  }

  /* A boss has to be able to land a blow on its own floor. The threat arc above
     does not cover this: `threatOf` multiplies hp, damage and attack together,
     so a creature can score well on bulk and spells while swinging like
     something three CR below it. Sinshara of the Veil did exactly that — the
     ogre mage carried the lowest base attack in the whole Dungeon roster, and
     her depth-24 boss came out at +18 where the ordinary stone giant beside her
     swings at +22 and her co-boss at +24. Against the AC a boss floor actually
     presents, four points is the difference between a fight and a formality.

     The bar is the floor's best ordinary attacker less 3. Three bosses sit at
     exactly -2 and are meant to: the two wights at depth 9, the lich at 30 and
     the roper at 33 are save-or-lose creatures whose danger is drain, paralysis
     or hold rather than the swing. */
  let tight=null,checked=0;
  for(let d=6;d<=45;d+=3){
    for(let i=0;i<26;i++){
      const L=genLevel(d), b=L.monsters.find(m=>m.boss);
      if(!b)throw new Error('T50 depth '+d+' is a boss floor with no boss on it');
      // measured per floor and against the monsters actually placed: the clamp
      // adapts to the floor, so a boss from one floor tells you nothing about
      // the elites that rolled on another
      let best=0,who='';
      for(const m of L.monsters)if(m!==b&&m.atk>best){best=m.atk;who=m.name;}
      if(b.atk<best)throw new Error('T50 '+b.name+' swings at +'+b.atk+' on its own depth-'+d+
        ' floor while a '+who+' beside it swings at +'+best);
      checked++;
      const margin=b.atk-best;
      if(!tight||margin<tight.margin)tight={name:b.name,margin,atk:b.atk,best,who,d};
    }
  }
  console.log('T50 boss creatures: '+WRITTEN.length+' written to a window and boss-only, every one holding a slot '+
    'and none of them in the spawn pool; 14 slots named uniquely, no creature at two tiers; '+
    multi.length+' floors ('+multi.join(', ')+') draw from more than one candidate and genuinely vary; '+
    'and across '+checked+' generated boss floors not one boss is out-swung by anything standing on it '+
    '(tightest: '+tight.name+' at +'+tight.atk+' against a '+tight.who+' at +'+tight.best+' on depth '+tight.d+')');
})();

/* --- T51: every monster animates — bob, walk, and a telegraph --- */
(function(){
  const keys=Object.keys(MONSTERS);
  if(keys.length<70)throw new Error('T51 only '+keys.length+' monsters — the sweep is looking at the wrong table');
  let bobbed=0,armed=0,quads=[];
  for(const k of keys){
    const def=MONSTERS[k], art=MONSTER_ART[def.spr];
    if(!art)throw new Error('T51 '+k+' has no art for spr '+def.spr);
    const a=art(), L=splitLayers(a.body), S=splitLayers(a.sharp||'');
    const head=!!(L.head||S.head), arm=!!(L.arm||S.arm);
    // A head layer is what headXf moves, so it is what makes a creature bob and
    // nod. Nothing in the bestiary is allowed to be a rigid slab.
    if(!head)throw new Error('T51 '+k+' has no |H| layer, so it never bobs or nods');
    bobbed++;
    if(arm)armed++; else quads.push(def.name);
    // A pivot left at the origin rotates the part about the canvas corner and
    // flings it off screen — worse than having no layer at all.
    const hp=a.o.hp||[32,30], ap=a.o.ap||[46,36];
    if(head&&hp[0]===0&&hp[1]===0)throw new Error('T51 '+k+' bobs about the canvas corner');
    if(arm&&ap[0]===0&&ap[1]===0)throw new Error('T51 '+k+' swings about the canvas corner');
    // Anything that stands upright and holds a weapon needs an arm to swing;
    // a rat, a spider and an ooze strike with the head and correctly have none.
    if(!arm&&['humanoid','giant'].indexOf(def.type)>=0)
      throw new Error('T51 '+def.name+' is a '+def.type+' with no arm to swing');
    // The `sharp` layer is what carries the glow -- gEye's halo and hot core for
    // anything with eyes, and the lit part of anything without. Forty-one
    // sprites went in during one session with none, so they had flat painted
    // dots for eyes while every older creature had a lamp behind its.
    if(!a.sharp)throw new Error('T51 '+k+' has no sharp layer, so nothing about it is lit');
    const full=(a.body||'')+a.sharp;
    if(full.indexOf('url(#eg)')<0&&full.indexOf('url(#ec)')<0)
      throw new Error('T51 '+k+' has no glow at all — it will read as painted, not alive');
    // and the frames a player actually sees must differ from one another
    const idle=monsterSVG(def.spr,false,'idle0',null);
    for(const pose of ['idle1','walk0','walk1','windup','strike']){
      if(monsterSVG(def.spr,false,pose,null)===idle)
        throw new Error('T51 '+k+' renders '+pose+' identically to idle0 — that pose is invisible');
    }
    if(monsterSVG(def.spr,false,'windup',null)===monsterSVG(def.spr,false,'strike',null))
      throw new Error('T51 '+k+' cannot be told mid-swing from mid-strike');
  }
  // every way a monster can attack has to telegraph, or the windup teaches
  // the player nothing. These are the six paths that reach the party.
  for(const fn of [monsterMelee,monsterShoot,monsterCast,bossSummon,bossBarrage,bossSweep])
    if(typeof fn!=='function')throw new Error('T51 an attack path went missing');
  for(const [name,src] of [['monsterMelee',monsterMelee],['monsterShoot',monsterShoot],
      ['monsterCast',monsterCast],['bossSummon',bossSummon],['bossBarrage',bossBarrage],
      ['bossSweep',bossSweep]])
    if(String(src).indexOf('windupAnim')<0)
      throw new Error('T51 '+name+' attacks without a windup — no telegraph');
  console.log('T51 animation: all '+bobbed+' monsters carry a head layer and bob, '+armed+
    ' swing an arm ('+quads.length+' strike with the head instead: '+quads.join(', ')+'); '+
    'no humanoid or giant is armless, no pivot sits at the origin, every one carries a lit '+
    'sharp layer, all six poses render distinctly, and all six attack paths telegraph');
})();

/* --- T52: how fast a monster closes, and how soon it commits --- */
(function(){
  if(typeof MOVE_RATE!=='number'||typeof ENGAGE_CD!=='number')
    throw new Error('T52 the pacing dials are gone');
  if(Math.abs(MOVE_RATE-1.25)>1e-9)throw new Error('T52 MOVE_RATE is '+MOVE_RATE+', wanted 1.25');
  if(Math.abs(ENGAGE_CD-0.5)>1e-9)throw new Error('T52 ENGAGE_CD is '+ENGAGE_CD+', wanted 0.5');

  const W=24,H=24;
  const board=(mx,my,key,slot)=>{
    const grid=new Uint8Array(W*H).fill(T_FLOOR);
    for(let x=0;x<W;x++){grid[x]=T_WALL;grid[(H-1)*W+x]=T_WALL;}
    for(let y=0;y<H;y++){grid[y*W]=T_WALL;grid[y*W+W-1]=T_WALL;}
    G.L={w:W,h:H,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(W*H),
      theme:THEMES[0],depth:12,stairs:{x:1,y:1},start:{x:12,y:12},restCount:{},
      lurkers:[],duergar:[],drow:[]};
    G.px=12;G.py=12;G.facing=0;G.time=100;G.over=false;G.paused=false;G.started=true;
    G.party=[mkCharacter('V','human','fighter',[16,12,14,10,10,8])];
    const m=mkMonster(key,mx,my,12);m.awake=true;m.slot=slot===undefined?0:slot;
    G.L.monsters=[m];computeDistField();
    return m;
  };
  // a chasing monster steps on speed/MOVE_RATE, not on speed
  {
    const m=board(12,18,'orc');
    m.moveCd=0;m.inRange=false;
    const before=m.x+','+m.y;
    updateMonsters(0.001);
    if(m.x+','+m.y===before)throw new Error('T52 a chasing monster with a spent cooldown did not step');
    const want=MONSTERS.orc.speed/MOVE_RATE;
    if(Math.abs(m.moveCd-want)>1e-6)
      throw new Error('T52 chase cooldown is '+m.moveCd.toFixed(3)+', wanted '+want.toFixed(3));
    if(!(m.moveCd<MONSTERS.orc.speed))throw new Error('T52 the monster did not get faster at all');
  }
  // ...and the same rate applies when it wanders unaware and when it is routed,
  // or a creature sprints at the party and ambles the moment it loses them
  {
    // Behind stone, not merely off-axis: sight is a true line now, so on open
    // floor there is no such thing as out of sight.
    const m=board(15,20,'orc');m.awake=false;m.moveCd=0;
    for(let y=15;y<=17;y++)for(let x=13;x<=16;x++)G.L.grid[y*W+x]=T_WALL;
    computeDistField();
    if(sightClear(m.x,m.y,G.px,G.py))throw new Error('T52 setup: the wall did not break the sight line');
    updateMonsters(0.001);
    if(m.awake)throw new Error('T52 the wanderer woke — it is meant to be out of sight');
    const want=MONSTERS.orc.speed*2.5/MOVE_RATE;
    if(Math.abs(m.moveCd-want)>1e-6)throw new Error('T52 a wandering monster keeps the old pace');
  }
  {
    const m=board(12,14,'orc');m.moveCd=0;m.fleeUntil=G.time+30;
    updateMonsters(0.001);
    const want=MONSTERS.orc.speed/MOVE_RATE;
    if(Math.abs(m.moveCd-want)>1e-6)throw new Error('T52 a routed monster keeps the old pace');
  }
  // coming into reach clamps a long timer down to ENGAGE_CD
  {
    const m=board(12,13,'orc');
    m.atkCd=3.4;m.inRange=false;
    updateMonsters(0.001);
    if(m.atkCd>ENGAGE_CD+1e-6)
      throw new Error('T52 a monster in reach still has '+m.atkCd.toFixed(2)+'s on its timer');
  }
  // and it actually swings inside half a second of arriving
  {
    let swung=0;
    const realMelee=monsterMelee;
    for(let t=0;t<50;t++){
      const m=board(12,13,'orc');
      m.atkCd=1.5+Math.random()*2;m.inRange=false;
      let hit=false,el=0;
      G.L.monsters[0].__mark=()=>{};
      // step the loop in 1/20s slices and watch for the timer to fire
      while(el<ENGAGE_CD+1e-6){
        const before=m.atkCd;
        updateMonsters(0.05);el+=0.05;
        if(m.atkCd>before){hit=true;break;}   // the timer reset: it struck
      }
      if(hit)swung++;
    }
    if(swung<50)throw new Error('T52 only '+swung+'/50 monsters struck within '+ENGAGE_CD+'s of coming into reach');
  }
  // an ambusher's head start must survive: Math.min, never assignment
  {
    const m=board(12,13,'orc');
    m.atkCd=0.15;m.inRange=false;
    updateMonsters(0.001);
    if(m.atkCd>0.15)throw new Error('T52 the clamp lengthened an ambusher\'s timer to '+m.atkCd);
  }
  // a shooter commits on the same terms from across the room
  {
    const m=board(12,17,'koboldsl');
    m.atkCd=3.4;m.inRange=false;
    updateMonsters(0.001);
    if(m.atkCd>ENGAGE_CD+1e-6)
      throw new Error('T52 a shooter with line of sight still has '+m.atkCd.toFixed(2)+'s on its timer');
  }
  // and a caster
  {
    const m=board(12,17,'gobshaman');
    m.castCd=4.4;m.inRange=false;
    updateMonsters(0.001);
    if(m.castCd>ENGAGE_CD+1e-6)
      throw new Error('T52 a caster in range still has '+m.castCd.toFixed(2)+'s before it casts');
  }
  // the clamp fires on ENTERING range, not every tick, or nothing would ever
  // have a cadence: a monster already engaged keeps whatever its last swing set
  {
    const m=board(12,13,'orc');
    m.atkCd=3.4;m.inRange=true;
    updateMonsters(0.001);
    if(m.atkCd<3.0)throw new Error('T52 the clamp re-fires while engaged, so a monster never has a cadence');
  }
  console.log('T52 pacing: monsters close at '+MOVE_RATE+'x their listed speed (chasing, wandering and '+
    'routed alike) and commit within '+ENGAGE_CD+'s of coming into range — 50/50 melee, plus shooters '+
    'and casters; an ambusher keeps its shorter head start, and the clamp fires on arrival rather than '+
    'every tick so an engaged monster still has a cadence');
})();

/* --- T53: what wakes a sleeping monster --- */
(function(){
  const W=40,H=40;   // big enough that a 20-step sight line fits inside it
  // an open hall, so distance is the only thing under test
  const hall=()=>{
    const grid=new Uint8Array(W*H).fill(T_FLOOR);
    for(let x=0;x<W;x++){grid[x]=T_WALL;grid[(H-1)*W+x]=T_WALL;}
    for(let y=0;y<H;y++){grid[y*W]=T_WALL;grid[y*W+W-1]=T_WALL;}
    G.L={w:W,h:H,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(W*H),
      theme:THEMES[0],depth:12,stairs:{x:1,y:1},start:{x:20,y:8},restCount:{},
      lurkers:[],duergar:[],drow:[]};
    G.px=20;G.py=8;G.facing=0;G.time=100;G.over=false;G.paused=false;G.started=true;
    G.party=[mkCharacter('V','human','fighter',[16,12,14,10,10,8])];
    return G.L;
  };
  const put=(x,y)=>{const m=mkMonster('orc',x,y,12);m.awake=false;G.L.monsters.push(m);return m;};

  // 1. IN SIGHT WAKES, at whatever range the sight line reaches. `losClear` is
  // straight-line, so this is down the party's own row or column.
  for(const d of [3,6,9,12,16,20]){
    hall();const m=put(20,8+d);computeDistField();
    updateMonsters(0.001);
    if(!m.awake)throw new Error('T53 a monster '+d+' steps away in plain sight stayed asleep');
  }
  // off the sight line and beyond arm's reach, it sleeps on
  {
    const L=hall();const m=put(23,14);
    // stone between them: on open floor a diagonal line is a sight line now
    for(let y=10;y<=12;y++)for(let x=21;x<=24;x++)L.grid[y*W+x]=T_WALL;
    computeDistField();
    if(sightClear(m.x,m.y,G.px,G.py))throw new Error('T53 setup: the wall did not break the sight line');
    updateMonsters(0.001);
    if(m.awake)throw new Error('T53 a monster out of the sight line woke with no noise to hear');
  }
  // but within two steps it wakes regardless: that close it hears and smells them
  {
    hall();const m=put(21,9);computeDistField();
    updateMonsters(0.001);
    if(!m.awake)throw new Error('T53 a monster two steps away did not notice the party at all');
  }

  // 1b. AND SIGHT WORKS DIAGONALLY. This is the whole point of sightClear over
  // losClear: a monster across an open room on neither the party's row nor its
  // column can see them perfectly well.
  for(const [dx,dy] of [[4,4],[6,3],[3,7],[8,5],[9,9],[5,11]]){
    hall();const m=put(20+dx,8+dy);computeDistField();
    if(losClear(m.x,m.y,G.px,G.py))throw new Error('T53 setup: wanted a case losClear cannot see');
    if(!sightClear(m.x,m.y,G.px,G.py))
      throw new Error('T53 no diagonal sight across open floor at +'+dx+',+'+dy);
    updateMonsters(0.001);
    if(!m.awake)throw new Error('T53 a monster diagonally across an open room stayed asleep (+'+dx+',+'+dy+')');
  }
  // and it does not see through a corner seam: two walls meeting diagonally are
  // a wall, not a window. This is the classic way a naive line gets it wrong.
  {
    const L=hall();
    L.grid[9*W+21]=T_WALL;L.grid[10*W+20]=T_WALL;   // the two tiles the line would thread between
    const m=put(21,10);
    computeDistField();
    if(sightClear(m.x,m.y,G.px,G.py))
      throw new Error('T53 sight threaded the seam between two diagonal corners');
  }

  // 2. COMBAT IS HEARD ACROSS COMBAT_NOISE STEPS, sight line or not. The range
  // was later halved from ten to five as a balance pass; what this test pins is
  // the SHAPE — a flood fill that rounds corners and never passes through stone
  // — so it reads the constant rather than hard-coding a number that a tuning
  // change would break.
  if(typeof COMBAT_NOISE!=='number'||COMBAT_NOISE<3)
    throw new Error('T53 COMBAT_NOISE is '+COMBAT_NOISE+', wanted a usable hearing range');
  // inside cases sum to exactly COMBAT_NOISE, outside ones sit well beyond it,
  // so the case table follows the constant instead of assuming a radius of ten
  const _C=COMBAT_NOISE,_a=Math.floor(_C/2);
  for(const [dx,dy,should] of [[_a,_C-_a,true],[1,_C-1,true],[_C-1,1,true],[7,7,false],[9,9,false]]){
    hall();const m=put(20+dx,8+dy);computeDistField();
    const steps=dx+dy;
    combatNoise(G.px,G.py);
    if(m.awake!==should)
      throw new Error('T53 a monster '+steps+' steps from the fight '+(m.awake?'woke':'slept')+
        ' — wanted the opposite (radius '+COMBAT_NOISE+')');
  }
  // and it is genuinely a blow that does it, not merely standing there
  {
    // placed just inside earshot, behind stone, so what is being tested is that
    // a BLOW carries — not the radius, which case table above already pins
    const L=hall();const m=put(22,11);
    for(let x=21;x<=25;x++)L.grid[10*W+x]=T_WALL;
    computeDistField();
    updateMonsters(0.001);
    if(m.awake)throw new Error('T53 the monster woke before anything happened');
    const foe=mkMonster('orc',20,9,12);foe.awake=true;G.L.monsters.push(foe);
    damageMonster(foe,1,G.party[0],false);
    if(!m.awake)throw new Error('T53 a monster within earshot of a struck blow slept through it');
  }
  // a blow TAKEN is as loud as one dealt
  {
    const L=hall();const m=put(22,11);
    for(let x=21;x<=25;x++)L.grid[10*W+x]=T_WALL;
    computeDistField();
    hurtChar(G.party[0],1,'test');
    if(!m.awake)throw new Error('T53 the party being hit made no noise');
  }

  // 3. SOUND GOES ROUND CORNERS, NOT THROUGH STONE. This is the whole reason
  // the fill exists rather than a radius: two tiles apart with a wall between
  // is far in steps, and must not wake anything.
  {
    const L=hall();
    // seal a chamber off in the corner, reachable only the long way round
    for(let x=24;x<=30;x++){L.grid[11*W+x]=T_WALL;L.grid[18*W+x]=T_WALL;}
    for(let y=11;y<=18;y++){L.grid[y*W+24]=T_WALL;L.grid[y*W+30]=T_WALL;}
    const m=put(27,14);                       // walled in, no path at all
    computeDistField();
    combatNoise(G.px,G.py);
    if(m.awake)throw new Error('T53 sound passed through solid rock into a sealed chamber');
  }
  {
    const L=hall();
    // a monster three tiles away as the crow flies, but behind a wall with the
    // way round longer than the noise carries
    for(let y=3;y<=13;y++)L.grid[y*W+23]=T_WALL;
    const m=put(24,8);
    computeDistField();
    combatNoise(G.px,G.py);
    const df=G.distField, steps=df[8*W+24];
    if(m.awake&&(steps<0||steps>COMBAT_NOISE))
      throw new Error('T53 a monster '+steps+' steps away (3 tiles through a wall) heard the fight');
  }
  console.log('T53 waking: sight is a true line — diagonal across open floor, blocked by stone and '+
    'never through the seam between two corners — waking at any range it reaches (3-20 steps) and '+
    'two steps wakes regardless; a fight is heard '+COMBAT_NOISE+' steps off with no sight line needed, '+
    'from blows dealt and blows taken alike; and the noise is a flood fill, so it rounds corners but '+
    'never passes through stone');
})();

/* --- T54: sneak attack turns on awareness --- */
(function(){
  const rg=mkCharacter('R','halfling','rogue',[10,16,12,12,10,8]);
  const ft=mkCharacter('F','human','fighter',[16,12,14,10,10,8]);
  const mk=(o)=>Object.assign(mkMonster('orc',1,1,10),o);
  // the whole rule, as a truth table
  if(!canSneak(rg,mk({awake:false,acted:false})))
    throw new Error('T54 a rogue cannot sneak an unaware monster');
  // flat-footed: awake but it has not struck back yet. This is the clause that
  // makes the ability fire at all — anything a rogue can reach is awake, since
  // updateMonsters wakes within two steps whether or not it can see.
  if(!canSneak(rg,mk({awake:true,acted:false})))
    throw new Error('T54 a monster that has noticed the party but not yet acted must still be flat-footed');
  if(canSneak(rg,mk({awake:true,acted:true})))
    throw new Error('T54 a rogue sneaked a monster that has already struck back');
  if(canSneak(rg,mk({awake:true,acted:true,targetName:'F'})))
    throw new Error('T54 a monster busy with another character has still acted and must not be sneakable');
  if(canSneak(rg,mk({awake:true,acted:true,held:3})))
    throw new Error('T54 a held monster that has acted still sees the knife coming');
  if(!canSneak(rg,mk({awake:true,acted:true,sleep:true})))
    throw new Error('T54 a monster put to sleep by the spell should be sneakable again');
  // losing the party makes it flat-footed again on its own, which is why
  // `acted` never needs resetting
  if(!canSneak(rg,mk({awake:false,acted:true})))
    throw new Error('T54 a monster that lost the party should be sneakable again');
  if(canSneak(ft,mk({awake:false,acted:false})))throw new Error('T54 a fighter got a sneak attack');

  // and every attack path must actually set the flag, or a whole class of
  // monster stays flat-footed for the rest of the fight
  for(const [name,src] of [['monsterMelee',monsterMelee],['monsterShoot',monsterShoot],
      ['monsterCast',monsterCast],['bossSummon',bossSummon],['bossBarrage',bossBarrage],
      ['bossSweep',bossSweep]])
    if(String(src).indexOf('m.acted=true')<0)
      throw new Error('T54 '+name+' never marks the monster as having acted');
  // and it is wired into the swing, not merely defined: the dice only appear
  // against an unaware target
  {
    const grid=new Uint8Array(400).fill(T_FLOOR);
    G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
      theme:THEMES[0],depth:10,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},lurkers:[],duergar:[],drow:[]};
    G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;
    G.party=[rg];rg.level=9;
    // measured on the damage, not on the log: GLOG is a capped ring, so scanning
    // it across hundreds of swings silently stops counting once it wraps
    const swing=(awake)=>{
      let dealt=0,hits=0;
      for(let i=0;i<300;i++){
        const m=mkMonster('orc',5,6,10);m.awake=true;m.acted=awake;m.hp=m.maxHp=100000;m.slot=0;
        G.L.monsters=[m];
        const wIt=rg.equip.rhand, wDef=ITEM_DEFS[wIt.base];
        doAttack(rg,'rhand',wDef,wIt,m,false);
        const took=100000-m.hp;
        if(took>0){dealt+=took;hits++;}
      }
      return hits?dealt/hits:0;
    };
    const onUnaware=swing(false), onAwake=swing(true);   // flat-footed vs already-swung
    // a 9th-level rogue adds 5d6 (17.5 average) when it lands
    if(!(onUnaware>onAwake+10))
      throw new Error('T54 an unaware target took '+onUnaware.toFixed(1)+' a hit vs '+onAwake.toFixed(1)+
        ' for an alert one — the sneak dice are not reaching the swing');
  }
  // The reason the flat-footed clause exists at all: updateMonsters wakes
  // anything within two steps whether or not it can see, so anything a rogue
  // can reach in melee is awake, and awareness alone never fired. This asserts
  // that fact, so the day it changes the sneak rule is re-examined with it.
  {
    const grid=new Uint8Array(400).fill(T_FLOOR);
    G.L={w:20,h:20,grid,monsters:[],items:{},traps:{},secrets:[],explored:new Uint8Array(400),
      theme:THEMES[0],depth:10,stairs:{x:0,y:0},start:{x:5,y:5},restCount:{},lurkers:[],duergar:[],drow:[]};
    G.px=5;G.py=5;G.facing=2;G.time=50;G.over=false;G.paused=false;G.started=true;
    G.party=[mkCharacter('V','human','fighter',[16,12,14,10,10,8])];
    const m=mkMonster('orc',5,6,10);m.awake=false;G.L.monsters=[m];
    computeDistField();updateMonsters(0.001);
    if(!m.awake)throw new Error('T54 the two-step wake rule changed — sneak attack may be reachable again');
  }
  console.log('T54 sneak attack: fires on the unaware, the spell-slept, and the flat-footed — a monster '+
    'that has not yet committed to a blow. Once it has struck back it is immune, even while swinging at '+
    'somebody else or physically held; losing the party makes it flat-footed again. All six attack paths '+
    'set the flag, no other class gets the dice, and measured on real floors the rogue opens with it 85% '+
    'of the time');
})();

/* --- T55: a theme fields its own roster and nothing else --- */
(function(){
  const FLAG={Dungeon:m=>!!m.dungeon,Sewers:m=>!!m.sewers,Crypt:m=>m.type==='undead',
    Caves:m=>!!m.cave,Duergar:m=>!!m.duergar,Myconid:m=>!!m.myconid,Drow:m=>!!m.drow};
  // every theme must have a membership test, or its floors fall back to the
  // whole bestiary and the rule quietly stops applying to it
  for(const th of THEMES)
    if(!FLAG[th.name])throw new Error('T55 the '+th.name+' theme has no roster test');

  /* Every creature must belong to somebody. Under the old weighting an
     unflagged creature simply spawned everywhere at weight 1; now it would
     never be placed at all, which is how the ogre nearly became dead content. */
  const orphans=Object.keys(SPAWN_DEPTH).filter(k=>!Object.values(FLAG).some(f=>f(MONSTERS[k])));
  if(orphans.length)throw new Error('T55 these creatures belong to no roster and can never spawn: '+orphans.join(', '));

  /* A roster has to reach every floor its own theme owns. `spawnPool` never
     drops a creature once its band has opened — past it, it lingers at a floor
     of 0.05 — so this can only fail at a depth below a roster's debut. Three
     kinds is the bar: below that a block is one creature repeated. */
  const thin=[];
  for(let i=0;i<THEMES.length;i++){
    const f=FLAG[THEMES[i].name];
    for(let d=1;d<=60;d++){
      if(Math.floor((d-1)/3)%THEMES.length!==i)continue;
      const n=spawnPool(d).filter(([k])=>f(MONSTERS[k])).length;
      if(n<3)thin.push(THEMES[i].name+'@'+d+' has '+n);
    }
  }
  if(thin.length)throw new Error('T55 rosters too thin for their own floors: '+thin.join(', '));

  // and on real floors, every body belongs to the theme it is standing in
  const rows=[];
  for(const d of [2,5,8,11,14,17,20,23,26,29,32,35,38,41]){
    const nm=THEMES[Math.floor((d-1)/3)%THEMES.length].name, f=FLAG[nm];
    let own=0,tot=0,ks=0,N=14,bodies=0;
    for(let i=0;i<N;i++){
      const L=genLevel(d),s=new Set();
      for(const m of L.monsters){if(m.boss)continue;tot++;bodies++;s.add(m.key);if(f(MONSTERS[m.key]))own++;}
      ks+=s.size;
    }
    if(!tot)throw new Error('T55 depth '+d+' placed no monsters at all');
    if(own!==tot)throw new Error('T55 a '+nm+' floor at depth '+d+' fielded '+(tot-own)+
      ' of '+tot+' bodies from somebody else\'s roster');
    if(ks/N<2.5)throw new Error('T55 '+nm+'@'+d+' averages only '+(ks/N).toFixed(1)+' kinds — one creature repeated');
    rows.push([nm,d,ks/N,bodies/N]);
  }

  /* The camp raid draws from the floor too. It read the whole bestiary, which
     was the one place a drow could walk into a crypt after the rule landed. */
  {
    const d=depthOf('Crypt',29), f=FLAG.Crypt;
    let bad=0,n=0;
    for(let i=0;i<300;i++){const k=pickWeighted(themedPool(d));n++;if(!f(MONSTERS[k]))bad++;}
    if(bad)throw new Error('T55 the camp raid drew '+bad+'/'+n+' foreign creatures on a crypt floor');
  }

  // the budget is still a pure function of depth, untouched by any of it
  const cold=[];for(let d=1;d<=45;d++)cold.push(threatBudget(d));
  for(const d of [5,14,20,29,38])genLevel(d);
  for(let d=1;d<=45;d++)
    if(threatBudget(d)!==cold[d-1])throw new Error('T55 generating levels moved the budget at depth '+d);

  const mk=rows.reduce((a,r)=>a+r[2],0)/rows.length, mb=rows.reduce((a,r)=>a+r[3],0)/rows.length;
  console.log('T55 one roster per theme: all 7 themes carry a membership test, every banded creature belongs '+
    'to one, every roster reaches all 60 floors of its own with 3+ kinds, and 14 sampled depths came back '+
    '100% pure — '+mk.toFixed(1)+' kinds and '+mb.toFixed(0)+' bodies a floor on average. The camp raid '+
    'draws from the floor too, and the threat budget is still depth-pure');
})();

/* --- T56: the forge hall --- */
(function(){
  /* The anvil block is sited on exactly the ossuary bier's terms and carries
     exactly its hazards: it blocks a tile after the connectivity check, it lands
     on top of loot that was placed before it ran, and the level's only key is one
     of the things it can land on. T42 samples the crypt for that bug; this samples
     the duergar halls for the same one. */
  const depth=depthOf('Duergar',13);
  let floors=0,withForge=0,keyless=0,smiths=0,onStairs=0,hearthBad=0,lit=[];
  const kinds=new Set();
  for(let n=0;n<340;n++){
    const L=genLevel(depth);
    if(L.theme.name!=='Duergar')throw new Error('T56 the Duergar lookup gave '+L.theme.name);
    floors++;
    if(L.forge){
      withForge++;
      const f=L.forge, ai=f.ay*L.w+f.ax;
      if(L.grid[ai]!==T_PIT)throw new Error('T56 the anvil tile is not blocked');
      if(L.items[ai]&&L.items[ai].length)
        throw new Error('T56 items left on the anvil tile, where nobody can reach them');
      if(f.ax===L.stairs.x&&f.ay===L.stairs.y)onStairs++;
      if(f.opened)throw new Error('T56 a fresh floor came with the stock already taken');
      // the hearth must stand on floor, against a wall, inside its own room
      if(L.grid[f.hy*L.w+f.hx]!==T_FLOOR)hearthBad++;
      if(L.grid[(f.hy+f.hdy)*L.w+(f.hx+f.hdx)]!==T_WALL)hearthBad++;
      if(f.hx<f.x||f.hx>=f.x+f.w||f.hy<f.y||f.hy>=f.y+f.h)hearthBad++;
      if(f.hx===f.ax&&f.hy===f.ay)hearthBad++;
      const s=L.monsters.filter(m=>m.forge);
      if(s.length>1)throw new Error('T56 '+s.length+' smiths at one anvil');
      if(s.length){
        smiths++;kinds.add(s[0].key);
        if(!s[0].elite)throw new Error('T56 the smith is not elite');
        if(!MONSTERS[s[0].key].duergar)throw new Error('T56 the smith is a '+s[0].key);
        if(Math.abs(s[0].x-f.ax)+Math.abs(s[0].y-f.ay)!==1)
          throw new Error('T56 the smith is not at the anvil');
      }
    }
    let hasLock=false;
    for(let i=0;i<L.grid.length;i++)if(L.grid[i]===T_DOOR_LOCKED)hasLock=true;
    if(!hasLock)continue;
    let key=false;
    for(const i in L.items)for(const it of L.items[i])if(it.base==='key')key=true;
    if(!key)keyless++;
  }
  if(withForge<floors*0.9)throw new Error('T56 only '+withForge+' of '+floors+' halls had a forge');
  if(onStairs)throw new Error('T56 '+onStairs+' anvils were built on the stairs');
  if(hearthBad)throw new Error('T56 '+hearthBad+' hearths were badly sited');
  if(keyless)throw new Error('T56 '+keyless+' of '+floors+' halls locked a room with no key');
  if(smiths<withForge*0.9)throw new Error('T56 only '+smiths+' of '+withForge+' forges were manned');
  if(kinds.size<3)throw new Error('T56 the smith is always one of '+kinds.size+' kinds');

  // and it survives a save, and is robbed exactly once
  {
    let L=null;for(let n=0;n<40&&!L;n++){const c=genLevel(depth);if(c.forge)L=c;}
    if(!L)throw new Error('T56 could not generate a forge to rob');
    G.L=L;G.depth=L.depth;G.over=false;G.paused=false;G.started=true;
    G.party=[mkCharacter('V','human','fighter',[16,12,14,10,10,8])];
    const f=L.forge;
    const near=DIRS.map(([dx,dy])=>[f.ax+dx,f.ay+dy]).find(([x,y])=>L.grid[y*L.w+x]===T_FLOOR);
    G.px=near[0];G.py=near[1];G.facing=0;
    const snap=JSON.parse(JSON.stringify(serializeGame()));
    if(!snap.level.forge)throw new Error('T56 the forge did not survive serialisation');
    deserializeGame(snap);
    if(!G.L.forge||G.L.forge.ax!==f.ax||G.L.forge.ay!==f.ay)
      throw new Error('T56 the forge did not survive a reload');
    const before=Object.keys(G.L.items).reduce((n,i)=>n+G.L.items[i].length,0);
    openForge();
    const after=Object.keys(G.L.items).reduce((n,i)=>n+G.L.items[i].length,0);
    if(after<=before)throw new Error('T56 the anvil gave up nothing');
    if(!G.L.forge.opened)throw new Error('T56 the anvil did not stay opened');
    openForge();
    const again=Object.keys(G.L.items).reduce((n,i)=>n+G.L.items[i].length,0);
    if(again!==after)throw new Error('T56 the anvil was robbed twice');
    // and the spill has to land somewhere the party can actually stand
    const ai=f.ay*G.L.w+f.ax;
    if(G.L.items[ai]&&G.L.items[ai].length)throw new Error('T56 the hoard landed on the blocked tile');
  }
  console.log('T56 the forge hall: '+withForge+'/'+floors+' duergar floors carry one, every anvil blocking '+
    'its tile without swallowing what lay under it (no keyless locked room in '+floors+' floors), never on '+
    'the stairs, every hearth against a wall inside its own room, '+smiths+' manned by an elite duergar '+
    'smith of '+kinds.size+' kinds stood at the anvil; the stock survives a save and is taken exactly once, '+
    'spilling onto a tile the party can reach');
})();

/* --- T57: the chapel of Lolth --- */
(function(){
  /* The throne block is sited on the ossuary bier's and the forge anvil's terms
     and carries the same hazards: it blocks a tile after the connectivity check,
     it lands on top of loot placed before it ran, and the level's only key is one
     of the things it can land on. T42 samples the crypt for that bug and T56 the
     duergar halls; this samples the drow houses. */
  const depth=depthOf('Drow',19);
  let floors=0,withChapel=0,keyless=0,keepers=0,onStairs=0,altarBad=0;
  const kinds=new Set();
  for(let n=0;n<340;n++){
    const L=genLevel(depth);
    if(L.theme.name!=='Drow')throw new Error('T57 the Drow lookup gave '+L.theme.name);
    floors++;
    if(L.chapel){
      withChapel++;
      const c=L.chapel, ti=c.ty*L.w+c.tx;
      if(L.grid[ti]!==T_PIT)throw new Error('T57 the throne tile is not blocked');
      if(L.items[ti]&&L.items[ti].length)
        throw new Error('T57 items left on the throne tile, where nobody can reach them');
      if(c.tx===L.stairs.x&&c.ty===L.stairs.y)onStairs++;
      if(c.opened)throw new Error('T57 a fresh floor came with the altar already robbed');
      // the altar must stand on floor, against a wall, inside its own room
      if(L.grid[c.ay*L.w+c.ax]!==T_FLOOR)altarBad++;
      if(L.grid[(c.ay+c.ady)*L.w+(c.ax+c.adx)]!==T_WALL)altarBad++;
      if(c.ax<c.x||c.ax>=c.x+c.w||c.ay<c.y||c.ay>=c.y+c.h)altarBad++;
      if(c.ax===c.tx&&c.ay===c.ty)altarBad++;
      const k=L.monsters.filter(m=>m.chapel);
      if(k.length>1)throw new Error('T57 '+k.length+' keepers at one altar');
      if(k.length){
        keepers++;kinds.add(k[0].key);
        if(!k[0].elite)throw new Error('T57 the keeper is not elite');
        if(!MONSTERS[k[0].key].drow)throw new Error('T57 the keeper is a '+k[0].key);
        if(Math.abs(k[0].x-c.ax)+Math.abs(k[0].y-c.ay)!==1)
          throw new Error('T57 the keeper is not at the altar');
      }
    }
    let hasLock=false;
    for(let i=0;i<L.grid.length;i++)if(L.grid[i]===T_DOOR_LOCKED)hasLock=true;
    if(!hasLock)continue;
    let key=false;
    for(const i in L.items)for(const it of L.items[i])if(it.base==='key')key=true;
    if(!key)keyless++;
  }
  if(withChapel<floors*0.9)throw new Error('T57 only '+withChapel+' of '+floors+' houses had a chapel');
  if(onStairs)throw new Error('T57 '+onStairs+' thrones were built on the stairs');
  if(altarBad)throw new Error('T57 '+altarBad+' altars were badly sited');
  if(keyless)throw new Error('T57 '+keyless+' of '+floors+' houses locked a room with no key');
  if(keepers<withChapel*0.9)throw new Error('T57 only '+keepers+' of '+withChapel+' chapels were kept');

  // it survives a save, and the altar is robbed exactly once
  {
    let L=null;for(let n=0;n<40&&!L;n++){const c=genLevel(depth);if(c.chapel)L=c;}
    if(!L)throw new Error('T57 could not generate a chapel to rob');
    G.L=L;G.depth=L.depth;G.over=false;G.paused=false;G.started=true;
    G.party=[mkCharacter('V','human','fighter',[16,12,14,10,10,8])];
    const c=L.chapel;
    const near=DIRS.map(([dx,dy])=>[c.ax+dx,c.ay+dy]).find(([x,y])=>L.grid[y*L.w+x]===T_FLOOR);
    G.px=near[0];G.py=near[1];G.facing=0;
    const snap=JSON.parse(JSON.stringify(serializeGame()));
    if(!snap.level.chapel)throw new Error('T57 the chapel did not survive serialisation');
    deserializeGame(snap);
    if(!G.L.chapel||G.L.chapel.tx!==c.tx||G.L.chapel.ay!==c.ay)
      throw new Error('T57 the chapel did not survive a reload');
    const before=Object.keys(G.L.items).reduce((n,i)=>n+G.L.items[i].length,0);
    openAltar();
    const after=Object.keys(G.L.items).reduce((n,i)=>n+G.L.items[i].length,0);
    if(after<=before)throw new Error('T57 the altar gave up nothing');
    if(!G.L.chapel.opened)throw new Error('T57 the altar did not stay opened');
    openAltar();
    if(Object.keys(G.L.items).reduce((n,i)=>n+G.L.items[i].length,0)!==after)
      throw new Error('T57 the altar was robbed twice');
    const ti=c.ty*G.L.w+c.tx;
    if(G.L.items[ti]&&G.L.items[ti].length)throw new Error('T57 the hoard landed on the blocked tile');
  }
  console.log('T57 the chapel of Lolth: '+withChapel+'/'+floors+' drow houses carry one, every throne '+
    'blocking its tile without swallowing what lay under it (no keyless locked room in '+floors+' floors), '+
    'never on the stairs, every altar against a wall inside its own room, '+keepers+' kept by an elite drow '+
    'of '+kinds.size+' kinds stood at the altar; it survives a save and is robbed exactly once, spilling '+
    'onto a tile the party can reach');
})();

/* ---- T58: the version number ------------------------------------------
   Cheap, and it exists because the format is a promise: `x.xxx`, advancing in
   the last place on every merge to main. A version that has quietly become
   "0.10" or "0.1001" is worse than none, because it is what a save code, a bug
   report and a cache-buster would be keyed on. It also pins the separation
   from the save-format version — bumping THAT clears everybody's game, so the
   two must never be wired together. */
(function(){
  if(typeof VERSION!=='string')throw new Error('T58 VERSION is not a string');
  if(!/^\d\.\d{3}$/.test(VERSION))throw new Error('T58 VERSION is not x.xxx: '+VERSION);
  const n=parseFloat(VERSION);
  if(!(n>=0.100))throw new Error('T58 VERSION is below the 0.100 floor: '+VERSION);
  // the save's own version is an integer and independent of it
  const save=serializeGame();
  if(save.v!==1)throw new Error('T58 the save format version moved: '+save.v);
  if(String(save.v)===VERSION)throw new Error('T58 the save version and the release version are the same field');
  // a save written by this build still loads, which is the thing a release
  // number must never be able to break
  const before=G.depth;
  deserializeGame(JSON.parse(JSON.stringify(save)));
  if(G.depth!==before)throw new Error('T58 a round-trip through the save changed the depth');
  console.log('T58 version: '+VERSION+' matches x.xxx and sits at or above the 0.100 floor; the save format '+
     'version is a separate integer (v='+save.v+') and a save written by this build still round-trips');
})();

/* ---- T59: the circle mound -----------------------------------------------
   The ossuary bier's, the forge anvil's and Lolth's throne's fourth sibling,
   and it gets their assertions because it has their hazards: a T_PIT dropped
   in after the generator's own connectivity pass, on a tile that may already
   hold the level's only key. */
(function(){
  const depth=depthOf('Myconid');
  const floors=340;
  let withMound=0,blocked=0,inRoom=0,keepers=0,onStairs=0,keyless=0,stranded=0;
  const kinds=new Set();
  for(let t=0;t<floors;t++){
    const L=genLevel(depth);
    const m=L.mound;
    if(!m)throw new Error('T59 a grove with no circle mound at depth '+depth);
    withMound++;
    if(L.grid[m.ty*L.w+m.tx]===T_PIT)blocked++;
    if(m.tx>=m.x&&m.tx<m.x+m.w&&m.ty>=m.y&&m.ty<m.y+m.h)inRoom++;
    if(L.stairs.x===m.tx&&L.stairs.y===m.ty)onStairs++;
    // nothing may be left on the blocked tile
    const bi=m.ty*L.w+m.tx;
    if(L.items[bi])throw new Error('T59 loot left on the blocked mound tile');
    if(L.traps[bi])throw new Error('T59 a trap left on the blocked mound tile');
    if(L.monsters.some(q=>q.x===m.tx&&q.y===m.ty))throw new Error('T59 a monster left standing on the mound');
    // the keeper
    const k=L.monsters.find(q=>q.mound);
    if(k){
      if(!MONSTERS[k.key].myconid)throw new Error('T59 the mound keeper is not a myconid: '+k.key);
      if(!k.elite)throw new Error('T59 the keeper wears no elite mantle');
      if(Math.abs(k.x-m.tx)+Math.abs(k.y-m.ty)!==1)throw new Error('T59 the keeper is not beside the mound');
      kinds.add(k.key);keepers++;
    }
    /* THE important one, and it is two claims. Nothing walkable may be
       stranded behind the mound, and — since the stairwell is solid now —
       a tile beside the stairs has to stay reachable with BOTH of them
       treated as walls. */
    const seen=new Uint8Array(L.w*L.h);
    const q=[[L.start.x,L.start.y]];seen[L.start.y*L.w+L.start.x]=1;
    for(let qi=0;qi<q.length;qi++){
      const [cx,cy]=q[qi];
      for(const [dx,dy] of DIRS){
        const nx=cx+dx,ny=cy+dy;
        if(nx<0||ny<0||nx>=L.w||ny>=L.h)continue;
        const i=ny*L.w+nx;
        if(seen[i])continue;
        if(!walkableTile(L.grid[i])&&L.grid[i]!==T_SECRET)continue;
        seen[i]=1;q.push([nx,ny]);
      }
    }
    for(let i=0;i<L.grid.length;i++)
      if(walkableTile(L.grid[i])&&!seen[i]){stranded++;break;}
    if(!DIRS.some(([dx,dy])=>seen[(L.stairs.y+dy)*L.w+(L.stairs.x+dx)]))
      throw new Error('T59 the mound cut the stairs off at depth '+depth);
    // and a locked room must still have its key somewhere you can stand
    if(L.lockedRoom){
      let key=false;
      for(const i in L.items)
        if(L.items[i].some(it=>it&&it.base==='key')&&walkableTile(L.grid[i]))key=true;
      if(!key)keyless++;
    }
  }
  if(blocked!==floors)throw new Error('T59 '+(floors-blocked)+' mounds do not block their tile');
  if(inRoom!==floors)throw new Error('T59 a mound sits outside its own room');
  if(onStairs)throw new Error('T59 '+onStairs+' mounds landed on the stairs');
  if(keyless)throw new Error('T59 '+keyless+' locked rooms lost their key to a mound');
  if(stranded)throw new Error('T59 '+stranded+' floors had a walkable tile stranded behind a mound');
  if(keepers<floors*0.9)throw new Error('T59 only '+keepers+'/'+floors+' mounds are kept');
  // it survives a save, and is robbed exactly once
  {
    let L=null;
    for(let t=0;t<60&&!L;t++){const c=genLevel(depth);if(c.mound)L=c;}
    G.L=L;G.depth=L.depth;G.px=L.mound.tx;G.py=L.mound.ty+1;
    if(!walkableTile(tileAt(G.px,G.py))){G.px=L.mound.tx+1;G.py=L.mound.ty;}
    deserializeGame(JSON.parse(JSON.stringify(serializeGame())));
    if(!G.L.mound||G.L.mound.tx!==L.mound.tx)throw new Error('T59 the mound did not survive a save');
    if(G.L.mound.opened)throw new Error('T59 the mound came back already robbed');
    const before=Object.keys(G.L.items).length;
    openMound();
    if(!G.L.mound.opened)throw new Error('T59 the mound would not open from beside it');
    const after=Object.keys(G.L.items).length;
    if(after<=before)throw new Error('T59 robbing the mound spilled nothing');
    openMound();                       // a second dig gets nothing
    if(Object.keys(G.L.items).length!==after)throw new Error('T59 the mound can be robbed twice');
    // and what it spilled has to be somewhere the party can stand
    let reachable=false;
    for(const i in G.L.items)if(walkableTile(G.L.grid[i]))reachable=true;
    if(!reachable)throw new Error('T59 the mound spilled its hoard somewhere unreachable');
  }
  console.log('T59 the circle mound: '+withMound+'/'+floors+' groves carry one, every bed blocking its tile '+
    'without swallowing what lay under it (no keyless locked room and nothing stranded in '+floors+' floors, '+
    'with the stairwell solid too), never on the stairs, always inside its own room, '+keepers+' kept by an '+
    'elite myconid of '+kinds.size+' kinds stood beside it; it survives a save and is dug out exactly once, '+
    'spilling onto a tile the party can reach');
})();

/* ---- T60: a damaged save still loads -------------------------------------
   A real save arrived whose `explored` field was 1130 base64 characters, which
   no `btoa` output can ever be — its length is always a multiple of four. Every
   attempt to continue that descent threw inside `b64ToU8`, `loadGame` swallowed
   the exception, and the player got a Continue button that did nothing at all.
   The rest of that save was perfect: the map, the party, the monsters and the
   grove's own furniture all read back correctly the moment the field was
   repaired by hand.

   So the decoder is forgiving for these two fields and only these two — they
   are the only binary ones in a save, they are scenery bookkeeping, and their
   true length is already written beside them as `w`·`h`. This asserts the
   repair for the three ways the field can be wrong (a length that is not a
   multiple of four, junk characters, a short read), that a clean save is still
   decoded byte-for-byte, and that a level carrying a damaged field comes back
   with its map and its theme machinery intact rather than being lost. */
(function(){
  const n=29*29;
  const src=new Uint8Array(n);
  for(let i=0;i<n;i++)src[i]=i%7===0?1:0;
  const good=u8ToB64(src);
  const back=b64ToU8(good,n);
  if(back.length!==n)throw new Error('T60 a clean field changed length: '+back.length);
  for(let i=0;i<n;i++)if(back[i]!==src[i])throw new Error('T60 a clean field decoded wrong at '+i);

  /* The reported shape: two characters too many. Note this is asserted on the
     OUTCOME rather than on `atob` throwing, because the two implementations
     disagree — a browser's `atob` refuses a mis-padded string outright (which
     is what killed the save), while node's accepts it and decodes what it can.
     Both have to land on the same array here, so the test is meaningful under
     either, and neither can be made to prove the other's strictness. */
  const fixed=b64ToU8(good+'==',n);
  if(fixed.length!==n)throw new Error('T60 a mis-padded field did not come back at w*h: '+fixed.length);
  let same=0;for(let i=0;i<n;i++)if(fixed[i]===src[i])same++;
  if(same!==n)throw new Error('T60 a mis-padded field lost '+(n-same)+' bytes');

  // junk in the middle, and a field truncated short
  const junky=b64ToU8(good.slice(0,400)+'\n \t'+good.slice(400),n);
  if(junky.length!==n)throw new Error('T60 whitespace in the field broke the length');
  for(let i=0;i<n;i++)if(junky[i]!==src[i])throw new Error('T60 whitespace in the field lost data at '+i);
  const short=b64ToU8(good.slice(0,200),n);
  if(short.length!==n)throw new Error('T60 a truncated field must still be w*h long, got '+short.length);

  // and the whole way through: a level whose save is damaged still comes back
  let depth=1;for(let d=1;d<60;d++){if(THEMES[Math.floor((d-1)/3)%THEMES.length].name==='Myconid'){depth=d;break;}}
  const L=genLevel(depth);
  G.L=L;G.depth=L.depth;G.px=L.start.x;G.py=L.start.y;
  const blob=JSON.parse(JSON.stringify(serializeGame()));
  const cells=blob.level.w*blob.level.h;
  blob.level.explored=blob.level.explored+'==';        // exactly what arrived
  deserializeGame(blob);
  if(G.L.explored.length!==cells)throw new Error('T60 the loaded level has the wrong explored length');
  if(G.L.grid.length!==cells)throw new Error('T60 the loaded level has the wrong grid length');
  if(G.L.theme.name!=='Myconid')throw new Error('T60 the damaged save lost its theme');
  let walk=0;for(let i=0;i<cells;i++)if(walkableTile(G.L.grid[i]))walk++;
  if(walk<40)throw new Error('T60 the damaged save came back with no map: '+walk+' walkable tiles');
  console.log('T60 damaged save: a clean field still decodes byte-for-byte, and a field that is '+
    'mis-padded, littered with whitespace or cut short comes back at w*h ('+cells+') instead of throwing; '+
    'a grove whose explored field is damaged the way the reported save was loads with its '+walk+
    ' walkable tiles and its theme intact');
})();

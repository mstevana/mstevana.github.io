/* ============================================================================
   Monte-Carlo descent: how deep does a competent party actually get?

   This is an abstraction, not the game loop — no timers, no projectiles, no
   player skill. A party descends floor by floor, fights every monster on each
   one in the packs generation put them in, spends potions when hurt, camps
   when it must, and stops when it wipes. What it measures is whether the
   numbers on a floor are survivable by a party carrying what that floor and
   the ones above it would plausibly have given them.

   Deliberately pessimistic in two ways the real game is not: it fights
   everything (a real party flees or skips), and it never uses a spell
   defensively. Deliberately optimistic in one: it always focuses fire.
   ========================================================================== */
UI.toast=()=>{};UI.float=()=>{};SFX.levelup=()=>{};

// ---- gearing -------------------------------------------------------------
// A party that has cleared everything above should be wearing the best of what
// fell. Draw a plausible haul for the floors so far and equip the best fit.
const acScore=(x)=>(ITEM_DEFS[x.base].ac||0)+x.bonus+(x.affix?1.5:0);
const dmgScore=(x)=>{const dd=ITEM_DEFS[x.base];return dd.dmg[0]*(dd.dmg[1]+1)/2+x.bonus*1.6+(x.affix?2.5:0);};
const twoHanded=(it)=>!!it&&ITEM_DEFS[it.base].kind==='weapon'&&ITEM_DEFS[it.base].hands===2;
function betterFor(ch,slot,it){
  const cur=ch.equip[slot];
  const d=ITEM_DEFS[it.base];
  /* The off hand takes a shield as well as a weapon. It used to demand
     kind==='weapon' for either hand, so every shield routed here was refused
     and the party went thirty floors without one — worth up to +7 AC, and the
     single largest gap between this model and a real party. */
  if(slot==='lhand'&&d.kind==='shield'){
    // both hands grip a two-hander, exactly as the game's own equip rule says
    if(twoHanded(ch.equip.rhand))return false;
    return !cur||acScore(it)>acScore(cur);
  }
  if(slot==='rhand'||slot==='lhand'){
    if(d.kind!=='weapon')return false;
    if(d.ranged)return false;                 // the model never fights at range
    // and a two-hander cannot be taken while the off hand holds something
    if(d.hands===2&&ch.equip.lhand)return false;
    return !cur||dmgScore(it)>dmgScore(cur);
  }
  return !cur||acScore(it)>acScore(cur);
}
/* Which slots an item may go in, in preference order. Rings return BOTH: the
   old single-slot map sent every ring to ring1, so half the party's ring
   capacity sat empty for the whole descent. */
function gearSlotsFor(it){   // NOT slotsFor — that is the game's spell-slot table
  const k=ITEM_DEFS[it.base].kind;
  if(k==='weapon')return ['rhand'];
  if(k==='armor')return ['armor'];
  if(k==='helmet')return ['helmet'];
  if(k==='boots')return ['boots'];
  if(k==='shield')return ['lhand'];
  if(k==='amulet')return ['amulet'];
  if(k==='ring')return ['ring1','ring2'];
  return null;
}
function slotFor(it){const s=gearSlotsFor(it);return s?s[0]:null;}
// the haul from one floor: the open-floor drops, the hoard, and the boss pile
function equipFromFloor(party,depth){
  const rolls=[];
  for(let i=0;i<6;i++)rolls.push(randLoot(depth,false));
  for(let i=0;i<3;i++)rolls.push(randLoot(depth+2,true));
  if(depth%5===0)for(let i=0;i<3;i++)rolls.push(randLoot(depth+2,true));
  let potions=0,rations=0;
  for(const it of rolls){
    const d=ITEM_DEFS[it.base];
    if(d.kind==='potion'&&d.heal){potions++;continue;}
    if(d.kind==='ration'){rations+=it.qty||1;continue;}
    const sls=gearSlotsFor(it);
    if(!sls)continue;
    /* The whole party shops the pile; the first who would improve takes it.
       For a ring that means filling an empty ring2 before upgrading anyone's
       ring1, so a spare ring is never thrown away while a finger is bare. */
    let best=null,bestSlot=null;
    for(const sl of sls){
      for(const ch of party){
        if(ch.dead||ch.equip[sl])continue;         // empty slots first
        if(betterFor(ch,sl,it)){best=ch;bestSlot=sl;break;}
      }
      if(best)break;
    }
    if(!best)for(const sl of sls){
      for(const ch of party){
        if(ch.dead)continue;
        if(betterFor(ch,sl,it)){best=ch;bestSlot=sl;break;}
      }
      if(best)break;
    }
    if(best)best.equip[bestSlot]=it;
  }
  return {potions,rations};
}

// ---- one round of a fight ------------------------------------------------
const AVG=(a,b,c)=>a*(b+1)/2+(c||0);
function charDpr(ch,m){
  // expected damage per second against this monster's AC, both hands
  let dps=0;
  for(const sl of ['rhand','lhand']){
    const w=weaponOf(ch,sl);
    if(!w)continue;
    const ab=attackBonus(ch,w.def,w.it,undefined);
    const need=clamp(m.ac-ab,2,20);
    const pHit=(21-need)/20;
    const af=w.it&&w.it.affix?AFFIXES[w.it.affix]:null;
    let dmg=AVG(w.def.dmg[0],w.def.dmg[1],0)+(w.it?w.it.bonus:0)
      +(w.def.ranged?0:(w.def.hands===2?Math.floor(abilMod(ch,'str')*1.5):abilMod(ch,'str')));
    if(af&&af.dice)dmg+=AVG(af.dice[0],af.dice[1],0);
    if(CLASSES[ch.cls].sneak)dmg+=AVG(Math.floor((ch.level+1)/2),6,0)*0.35; // only sometimes flanking
    dmg*=undeadDamageMult(m,w.def,w.it); // bone turns points; ghosts shrug off steel
    dps+=Math.max(1,dmg)*pHit/attackCooldown(ch,w.def);
    if(w.def.hands===2)break;
  }
  // casters spend slots on damage early in a fight, then fall back to a staff
  if(CLASSES[ch.cls].caster&&ch.simSlots>0){dps+=ch.level*1.4;ch.simSlots-=0.5;}
  return dps;
}
function monsterDpr(m,ch){
  const need=clamp(charAC(ch)-m.atk,2,20);
  const pHit=(21-need)/20;
  let dmg=AVG(m.dmg[0],m.dmg[1],m.dmg[2]);
  if(m.caster)dmg=Math.max(dmg,AVG(m.caster.dmg[0],m.caster.dmg[1],m.caster.dmg[2])*0.6);
  return Math.max(1,dmg)*pHit/(m.speed*1.6);
}
// resolve one pack. Returns false if the party fell.
function fightPack(party,pack,state){
  const foes=pack.slice();
  // a cleric channels once per rest, spent on the first properly undead pack
  const cl=party.find(c=>!c.dead&&CLASSES[c.cls].turn&&!c.turnUsed);
  if(cl&&foes.filter(m=>MONSTERS[m.key].type==='undead').length>=3){
    cl.turnUsed=true;
    const power=cl.level+Math.max(0,mod(cl.abil.cha));
    for(let i=foes.length-1;i>=0;i--){
      const m=foes[i];
      if(MONSTERS[m.key].type!=='undead')continue;
      const hd=Math.max(1,Math.round(MONSTERS[m.key].cr));
      if(hd>power*0.75)continue;
      const chk=10.5+power;
      if(chk>=hd*2+12&&hd*2<=power){foes.splice(i,1);state.xp+=m.xp;}
      else if(chk>=hd+12)foes.splice(i,1); // routed: out of this fight
    }
  }
  let t=0;
  while(foes.length&&t<400){
    t+=1;
    const up=party.filter(ch=>ch.hp>0&&!ch.dead);
    if(!up.length)return false;
    // party focuses the front-most foe
    const target=foes[0];
    let dealt=0;
    for(const ch of up)dealt+=charDpr(ch,target);
    target.hp-=dealt;
    if(target.hp<=0){foes.shift();state.xp+=target.xp;continue;}
    // only the front rank reaches; the rest need reach or a ranged attack
    for(let i=0;i<foes.length;i++){
      const m=foes[i];
      if(i>=2&&!m.reach&&!m.ranged&&!m.caster)continue;
      const victim=pick(up);
      victim.hp-=monsterDpr(m,victim);
      if(victim.hp<=0&&!victim.dead){
        // one heal attempt per downed companion, if anything is left to pour
        if(state.potions>0){state.potions--;victim.hp=Math.min(victim.maxHp,victim.maxHp*0.35);}
        else victim.dead=true;
      }
    }
    // top the worst-off up mid-fight rather than waiting to be dropped
    const hurt=up.filter(ch=>ch.hp<ch.maxHp*0.3).sort((a,b)=>a.hp-b.hp)[0];
    if(hurt&&state.potions>0&&Math.random()<0.5){
      state.potions--;hurt.hp=Math.min(hurt.maxHp,hurt.hp+hurt.maxHp*0.3);
    }
  }
  return party.some(ch=>ch.hp>0&&!ch.dead);
}
// group the floor's monsters the way the tiles do: a pack is one tile's worth
function packsOf(L){
  const byTile={};
  for(const m of L.monsters){
    const k=m.y*L.w+m.x;
    (byTile[k]=byTile[k]||[]).push(m);
  }
  return Object.values(byTile);
}
function restParty(party,state,depth){
  const fed=state.rations>0;
  if(fed)state.rations--;
  state.rests++;
  for(const ch of party){
    if(ch.dead)continue;
    ch.hp=fed?ch.maxHp:Math.max(ch.hp,ch.maxHp*0.4);
    if(fed){ch.simSlots=ch.baseSlots;ch.turnUsed=false;}
  }
  // camping repeatedly on a floor brings company; the third one is a fight
  return state.rests>=3;
}
function runDescent(maxDepth){
  const party=mkAutoParty();
  for(const ch of party){ch.simSlots=ch.baseSlots=charSlots(ch).reduce((a,b)=>a+b,0);ch.turnUsed=false;}
  const state={potions:2,rations:3,xp:0,rests:0};
  for(let depth=1;depth<=maxDepth;depth++){
    state.rests=0;
    const haul=equipFromFloor(party,depth);
    state.potions+=haul.potions;state.rations+=haul.rations;
    G.depth=depth;
    const L=genLevel(depth);
    const packs=packsOf(L);
    // bosses last, everything else in the order it is met
    packs.sort((a,b)=>(a.some(m=>m.boss)?1:0)-(b.some(m=>m.boss)?1:0));
    // a crypt floor invites the party to open coffins: about seven of them,
    // a fifth of which put something awake in the room
    if(L.theme.name==='Crypt'){
      const coffins=(L.crypts||[]).reduce((n,c)=>n+(c.kind==='sarcophagus'?1:(c.kind==='stacked'?2:0)),0);
      for(let k=0;k<coffins;k++){
        const r=Math.random();
        if(r<0.20){
          // a coffin holds a corpse: strictly undead, as openCoffin now does
          const und=spawnPool(depth).filter(([kk])=>MONSTERS[kk].type==='undead');
          const m=mkMonster(pickWeighted(und.length?und:[['skeleton',1]]),1,1,depth);
          if(!fightPack(party,[m],state))return depth;
        }else if(r<0.45)state.potions+=Math.random()<0.2?1:0;
      }
      if(L.ossuary){ // the keeper, then the hoard
        const g=L.monsters.find(m=>m.ossuary);
        if(g&&!fightPack(party,[g],state))return depth;
      }
    }
    // a cave's ambushers are fought one at a time. The rogue's take-10 beats the
    // spot DC at any depth, so while one is alive the party opens these fights;
    // once the rogue is down, every ambush lands a free blow first.
    for(const l of (L.lurkers||[])){
      const m=mkMonster(l.key,1,1,depth);
      if(Math.random()<eliteChance(depth))makeElite(m,pick(ELITE_KEYS));
      const scout=party.find(c=>!c.dead&&c.hp>0&&CLASSES[c.cls].trapfind);
      if(!scout){
        const up=party.filter(c=>c.hp>0&&!c.dead);
        if(up.length){const v=pick(up);v.hp-=monsterDpr(m,v);if(v.hp<=0&&!v.dead)v.dead=true;}
      }
      if(!fightPack(party,[m],state))return depth;
    }
    for(const pack of packs){
      if(!fightPack(party,pack,state))return depth;
      // patch up between fights: the cleric's wand, a swig, a nap
      for(const ch of party){
        if(ch.dead)continue;
        if(ch.hp<ch.maxHp*0.5&&state.potions>0){state.potions--;ch.hp=Math.min(ch.maxHp,ch.hp+ch.maxHp*0.35);}
      }
      const worst=Math.min(...party.filter(ch=>!ch.dead).map(ch=>ch.hp/ch.maxHp));
      if(worst<0.35){
        const hunted=restParty(party,state,depth);
        if(hunted){
          const hp=[];
          // the camp is raided by what lives on the floor, as in the game
          for(let i=0;i<3;i++)hp.push(mkMonster(pickWeighted(typeof themedPool==='function'?themedPool(depth):spawnPool(depth)),1,1,depth));
          if(!fightPack(party,hp,state))return depth;
        }
      }
    }
    // the floor is cleared: bank the experience and move down
    for(const ch of party)if(!ch.dead)grantXp(ch,Math.round(state.xp/Math.max(1,party.filter(c=>!c.dead).length)));
    state.xp=0;
    // the dead are raised between floors about as often as a scroll turns up
    for(const ch of party)if(ch.dead&&Math.random()<0.35){ch.dead=false;ch.hp=ch.maxHp*0.5;}
    if(party.every(ch=>ch.dead))return depth;
  }
  return maxDepth+1; // survived the whole descent
}

const RUNS=+(process.argv[2]||300);
const MAXD=+(process.argv[3]||60);
const depths=[];
for(let i=0;i<RUNS;i++)depths.push(runDescent(MAXD));
depths.sort((a,b)=>a-b);
const q=(p)=>depths[Math.min(depths.length-1,Math.floor(p*depths.length))];
const survivedTo=(d)=>depths.filter(x=>x>d).length/depths.length;
console.log('runs',RUNS,'median death depth',q(0.5),' 25th',q(0.25),' 75th',q(0.75),' 10th',q(0.1),' 90th',q(0.9));
console.log('reached depth: '+[1,5,10,15,20,25,30,35,40,50].map(d=>d+':'+(survivedTo(d)*100).toFixed(0)+'%').join('  '));

global.window={addEventListener(){},innerWidth:800,innerHeight:400};
global.document={
  getElementById:()=>null,addEventListener(){},createElement:()=>({getContext:()=>null,style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){}}),
  querySelectorAll:()=>[],documentElement:{},visibilityState:'visible',
};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.navigator={};global.screen={};
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>{};
global.btoa=(s)=>Buffer.from(s,'binary').toString('base64');
global.atob=(s)=>Buffer.from(s,'base64').toString('binary');
global.Image=class{set src(v){}};
global.G={time:0};global.UI={toast(){},float(){},refreshParty(){}};global.SFX={levelup(){}};

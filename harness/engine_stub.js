const R3={monsterSprites:{},trapDecals:{},doorMeshes:{},secretMeshes:{},levelGroup:{remove(){},add(){}},shake:0,camera:{position:{x:0,y:0,z:0}},liquidFlows:[]};
function removeMonsterSprite(){}function addMonsterSprite(){}function refreshCryptFeature(){}function refreshItemSprite(){}function addTrapDecal(){}
function revealSecret(){}function openSecret(){}function animCamera(){}function snapCamera(){}
function buildLevel(){}function updateCamera(){}function updateSprites(){}function projectToScreen(){return{x:0,y:0};}
// the monster-frame cache is a GL texture cache and lives entirely in the
// engine, so the pruning startLevel does per floor is inert here
function pruneMonsterTextures(){}function prewarmMonsterFrames(){}
function fxGlowTex(){return{};}function fxArrowTex(){return{};}function fxStoneTex(){return{};}function fxFireballTex(){return{};}function fxFrostTex(){return{};}function fxHailTex(){return{};}function fxPillarTex(){return{};}function fxShardTex(){return{};}function fxMistTex(){return{};}function fxFireDiskTex(){return{};}function fxFlameTex(){return{};}function fxPhantomTex(){return{};}function fxWebTex(){return{};}
function boltShaderInit(){return null;}
function fireFanInit(){return null;}   // no GL in node: the bolt falls back to its canvas strokes
// fire materials: node has no GL, so these are inert stand-ins for the sprites
function fireDiskMat(){return{uniforms:{uTime:{value:0},uLife:{value:0},uSeed:{value:0},uGain:{value:1}}};}
function fireBallMat(){return fireDiskMat();}
function fireTongueMat(){return fireDiskMat();}
function firePillarMat(){return fireDiskMat();}
function refreshMenu(){}
function addLurkerMesh(){}function removeLurkerMesh(){}
const THREE={Sprite:function(){this.scale={set(){}};this.position={set(){}};this.userData={};this.material={};},SpriteMaterial:function(){},Mesh:function(){this.scale={set(){}};this.position={set(){}};this.rotation={x:0,y:0,z:0};this.userData={};this.material={};},PlaneGeometry:function(){},MeshBasicMaterial:function(){},AdditiveBlending:2,NormalBlending:1,BufferGeometry:function(){this.setAttribute=()=>{};this.setIndex=()=>{};},BufferAttribute:function(){},CylinderGeometry:function(){},DoubleSide:2};
const EYE=0.62;

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const $ = (selector) => document.querySelector(selector);
const SAVE_KEY = 'sniper-ops-v4-save';

const MISSIONS = [
  {id:'range',tier:'V1',type:'TRAINING',name:'ZERO THE RANGE',map:'PINE VALLEY',brief:'Stationary steel targets. Learn movement, scope control, firing and scoring.',objective:'Hit 8 steel targets',goal:8,wind:0,xp:240,credits:300},
  {id:'ballistics',tier:'V2',type:'BALLISTICS',name:'LONGSHOT PROTOCOL',map:'RED CANYON',brief:'Read the wind and dial the optic for long-range targets across the canyon.',objective:'Hit 6 long-range targets',goal:6,wind:5.2,xp:420,credits:550},
  {id:'stealth',tier:'V3',type:'AI MISSION',name:'SILENT WATCH',map:'BLACKWOOD',brief:'Track hostile patrols, manage detection and eliminate the cell quietly.',objective:'Eliminate 4 patrols',goal:4,wind:2.4,xp:650,credits:850},
  {id:'citadel',tier:'V4',type:'FULL OPERATION',name:'BROKEN CITADEL',map:'KARST FACILITY',brief:'Disable the relay and clear the command unit in a full combat operation.',objective:'Disable relay and clear 5 hostiles',goal:5,wind:-3.7,xp:1000,credits:1400}
];

const WEAPONS = [
  {id:'r700',name:'R700 SCOUT',caliber:'.308',level:1,damage:74,velocity:790,stability:72,mag:5,reserve:25,cycle:.72,color:0x303934},
  {id:'m24',name:'M24 PHANTOM',caliber:'.300 WM',level:2,damage:88,velocity:900,stability:81,mag:6,reserve:30,cycle:.64,color:0x444a3d},
  {id:'aw50',name:'AW50 TITAN',caliber:'.50 BMG',level:4,damage:100,velocity:980,stability:62,mag:5,reserve:20,cycle:.92,color:0x252a2b}
];

const DEFAULT_SAVE = {xp:0,level:1,credits:0,selectedWeapon:'r700',completed:{},bestScores:{}};
let save = loadSave();
let selectedMission = MISSIONS[0];
let selectedWeapon = WEAPONS.find(w=>w.id===save.selectedWeapon) || WEAPONS[0];

function loadSave(){
  try{return {...DEFAULT_SAVE,...JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')};}
  catch{return {...DEFAULT_SAVE};}
}
function persist(){localStorage.setItem(SAVE_KEY,JSON.stringify(save));}
function levelFromXp(xp){return Math.min(10,Math.floor(xp/500)+1);}
function xpInLevel(xp){return xp%500;}

function renderMenu(){
  save.level=levelFromXp(save.xp);
  $('#profileLevel').textContent=`LVL ${save.level}`;
  $('#profileXp').textContent=`${xpInLevel(save.xp)} / 500 XP`;
  $('#profileCredits').textContent=`¤ ${save.credits.toLocaleString()}`;
  $('#xpFill').style.width=`${xpInLevel(save.xp)/5}%`;
  $('#missionList').innerHTML='';
  MISSIONS.forEach((mission,index)=>{
    const button=document.createElement('button');
    button.className=`mission-card${mission.id===selectedMission.id?' selected':''}`;
    const best=save.bestScores[mission.id]||0;
    button.innerHTML=`<span class="mission-number">0${index+1}</span><span class="mission-copy"><small>${mission.tier} // ${mission.type}</small><b>${mission.name}</b><p>${mission.brief}</p></span><span class="mission-meta"><b>${save.completed[mission.id]?'✓ COMPLETE':mission.map}</b><small>BEST ${best.toString().padStart(6,'0')}</small></span>`;
    button.onclick=()=>{selectedMission=mission;renderMenu();};
    $('#missionList').append(button);
  });
  $('#weaponList').innerHTML='';
  WEAPONS.forEach(weapon=>{
    const locked=save.level<weapon.level;
    const button=document.createElement('button');
    button.className=`weapon-card${weapon.id===selectedWeapon.id?' selected':''}${locked?' locked':''}`;
    button.innerHTML=`<span><b>${weapon.name}</b><small>${weapon.caliber} · ${weapon.mag} ROUND MAG</small></span><em>${locked?`LVL ${weapon.level}`:'EQUIP'}</em>`;
    button.onclick=()=>{if(!locked){selectedWeapon=weapon;save.selectedWeapon=weapon.id;persist();renderMenu();}};
    $('#weaponList').append(button);
  });
  $('#damageStat').style.setProperty('--value',`${selectedWeapon.damage}%`);
  $('#velocityStat').style.setProperty('--value',`${selectedWeapon.velocity/10}%`);
  $('#stabilityStat').style.setProperty('--value',`${selectedWeapon.stability}%`);
}

class SniperGame{
  constructor(){
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.08,1400);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label','3D sniper simulation');
    $('#game').prepend(this.renderer.domElement);
    this.clock=new THREE.Clock();
    this.world=new THREE.Group(); this.scene.add(this.world);
    this.entities=[];this.hitboxes=[];this.bullets=[];this.effects=[];
    this.keys={};this.running=false;this.paused=false;this.finished=false;
    this.scoped=false;this.steady=false;this.pointerFallback=false;this.lastMouse=null;this.yaw=0;this.pitch=-.025;this.swayTime=0;this.recoil=0;
    this.mag=5;this.reserve=25;this.reloading=false;this.lastShot=-99;
    this.score=0;this.shots=0;this.hits=0;this.progress=0;this.relayDestroyed=false;
    this.detection=0;this.health=100;this.wind=0;this.elevation=0;this.windage=0;
    this.audio=null;
    this.raycaster=new THREE.Raycaster();
    this.buildLights();this.buildWeapon();this.bindEvents();
    this.animate();
  }

  buildLights(){
    this.hemi=new THREE.HemisphereLight(0xdbe9ea,0x283126,1.35);this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xfff2d8,2.35);this.sun.position.set(-70,100,40);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-120,right:120,top:120,bottom:-120,far:420});this.scene.add(this.sun);
  }

  buildWeapon(){
    this.gun=new THREE.Group();
    const metal=new THREE.MeshStandardMaterial({color:0x272d2b,metalness:.75,roughness:.32});
    const stock=new THREE.MeshStandardMaterial({color:0x3e3327,roughness:.8});
    const body=new THREE.Mesh(new THREE.BoxGeometry(.17,.15,1.15),metal);body.position.set(.38,-.35,-.9);this.gun.add(body);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,1.25,10),metal);barrel.rotation.x=Math.PI/2;barrel.position.set(.38,-.29,-1.85);this.gun.add(barrel);
    const butt=new THREE.Mesh(new THREE.BoxGeometry(.23,.24,.64),stock);butt.rotation.x=-.13;butt.position.set(.38,-.39,-.22);this.gun.add(butt);
    const optic=new THREE.Mesh(new THREE.CylinderGeometry(.052,.052,.48,12),metal);optic.rotation.x=Math.PI/2;optic.position.set(.38,-.16,-.93);this.gun.add(optic);
    this.camera.add(this.gun);this.scene.add(this.camera);
  }

  bindEvents(){
    addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight)});
    addEventListener('keydown',event=>{
      this.keys[event.code]=true;
      if(!this.running)return;
      if(event.code==='KeyR')this.reload();
      if(event.code==='Escape'){
        if(this.paused)this.resume();
        else if(document.pointerLockElement!==this.renderer.domElement)this.pause();
      }
      if(event.code==='ArrowUp')this.adjustOptic('elevation',.2);
      if(event.code==='ArrowDown')this.adjustOptic('elevation',-.2);
      if(event.code==='ArrowLeft')this.adjustOptic('windage',-.2);
      if(event.code==='ArrowRight')this.adjustOptic('windage',.2);
    });
    addEventListener('keyup',event=>this.keys[event.code]=false);
    addEventListener('mousemove',event=>{
      if(!this.running||this.paused||(document.pointerLockElement!==this.renderer.domElement&&!this.pointerFallback))return;
      const sensitivity=this.scoped?.00062:.00175;
      let dx=event.movementX,dy=event.movementY;
      if(this.pointerFallback){
        if(!this.lastMouse){this.lastMouse={x:event.clientX,y:event.clientY};return}
        dx=event.clientX-this.lastMouse.x;dy=event.clientY-this.lastMouse.y;this.lastMouse={x:event.clientX,y:event.clientY};
      }
      this.yaw-=dx*sensitivity;this.pitch-=dy*sensitivity;
      this.pitch=THREE.MathUtils.clamp(this.pitch,-1.28,1.28);
    });
    addEventListener('contextmenu',event=>event.preventDefault());
    addEventListener('mousedown',event=>{
      if(!this.running||this.paused||this.finished)return;
      if(document.pointerLockElement!==this.renderer.domElement&&!this.pointerFallback){this.lockPointer();return;}
      if(event.button===0)this.fire();
      if(event.button===2)this.setScope(true);
    });
    addEventListener('mouseup',event=>{if(event.button===2)this.setScope(false)});
    document.addEventListener('pointerlockchange',()=>{
      if(this.running&&!this.finished&&!this.pointerFallback&&document.pointerLockElement!==this.renderer.domElement&&!this.paused)this.pause();
    });
    $('#resumeBtn').onclick=()=>this.resume();
    $('#restartBtn').onclick=()=>this.start(this.mission,this.weapon);
    $('#menuBtn').onclick=()=>this.exitToMenu();
    $('#continueBtn').onclick=()=>this.exitToMenu();
    $('#retryBtn').onclick=()=>this.start(this.mission,this.weapon);
  }

  start(mission,weapon){
    this.mission=mission;this.weapon=weapon;
    this.running=true;this.paused=false;this.finished=false;this.scoped=false;this.pointerFallback=false;this.lastMouse=null;
    this.score=0;this.shots=0;this.hits=0;this.progress=0;this.relayDestroyed=false;this.health=100;this.detection=0;
    this.mag=weapon.mag;this.reserve=weapon.reserve;this.reloading=false;this.lastShot=-99;
    this.wind=mission.wind+(mission.id==='ballistics'?(Math.random()-.5)*1.4:0);this.elevation=0;this.windage=0;
    this.yaw=0;this.pitch=-.025;this.camera.position.set(0,1.72,8);
    this.clearWorld();this.configureMap();this.updateHUD();
    $('#menu').classList.add('hidden');$('#game').classList.remove('hidden');$('#pause').classList.add('hidden');$('#debrief').classList.add('hidden');
    $('#detection').classList.toggle('hidden',mission.tier!=='V3'&&mission.tier!=='V4');
    this.setScope(false);this.flash(`OPERATION ${mission.name}`,1500);this.clock.getDelta();this.lockPointer();
  }

  clearWorld(){
    for(const bullet of this.bullets)this.scene.remove(bullet.mesh);
    this.bullets=[];this.entities=[];this.hitboxes=[];this.effects=[];
    while(this.world.children.length){const child=this.world.children.pop();child.traverse?.(o=>{o.geometry?.dispose();if(o.material&&!Array.isArray(o.material))o.material.dispose?.()})}
  }

  configureMap(){
    const configs={
      range:{sky:0xa9c4ca,fog:0xa9c4ca,ground:0x52684b,sun:2.35,near:180,far:580},
      ballistics:{sky:0xb87853,fog:0xb87853,ground:0x7a5136,sun:2.7,near:260,far:850},
      stealth:{sky:0x0d1a20,fog:0x0d1a20,ground:0x1c2b25,sun:.35,near:55,far:240},
      citadel:{sky:0x58656a,fog:0x58656a,ground:0x343b38,sun:1.15,near:120,far:520}
    };
    const c=configs[this.mission.id];this.scene.background=new THREE.Color(c.sky);this.scene.fog=new THREE.Fog(c.fog,c.near,c.far);this.sun.intensity=c.sun;
    this.hemi.intensity=this.mission.id==='stealth'?.48:1.35;
    const ground=this.mesh(new THREE.PlaneGeometry(900,1200),new THREE.MeshStandardMaterial({color:c.ground,roughness:1}),0,0,-420);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
    if(this.mission.id==='range')this.buildRange();
    if(this.mission.id==='ballistics')this.buildCanyon();
    if(this.mission.id==='stealth')this.buildForest();
    if(this.mission.id==='citadel')this.buildCitadel();
  }

  mesh(geometry,material,x=0,y=0,z=0,parent=this.world){const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
  box(x,y,z,sx,sy,sz,color,parent=this.world){return this.mesh(new THREE.BoxGeometry(sx,sy,sz),new THREE.MeshStandardMaterial({color,roughness:.82}),x,y,z,parent)}

  buildRange(){
    const lane=this.mesh(new THREE.PlaneGeometry(15,540),new THREE.MeshStandardMaterial({color:0x696458,roughness:1}),0,.012,-255);lane.rotation.x=-Math.PI/2;
    this.box(0,.92,4,5,.18,1.2,0x34383a);this.box(-2.3,1.25,4,.18,2.5,.18,0x34383a);this.box(2.3,1.25,4,.18,2.5,.18,0x34383a);
    for(let z=0;z>-520;z-=22){this.box(-10,.65,z,1.2,1.3,7,0x4b514a);this.box(10,.65,z,1.2,1.3,7,0x4b514a)}
    for(let i=0;i<46;i++)this.tree((Math.random()<.5?-1:1)*(15+Math.random()*80),-25-Math.random()*500,2+Math.random()*5,0x36503a);
    [50,80,110,150,200,260,330,420].forEach((d,i)=>this.createSteelTarget((i%2?-1:1)*(2+(i%3)*1.2),-d+8,d));
  }

  buildCanyon(){
    const path=this.mesh(new THREE.PlaneGeometry(18,740),new THREE.MeshStandardMaterial({color:0x8e684a,roughness:1}),0,.015,-350);path.rotation.x=-Math.PI/2;
    for(let z=-20;z>-760;z-=24){const width=9+Math.sin(z*.023)*4;this.box(-width-10,4+Math.random()*4,z,18,8+Math.random()*8,22,0x75442e);this.box(width+10,4+Math.random()*5,z,18,9+Math.random()*9,22,0x68402e)}
    [140,220,310,410,540,680].forEach((d,i)=>{this.createSteelTarget((i%2?-1:1)*(2.5+(i%3)*1.7),-d+8,d,true);this.box((i%2?-1:1)*6,.6,-d,2,1.2,2,0x5c3b2c)});
  }

  buildForest(){
    this.camera.position.set(0,1.72,10);
    for(let i=0;i<100;i++){const x=(Math.random()-.5)*170,z=-10-Math.random()*260;if(Math.abs(x)<6&&z>-70)continue;this.tree(x,z,2.5+Math.random()*6,0x20392b)}
    const moon=new THREE.PointLight(0x7bb8df,18,90);moon.position.set(-25,30,-80);this.world.add(moon);
    const routes=[[[-20,-70],[18,-90]],[[22,-120],[-15,-145]],[[-28,-175],[12,-195]],[[18,-225],[-20,-245]]];
    routes.forEach((route,i)=>this.createNPC(route[0],route[1],i,false));
  }

  buildCitadel(){
    const road=this.mesh(new THREE.PlaneGeometry(22,500),new THREE.MeshStandardMaterial({color:0x4a4e4b,roughness:.95}),0,.018,-240);road.rotation.x=-Math.PI/2;
    for(let i=0;i<18;i++){const side=i%2?-1:1;const z=-35-i*26;this.box(side*(15+Math.random()*5),4,z,18,8,18,i%3?0x4a5352:0x5a5147);this.box(side*6,.8,z,3,1.6,2.5,0x3e4744)}
    const tower=this.box(0,6,-300,15,12,10,0x3b4646);tower.material.metalness=.25;
    this.createRelay(0,-292);
    const routes=[[[-8,-70],[8,-105]],[[15,-125],[-12,-145]],[[-18,-185],[14,-205]],[[8,-240],[-14,-260]],[[-8,-320],[12,-345]]];
    routes.forEach((route,i)=>this.createNPC(route[0],route[1],i,i===4));
  }

  tree(x,z,h,color){
    const trunk=this.box(x,h*.2,z,.32,h*.4,.32,0x594735);
    const crown=this.mesh(new THREE.ConeGeometry(1.25+h*.16,h*.75,7),new THREE.MeshStandardMaterial({color,roughness:1}),x,h*.64,z);return {trunk,crown};
  }

  createSteelTarget(x,z,dist,longRange=false){
    const group=new THREE.Group();group.position.set(x,0,z);this.world.add(group);
    const standMat=new THREE.MeshStandardMaterial({color:0x353a38,metalness:.45,roughness:.5});
    this.mesh(new THREE.BoxGeometry(.12,1.6,.12),standMat,0,.8,0,group);this.mesh(new THREE.BoxGeometry(1.3,.12,.65),standMat,0,.07,0,group);
    const plateMat=new THREE.MeshStandardMaterial({color:longRange?0xe4d0b0:0xd8d8cc,metalness:.68,roughness:.32,emissive:0x000000});
    const plate=this.mesh(new THREE.CylinderGeometry(.58,.58,.10,24),plateMat,0,1.72,0,group);plate.rotation.x=Math.PI/2;
    const head=this.mesh(new THREE.SphereGeometry(.2,16,12),plateMat,0,2.35,0,group);
    const entity={type:'target',group,plate,head,alive:true,dist,respawn:true};plate.userData={entity,part:'body'};head.userData={entity,part:'head'};this.hitboxes.push(plate,head);this.entities.push(entity);
  }

  createNPC(a,b,index,commander){
    const group=new THREE.Group();group.position.set(a[0],0,a[1]);this.world.add(group);
    const uniform=new THREE.MeshStandardMaterial({color:commander?0x6a2222:0x263c34,roughness:.75});
    const skin=new THREE.MeshStandardMaterial({color:0xb58468,roughness:.8});
    const legs=this.mesh(new THREE.BoxGeometry(.48,.85,.34),uniform,0,.48,0,group);
    const body=this.mesh(new THREE.BoxGeometry(.62,.88,.4),uniform,0,1.31,0,group);
    const head=this.mesh(new THREE.SphereGeometry(.23,14,10),skin,0,1.96,0,group);
    const gun=this.mesh(new THREE.BoxGeometry(.08,.08,.9),new THREE.MeshStandardMaterial({color:0x171b1a,metalness:.6}),.35,1.35,.2,group);gun.rotation.x=Math.PI/2;
    const entity={type:'npc',group,body,head,legs,alive:true,a:new THREE.Vector3(a[0],0,a[1]),b:new THREE.Vector3(b[0],0,b[1]),toB:true,speed:1.1+Math.random()*.7,alert:0,lastFire:0,commander};
    body.userData={entity,part:'body'};head.userData={entity,part:'head'};legs.userData={entity,part:'limb'};this.hitboxes.push(body,head,legs);this.entities.push(entity);
  }

  createRelay(x,z){
    const group=new THREE.Group();group.position.set(x,0,z);this.world.add(group);
    this.mesh(new THREE.BoxGeometry(2.3,.35,2.3),new THREE.MeshStandardMaterial({color:0x252c2c,metalness:.4}),0,.2,0,group);
    const relay=this.mesh(new THREE.BoxGeometry(1.2,2.8,1.0),new THREE.MeshStandardMaterial({color:0x3b4545,metalness:.5,roughness:.4,emissive:0x240000}),0,1.75,0,group);
    const light=this.mesh(new THREE.SphereGeometry(.12,12,8),new THREE.MeshStandardMaterial({color:0xff3322,emissive:0xff1100,emissiveIntensity:3}),0,2.4,.52,group);
    const entity={type:'relay',group,relay,alive:true};relay.userData={entity,part:'objective'};light.userData={entity,part:'objective'};this.hitboxes.push(relay,light);this.entities.push(entity);
  }

  adjustOptic(axis,amount){
    if(!this.scoped)return;
    this[axis]=THREE.MathUtils.clamp(Number((this[axis]+amount).toFixed(1)),-8,8);this.updateHUD();this.sound('click');
  }

  lockPointer(){
    const fallback=()=>{this.pointerFallback=true;this.flash('MOUSE LOOK FALLBACK ACTIVE',1600)};
    try{const request=this.renderer.domElement.requestPointerLock();request?.catch?.(fallback);}
    catch{fallback()}
  }

  setScope(value){
    this.scoped=value;$('#scopeOverlay').style.display=value?'block':'none';$('#crosshair').style.display=value?'none':'block';this.camera.fov=value?12:68;this.camera.updateProjectionMatrix();this.gun.visible=!value;
  }

  reload(){
    if(this.reloading||this.mag===this.weapon.mag||this.reserve===0)return;
    this.reloading=true;this.flash('RELOADING',1200);this.sound('reload');
    setTimeout(()=>{if(!this.running)return;const take=Math.min(this.weapon.mag-this.mag,this.reserve);this.mag+=take;this.reserve-=take;this.reloading=false;this.updateHUD()},1200);
  }

  fire(){
    const now=performance.now()/1000;if(now-this.lastShot<this.weapon.cycle||this.reloading)return;
    if(this.mag<=0){this.flash('MAGAZINE EMPTY — PRESS R');this.sound('empty');return}
    this.lastShot=now;this.mag--;this.shots++;this.recoil=.026;this.sound('shot');
    if(this.mission.tier==='V3'||this.mission.tier==='V4')this.detection=Math.min(100,this.detection+18);
    const origin=this.camera.getWorldPosition(new THREE.Vector3());
    const direction=this.camera.getWorldDirection(new THREE.Vector3());
    direction.y+=this.elevation/1000;direction.x+=this.windage/1000;
    const stability=(this.weapon.stability/100)*(this.steady?1.8:1)*(this.scoped?1.5:.6);
    const spread=.0032/Math.max(.45,stability);direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.normalize();
    const tracer=this.mesh(new THREE.SphereGeometry(.028,6,4),new THREE.MeshBasicMaterial({color:0xffe49a}),origin.x,origin.y,origin.z,this.scene);
    const bullet={mesh:tracer,pos:origin.clone(),velocity:direction.multiplyScalar(this.weapon.velocity),life:0};this.bullets.push(bullet);this.updateHUD();
    if(this.mag===0&&this.reserve>0)setTimeout(()=>this.flash('PRESS R TO RELOAD'),250);
  }

  updateBullets(dt){
    const gravity=this.mission.tier==='V1'?0:-9.81;
    for(let i=this.bullets.length-1;i>=0;i--){
      const bullet=this.bullets[i];bullet.life+=dt;let remaining=dt;let hit=null;
      while(remaining>0&&!hit){
        const step=Math.min(remaining,.012);remaining-=step;
        const old=bullet.pos.clone();bullet.velocity.y+=gravity*step;bullet.velocity.x+=this.wind*.11*step;
        const next=old.clone().addScaledVector(bullet.velocity,step);const delta=next.clone().sub(old);const distance=delta.length();
        this.raycaster.set(old,delta.normalize());this.raycaster.far=distance;
        hit=this.raycaster.intersectObjects(this.hitboxes.filter(object=>object.userData.entity?.alive),false)[0];
        bullet.pos.copy(hit?.point||next);
      }
      bullet.mesh.position.copy(bullet.pos);
      if(hit){this.resolveHit(hit.object,hit.point);this.removeBullet(i)}
      else if(bullet.life>2.2||bullet.pos.y<0||bullet.pos.length()>1200)this.removeBullet(i);
    }
  }

  removeBullet(index){const [bullet]=this.bullets.splice(index,1);this.scene.remove(bullet.mesh);bullet.mesh.geometry.dispose();bullet.mesh.material.dispose()}

  resolveHit(object,point){
    const {entity,part}=object.userData;if(!entity||!entity.alive)return;
    if(entity.type==='target'){
      entity.alive=false;this.hits++;this.progress++;const points=Math.round((part==='head'?250:100)*(1+entity.dist/300));this.score+=points;this.hitFeedback(part==='head'?`BULLSEYE +${points}`:`IMPACT +${points}`);
      entity.group.rotation.z=.92;setTimeout(()=>{entity.group.visible=false;if(!this.finished&&this.progress<this.mission.goal)setTimeout(()=>{entity.alive=true;entity.group.visible=true;entity.group.rotation.z=0},900)},240);
    }else if(entity.type==='npc'){
      entity.alive=false;this.hits++;this.progress++;const points=(part==='head'?500:250)+(entity.commander?500:0);this.score+=points;this.hitFeedback(part==='head'?`HEADSHOT +${points}`:`HOSTILE DOWN +${points}`);
      entity.group.rotation.z=1.45;entity.group.position.y=.25;this.detection=Math.max(0,this.detection-12);
    }else if(entity.type==='relay'){
      entity.alive=false;this.relayDestroyed=true;this.hits++;this.score+=750;this.hitFeedback('RELAY DISABLED +750');entity.relay.material.emissive.setHex(0x000000);entity.group.rotation.z=.16;
    }
    this.spawnImpact(point);this.updateHUD();this.checkObjectives();
  }

  spawnImpact(point){
    const ring=this.mesh(new THREE.RingGeometry(.04,.11,12),new THREE.MeshBasicMaterial({color:0xfff0b0,transparent:true,side:THREE.DoubleSide}),point.x,point.y,point.z,this.scene);ring.lookAt(this.camera.position);this.effects.push({mesh:ring,life:.3,max:.3});
  }

  hitFeedback(text){$('#hitmarker').style.display='block';setTimeout(()=>$('#hitmarker').style.display='none',100);this.flash(text);this.sound('hit')}

  updateAI(dt){
    if(this.mission.tier!=='V3'&&this.mission.tier!=='V4')return;
    const player=this.camera.position;let visibleThreat=0;
    for(const npc of this.entities.filter(e=>e.type==='npc'&&e.alive)){
      const target=npc.toB?npc.b:npc.a;const direction=target.clone().sub(npc.group.position);direction.y=0;
      if(direction.length()<1.1)npc.toB=!npc.toB;else{direction.normalize();npc.group.position.addScaledVector(direction,npc.speed*dt);npc.group.rotation.y=Math.atan2(direction.x,direction.z)}
      const toPlayer=player.clone().sub(npc.group.position);const distance=toPlayer.length();const forward=new THREE.Vector3(Math.sin(npc.group.rotation.y),0,Math.cos(npc.group.rotation.y));const facing=forward.dot(toPlayer.clone().setY(0).normalize());
      if(distance<85&&facing>.1){const visibility=(85-distance)/85*(this.steady?.55:1);visibleThreat=Math.max(visibleThreat,visibility);npc.alert=Math.min(100,npc.alert+dt*visibility*42)}else npc.alert=Math.max(0,npc.alert-dt*18);
      if(this.detection>65)npc.alert=Math.max(npc.alert,this.detection);
      if(npc.alert>70){npc.group.lookAt(player.x,npc.group.position.y,player.z);const now=performance.now()/1000;if(distance<115&&now-npc.lastFire>1.2+Math.random()){npc.lastFire=now;this.enemyFire(distance)}}
    }
    this.detection=THREE.MathUtils.clamp(this.detection+(visibleThreat>.08?visibleThreat*dt*18:-dt*4),0,100);
    $('#detectionFill').style.width=`${this.detection}%`;$('#detection').classList.toggle('alert',this.detection>70);
  }

  enemyFire(distance){
    const chance=Math.max(.12,.68-distance/180);if(Math.random()<chance){this.health-=12;$('#damageVignette').style.opacity='.75';setTimeout(()=>$('#damageVignette').style.opacity='0',180);this.sound('damage');this.flash(`TAKING FIRE — HEALTH ${Math.max(0,this.health)}%`);if(this.health<=0)this.finish(false)}
  }

  checkObjectives(){
    if(this.mission.id==='citadel'){if(this.progress>=this.mission.goal&&this.relayDestroyed)this.finish(true)}
    else if(this.progress>=this.mission.goal)this.finish(true);
  }

  finish(success){
    if(this.finished)return;this.finished=true;this.setScope(false);document.exitPointerLock?.();
    const accuracy=this.shots?Math.round(this.hits/this.shots*100):0;
    const xp=success?this.mission.xp+Math.round(accuracy*2):50;const credits=success?this.mission.credits+Math.round(this.score*.08):0;
    if(success){save.xp+=xp;save.credits+=credits;save.level=levelFromXp(save.xp);save.completed[this.mission.id]=true;save.bestScores[this.mission.id]=Math.max(save.bestScores[this.mission.id]||0,this.score);persist()}
    $('#debriefLabel').textContent=success?'OPERATION COMPLETE':'OPERATION FAILED';$('#debriefTitle').textContent=success?'MISSION ACCOMPLISHED':'OPERATOR DOWN';
    $('#finalScore').textContent=this.score.toLocaleString();$('#finalAccuracy').textContent=`${accuracy}%`;$('#finalXp').textContent=`+${xp}`;$('#finalCredits').textContent=`+${credits}`;$('#debrief').classList.remove('hidden');
  }

  pause(){if(this.finished)return;this.paused=true;this.setScope(false);$('#pauseTitle').textContent=this.mission.name;$('#pause').classList.remove('hidden')}
  resume(){this.paused=false;$('#pause').classList.add('hidden');this.clock.getDelta();this.lockPointer()}
  exitToMenu(){this.running=false;this.paused=false;this.finished=false;this.setScope(false);document.exitPointerLock?.();this.clearWorld();$('#game').classList.add('hidden');$('#pause').classList.add('hidden');$('#debrief').classList.add('hidden');$('#menu').classList.remove('hidden');renderMenu()}

  nearestRange(){
    const direction=this.camera.getWorldDirection(new THREE.Vector3());let best=Infinity;
    for(const entity of this.entities){if(!entity.alive)continue;const position=entity.group.getWorldPosition(new THREE.Vector3());const offset=position.sub(this.camera.position);const distance=offset.length();if(direction.dot(offset.normalize())>.975&&distance<best)best=distance}
    return best;
  }

  updateHUD(){
    if(!this.mission)return;
    const range=this.nearestRange();$('#missionTier').textContent=`${this.mission.tier} // ${this.mission.type}`;$('#missionName').textContent=this.mission.name;$('#objectiveText').textContent=this.mission.objective;
    $('#windReadout').textContent=`${Math.abs(this.wind).toFixed(1)} m/s ${this.wind>=0?'→':'←'}`;$('#rangeReadout').textContent=range<Infinity?`${Math.round(range)} m`:'--- m';$('#scopeRange').textContent=range<Infinity?`RNG ${Math.round(range)} M`:'RNG ---';
    $('#elevationReadout').textContent=`${this.elevation.toFixed(1)} MIL`;$('#windageReadout').textContent=`${this.windage.toFixed(1)} MIL`;$('#weaponName').textContent=this.weapon.name;$('#magCount').textContent=this.mag;$('#reserveCount').textContent=this.reserve;$('#scoreReadout').textContent=`SCORE ${this.score.toString().padStart(6,'0')}`;
    const rows=[];rows.push(`<div class="${this.progress>=this.mission.goal?'done':''}">${this.mission.id==='stealth'?'PATROLS':'TARGETS'} <b>${Math.min(this.progress,this.mission.goal)} / ${this.mission.goal}</b></div>`);if(this.mission.id==='citadel')rows.push(`<div class="${this.relayDestroyed?'done':''}">DISABLE RELAY <b>${this.relayDestroyed?'DONE':'ACTIVE'}</b></div>`);if(this.mission.tier==='V3')rows.push(`<div>STEALTH <b>${Math.round(100-this.detection)}%</b></div>`);if(this.mission.tier==='V4')rows.push(`<div>HEALTH <b>${this.health}%</b></div>`);$('#objectiveTracker').innerHTML=rows.join('');
  }

  flash(text,time=900){$('#message').textContent=text;clearTimeout(this.messageTimer);this.messageTimer=setTimeout(()=>$('#message').textContent='',time)}

  sound(type){
    try{
      this.audio ||= new AudioContext();const oscillator=this.audio.createOscillator(),gain=this.audio.createGain();oscillator.connect(gain);gain.connect(this.audio.destination);const now=this.audio.currentTime;
      const settings={shot:[85,.12,.14,'sawtooth'],hit:[720,.06,.06,'sine'],click:[1100,.025,.025,'square'],empty:[180,.04,.05,'square'],reload:[240,.06,.08,'triangle'],damage:[55,.15,.16,'sawtooth']}[type];
      oscillator.type=settings[3];oscillator.frequency.setValueAtTime(settings[0],now);oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,settings[0]*.55),now+settings[1]);gain.gain.setValueAtTime(settings[2],now);gain.gain.exponentialRampToValueAtTime(.001,now+settings[1]);oscillator.start(now);oscillator.stop(now+settings[1]);
    }catch{}
  }

  animate(){
    requestAnimationFrame(()=>this.animate());const dt=Math.min(this.clock.getDelta(),.033);
    if(this.running&&!this.paused&&!this.finished){
      this.steady=!!this.keys.ShiftLeft||!!this.keys.ShiftRight;this.swayTime+=dt*(this.steady?.38:1);
      const move=new THREE.Vector3((this.keys.KeyD?1:0)-(this.keys.KeyA?1:0),0,(this.keys.KeyS?1:0)-(this.keys.KeyW?1:0));
      if(move.lengthSq()){move.normalize();const speed=dt*(this.steady?2.1:5.2),sin=Math.sin(this.yaw),cos=Math.cos(this.yaw);this.camera.position.x=THREE.MathUtils.clamp(this.camera.position.x+(move.x*cos-move.z*sin)*speed,-8,8);this.camera.position.z=THREE.MathUtils.clamp(this.camera.position.z+(move.x*sin+move.z*cos)*speed,-4,12)}
      const sway=this.scoped?(this.steady?.00028:.0013):.0011;this.recoil*=Math.pow(.002,dt);this.camera.rotation.order='YXZ';this.camera.rotation.y=this.yaw+Math.sin(this.swayTime*2.1)*sway;this.camera.rotation.x=this.pitch+Math.sin(this.swayTime*1.4+1)*sway-this.recoil;
      this.gun.position.x=Math.sin(this.swayTime*2)*.008;this.gun.position.y=Math.abs(Math.sin(this.swayTime*4))*.005;
      this.updateBullets(dt);this.updateAI(dt);
      for(let i=this.effects.length-1;i>=0;i--){const effect=this.effects[i];effect.life-=dt;effect.mesh.material.opacity=Math.max(0,effect.life/effect.max);effect.mesh.scale.multiplyScalar(1+dt*4);if(effect.life<=0){this.scene.remove(effect.mesh);this.effects.splice(i,1)}}
      this.updateHUD();$('#stanceReadout').textContent=this.steady?'BREATH HELD':'STANDING';
    }
    this.renderer.render(this.scene,this.camera);
  }
}

let game;
try{
  game=new SniperGame();renderMenu();$('#loading').classList.add('hidden');$('#menu').classList.remove('hidden');
  $('#deployBtn').onclick=()=>game.start(selectedMission,selectedWeapon);
  $('#resetBtn').onclick=()=>{if(confirm('Reset all progression, scores and unlocks?')){save={...DEFAULT_SAVE,completed:{},bestScores:{}};selectedWeapon=WEAPONS[0];persist();renderMenu()}};
}catch(error){
  console.error(error);$('#loading').classList.add('hidden');$('#fatalError').classList.remove('hidden');$('#fatalMessage').textContent=error?.message||'WebGL is unavailable in this browser.';
}

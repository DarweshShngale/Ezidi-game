import * as T from 'three'
import R from '@dimforge/rapier3d-compat'
import {createActor,type Actor,type ActorAction} from './actors'
import {createWorld} from './world'
import {GameAudio} from './audio'
import {chapters,actionLabel,arabic,type Task} from './story'
import type {Settings} from './save'
type Hooks={complete:()=>void;failure:()=>void;notice:(s:string)=>void;pause:()=>void;bag:()=>void}
const el=<E extends HTMLElement>(id:string)=>document.getElementById(id) as E
const clamp=T.MathUtils.clamp
const rapier=R.init()
export async function buildGame(settings:Settings,audio:GameAudio,hooks:Hooks){
  await rapier
  const cast=await Promise.all([createActor('sumer'),createActor('civilian',0),createActor('companion',1),createActor('opponent'),createActor('civilian',2)])
  return new Game(cast,settings,audio,hooks)
}
export type Engine=Awaited<ReturnType<typeof buildGame>>
class Game {
  private scene=new T.Scene()
  private renderer=new T.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'})
  private camera=new T.PerspectiveCamera(57,1,.09,320)
  private terrain=createWorld(this.scene)
  private physics=new R.World({x:0,y:-15,z:0})
  private body=this.physics.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.87,14))
  private collider=this.physics.createCollider(R.ColliderDesc.capsule(.54,.29),this.body)
  private controller=this.physics.createCharacterController(.015)
  private keys=new Set<string>()
  private stick={x:0,y:0}
  private look:{id:number;x:number;y:number}|null=null
  private joy:number|null=null
  private sprintTouch=false
  private crouched=false
  private jumpSpeed=0
  private onGround=true
  private yaw=0
  private pitch=.20
  private clock=0
  private lastFrame=0
  private timer=0
  private stamina=100
  private health=100
  private chapter=0
  private step=0
  private running=false
  private pending=0
  private pose:ActorAction='idle'
  private poseTime=0
  private cine=0
  private tickHud=0
  private gait=0
  private dangerCooldown=0
  private retreat=0
  private repelled=false
  private waypoint=new T.Group()
  private landmark=new T.Group()
  private pulseMesh:T.Mesh
  private pulseAge=2
  private temp=new T.Vector3()
  private aim=new T.Vector3()
  private trail:T.Vector3[]=[]
  private quality=1
  private ratio=1
  private perfTime=0
  private frames=0
  private floorY=0
  private raf=0
  private targetP=new T.Vector3()
  private cleanup=new AbortController()
  private map=el<HTMLCanvasElement>('map').getContext('2d')!
  constructor(private cast:Actor[],private settings:Settings,private audio:GameAudio,private hooks:Hooks){
    const r=this.renderer
    r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.13
    r.shadowMap.type=T.PCFSoftShadowMap
    el('game-canvas').replaceChildren(r.domElement);r.domElement.setAttribute('aria-label','ساحة اللعب ثلاثية الأبعاد')
    for(const a of cast)this.scene.add(a.root)
    for(const b of this.terrain.colliders)this.physics.createCollider(R.ColliderDesc.cuboid(b.w/2,b.h/2,b.d/2).setTranslation(b.x,b.h/2,b.z))
    this.physics.createCollider(R.ColliderDesc.cuboid(85,.25,85).setTranslation(0,-.25,0))
    this.controller.enableAutostep(.28,.15,false);this.controller.enableSnapToGround(.25);this.physics.step()
    const ring=new T.Mesh(new T.RingGeometry(.68,.73,48),new T.MeshBasicMaterial({color:0xf2d389,side:T.DoubleSide,transparent:true,opacity:.65,depthWrite:false}))
    ring.rotation.x=-Math.PI/2;ring.position.y=.055;this.waypoint.add(ring);this.scene.add(this.waypoint,this.landmark)
    this.pulseMesh=new T.Mesh(new T.RingGeometry(.97,1,80),new T.MeshBasicMaterial({color:0xffdc98,side:T.DoubleSide,transparent:true,depthWrite:false}))
    this.pulseMesh.rotation.x=-Math.PI/2;this.scene.add(this.pulseMesh);this.pulseMesh.visible=false
    this.bind();this.configure();this.resize()
  }
  private get player(){return this.cast[0].root}
  private get task(){return chapters[this.chapter].tasks[this.step]}
  private get escort(){return this.task.kind==='escort'}
  private get danger(){return (this.chapter===3&&this.task.kind==='defend')||(this.chapter===4&&this.step===1)}
  configure(){
    const auto=matchMedia('(pointer:coarse)').matches?0:(navigator.hardwareConcurrency||4)>=8?2:1
    this.quality=this.settings.quality<0?auto:this.settings.quality
    this.ratio=Math.min(devicePixelRatio,[.85,1.05,1.5,1.85][this.quality]);this.renderer.shadowMap.enabled=this.quality>0;this.terrain.setQuality(this.quality)
    this.resize()
  }
  private resize(){const w=innerWidth,h=innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(this.ratio);this.renderer.setSize(w,h,false)}
  load(chapter:number,step:number){
    this.chapter=chapter;this.step=step;this.clock=0;this.health=100;this.stamina=100;this.yaw=0;this.pitch=.2;this.jumpSpeed=0;this.pending=0;this.poseTime=0;this.crouched=false
    const tasks=chapters[chapter].tasks, prev=tasks[step-1]
    const x=prev?.x||0,z=prev?prev.z+1:14
    this.body.setTranslation({x,y:.88,z},true);this.body.setNextKinematicTranslation({x,y:.88,z});this.physics.step();this.player.position.set(x,0,z);this.player.rotation.y=Math.PI
    this.cast[2].root.position.set(x+.8,0,z+1.5);this.trail=[]
    this.cast[4].root.position.set(-2.6,0,-4);this.cast[4].root.rotation.y=.5
    this.setTask();this.cine=this.settings.reduce?0:1.4;this.camera.position.set(x+4,3.2,z+5.4);this.updateCamera(1)
  }
  advance(step:number){this.step=step;this.setTask()}
  private setTask(){
    const t=this.task
    this.waypoint.position.set(t.x,0,t.z);this.targetP.set(t.x,2.25,t.z)
    this.cast[1].root.visible=['talk','help','escort','defend'].includes(t.kind)
    this.cast[1].root.position.set(t.x+.55,0,t.z-.3);this.cast[1].root.rotation.y=.2;this.cast[1].setAction(t.kind==='help'?'crouch':'idle')
    this.cast[2].root.visible=this.escort||[2,3,5,6].includes(this.chapter)
    this.cast[3].root.visible=this.danger;this.cast[3].root.position.set(t.x-1.5,0,t.z-2)
    this.cast[4].root.visible=this.chapter!==4;this.repelled=false;this.retreat=0;this.dangerCooldown=0
    this.buildLandmark(t);this.updateHud()
  }
  private buildLandmark(t:Task){
    this.landmark.traverse(n=>{if(n instanceof T.Mesh){n.geometry.dispose();n.material.dispose()}})
    this.landmark.clear();this.landmark.position.set(t.x,0,t.z)
    function box(group:T.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:number){
      const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.84}));m.castShadow=true;m.receiveShadow=true;m.position.set(x,y,z);group.add(m);return m
    }
    const g=this.landmark
    if(t.kind==='document'||t.kind==='supply'||(t.kind==='repair'&&this.chapter===3)){
      box(g,0,.65,0,.95,.08,.63,0x765638);for(const x of [-.4,.4])for(const z of [-.24,.24])box(g,x,.31,z,.06,.62,.06,0x674832)
      if(t.kind==='document'){const a=box(g,0,.715,0,.44,.035,.3,0xe6c99a);a.rotation.y=.2;for(let i=0;i<4;i++)box(g,-.06,.738,i*.037-.07,.2,.004,.006,0x6f6253)}
      else {box(g,0,.84,0,.55,.3,.38,t.kind==='repair'?0x414847:0x84774d);for(const x of [-.15,.15])box(g,x,1.0,0,.035,.018,.37,0xcead78)}
    }else if(t.kind==='open'||(t.kind==='repair'&&this.step===0)){
      const wood=box(g,0,1.02,-.6,.99,2,.08,0x476660);wood.name='باب';for(const x of [-.54,.54])box(g,x,1,-.63,.10,2.12,.14,0x897963);box(g,0,2.07,-.63,1.18,.1,.16,0x897963);box(g,.34,.95,-.53,.10,.05,.06,0xb19b6e)
    }else if(t.kind==='climb'){
      for(const x of [-.4,.4])box(g,x,1,-.4,.07,2.05,.07,0x76573c)
      for(let i=0;i<6;i++)box(g,0,.2+i*.31,-.4,.8,.055,.055,0x967955)
    }else if(t.kind==='repair'&&this.step===2){
      box(g,0,.48,0,.055,.9,.055,0x756140)
      for(let i=0;i<6;i++){const m=new T.Mesh(new T.IcosahedronGeometry(.2,1),new T.MeshStandardMaterial({color:0x64724a}));m.scale.set(.9,.5,.6);m.position.set(Math.sin(i)*.17,.5+i*.08,Math.cos(i)*.12);g.add(m)}
    }
  }
  resume(){this.running=true;this.lastFrame=performance.now();this.audio.setChapter(this.chapter);void this.audio.start();cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(this.frame)}
  stop(){this.running=false;cancelAnimationFrame(this.raf);this.clearInput();this.audio.pause()}
  private clearInput(){this.keys.clear();this.stick={x:0,y:0};this.look=null;this.joy=null;this.sprintTouch=false;el('stick').firstElementChild?.removeAttribute('style')}
  private bind(){
    const signal=this.cleanup.signal
    const down=(e:KeyboardEvent)=>{if(!this.running||e.ctrlKey||e.metaKey||e.altKey)return
      const code=e.code;if(['Space','KeyW','KeyS','KeyA','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab'].includes(code))e.preventDefault()
      this.keys.add(code);if(e.repeat)return
      if(code==='KeyE')this.interact();if(code==='KeyQ')this.pulse();if(code==='Space')this.jump();if(code==='KeyC')this.crouched=!this.crouched
      if(code==='Escape')this.hooks.pause();if(code==='Tab'||code==='KeyI')this.hooks.bag()
    }
    window.addEventListener('keydown',down,{signal});window.addEventListener('keyup',e=>this.keys.delete(e.code),{signal})
    window.addEventListener('resize',()=>this.resize(),{signal});window.addEventListener('blur',()=>{if(this.running)this.hooks.pause()},{signal})
    const canvas=this.renderer.domElement
    canvas.addEventListener('pointerdown',e=>{if(!this.running||this.look)return;this.look={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)},{signal})
    canvas.addEventListener('pointermove',e=>{const l=this.look;if(!l||l.id!==e.pointerId)return;this.yaw+=(e.clientX-l.x)*.005*this.settings.sensitivity;this.pitch=clamp(this.pitch+(e.clientY-l.y)*.003*this.settings.sensitivity,-.15,.85);l.x=e.clientX;l.y=e.clientY},{signal})
    canvas.addEventListener('lostpointercapture',()=>this.look=null,{signal})
    const stick=el('stick')
    const move=(e:PointerEvent)=>{if(e.pointerId!==this.joy)return;const b=stick.getBoundingClientRect();const x=(e.clientX-b.left-b.width/2)/32,y=(e.clientY-b.top-b.height/2)/32;const len=Math.max(1,Math.hypot(x,y));this.stick={x:x/len,y:-y/len};(stick.firstElementChild as HTMLElement).style.transform='translate('+this.stick.x*25+'px,'+(-this.stick.y*25)+'px)'}
    stick.addEventListener('pointerdown',e=>{this.joy=e.pointerId;stick.setPointerCapture(e.pointerId);move(e)},{signal});stick.addEventListener('pointermove',move,{signal});stick.addEventListener('lostpointercapture',()=>{this.joy=null;this.stick={x:0,y:0};(stick.firstElementChild as HTMLElement).style.transform='none'},{signal})
    for(const b of document.querySelectorAll<HTMLButtonElement>('[data-key]')){
      b.addEventListener('pointerdown',e=>{if(!this.running)return;e.preventDefault();b.setPointerCapture(e.pointerId);switch(b.dataset.key){case 'act':this.interact();break;case 'sprint':this.sprintTouch=true;break;case 'jump':this.jump();break;case 'crouch':this.crouched=!this.crouched;break;case 'pulse':this.pulse()}},{signal})
      b.addEventListener('lostpointercapture',()=>{if(b.dataset.key==='sprint')this.sprintTouch=false},{signal})
    }
    el('interact-prompt').addEventListener('click',()=>this.interact(),{signal})
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.hooks.pause();this.hooks.notice('توقّف عرض الرسوم. أعد تحميل الصفحة لاستعادة آخر نقطة حفظ.')},{signal})
  }
  private jump(){if(this.onGround&&!this.pending){this.jumpSpeed=5.8;this.onGround=false;this.crouched=false}}
  private pulse(){if(!this.running||this.pulseAge<1.4||this.stamina<12)return
    this.stamina-=12;this.pulseAge=0;this.pose='signal';this.poseTime=.6;this.pulseMesh.visible=true;this.pulseMesh.position.copy(this.player.position);this.pulseMesh.position.y+=.08;this.audio.cue('pulse')
    const enemy=this.cast[3].root
    if(enemy.visible&&enemy.position.distanceTo(this.player.position)<(this.settings.assist?8:5)){this.retreat=4;this.repelled=true;this.hooks.notice('وصل نداء المساندة')}
  }
  private dist(){const p=this.player.position;return Math.hypot(p.x-this.task.x,p.z-this.task.z)}
  interact(){
    if(!this.running||this.pending)return
    const t=this.task
    if(this.dist()>2.65){this.terrain.interact?.(this.player.position.x,this.player.position.z);this.hooks.notice('اقترب من العلامة الذهبية للتفاعل');return}
    if(this.escort&&this.cast[2].root.position.distanceTo(this.player.position)>4.5){this.hooks.notice('انتظر وصول رفيقك');return}
    if(t.kind==='defend'&&!this.repelled){this.pulse();if(!this.repelled){this.hooks.notice('انتظر اقتراب الخصم ثم أطلق النداء');return}}
    this.pending=t.kind==='climb'?1.5:.9;this.poseTime=this.pending;const actions:Partial<Record<Task['kind'],ActorAction>>={help:'help',supply:'carry',climb:'climb',defend:'signal',repair:'help'}
    this.pose=actions[t.kind]||'interact';this.audio.cue(t.kind==='open'?'creak':t.kind==='defend'?'radio':'success',t.x,t.z)
    if(this.settings.haptic)navigator.vibrate?.(30)
    this.player.rotation.y=Math.atan2(t.x-this.player.position.x,t.z-this.player.position.z)
    this.terrain.interact?.(t.x,t.z)
  }
  private frame=(now:number)=>{
    if(!this.running)return
    const elapsed=Math.max(.001,(now-this.lastFrame)/1000);this.lastFrame=now
    const dt=Math.min(.1,elapsed);this.clock+=dt
    const slices=Math.ceil(dt/(1/40));for(let i=0;i<slices;i++)this.move(dt/slices)
    this.updateActors(dt);this.updateCamera(dt);this.terrain.update(dt,this.clock,this.chapter)
    this.tickHud+=dt;if(this.tickHud>.08){this.tickHud=0;this.updateHud()}
    this.renderer.render(this.scene,this.camera)
    this.perfTime+=elapsed;this.frames++
    if(this.perfTime>2){const fps=this.frames/this.perfTime,max=Math.min(devicePixelRatio,[.85,1.05,1.5,1.85][this.quality]);const next=clamp(this.ratio+(fps<25?-.12:fps>54?.04:0),Math.min(.55,max),max);if(Math.abs(next-this.ratio)>.02){this.ratio=next;this.resize()}this.perfTime=0;this.frames=0}
    if(this.pending>0){this.pending-=dt;if(this.pending<=0){this.pending=0;this.hooks.complete()}}
    if(this.running)this.raf=requestAnimationFrame(this.frame)
  }
  private move(dt:number){
    let front=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))+this.stick.y
    let side=Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA'))+this.stick.x
    this.yaw+=(Number(this.keys.has('ArrowRight'))-Number(this.keys.has('ArrowLeft')))*dt*1.8
    if(this.pending){front=0;side=0}const length=Math.hypot(front,side)
    if(length>1){front/=length;side/=length}
    const sprint=(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||this.sprintTouch)&&length>.1&&!this.crouched&&this.stamina>1
    const speed=this.crouched?1.5:sprint?5.8:3.3
    const dx=(Math.sin(this.yaw)*front+Math.cos(this.yaw)*side)*speed*dt,dz=(-Math.cos(this.yaw)*front+Math.sin(this.yaw)*side)*speed*dt
    this.stamina=clamp(this.stamina+dt*(sprint?-12:8),0,100);this.jumpSpeed=Math.max(-15,this.jumpSpeed-15*dt)
    this.controller.computeColliderMovement(this.collider,{x:dx,y:this.jumpSpeed*dt,z:dz})
    const m=this.controller.computedMovement(),pos=this.body.translation();this.body.setNextKinematicTranslation({x:clamp(pos.x+m.x,-18,18),y:pos.y+m.y,z:clamp(pos.z+m.z,-27,25)});this.physics.timestep=dt;this.physics.step()
    this.onGround=this.controller.computedGrounded();if(this.onGround)this.jumpSpeed=-.4
    const next=this.body.translation();this.floorY=Math.max(0,next.y-.845);this.player.position.set(next.x,this.floorY,next.z)
    if(length>.08&&!this.pending){const turn=Math.atan2(dx,dz)-this.player.rotation.y;this.player.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*Math.min(1,dt*13)}
    this.poseTime-=dt
    const action=this.poseTime>0?this.pose:!this.onGround&&this.floorY>.12?'jump':this.crouched?(length>.1?'crouch':'cover'):length>.1?(sprint?'sprint':this.escort?'walk':this.task.kind==='supply'&&this.step>0?'carry':'run'):'idle'
    this.cast[0].setAction(action)
    if(this.pending&&this.pose==='climb')this.player.position.y+=Math.sin((1-this.pending/1.5)*Math.PI)*1.08
    if(this.pending&&this.task.kind==='open'){const door=this.landmark.getObjectByName('باب');if(door)door.rotation.y=(1-this.pending/.9)*1.4}
    if(length>.1&&this.onGround){this.gait+=dt*speed;if(this.gait>1.3){this.gait=0;this.audio.step(next.x,next.z,next.z< -12?'earth':Math.abs(next.x)>7?'wood':'stone')}}
  }
  private updateActors(dt:number){
    const p=this.player.position,companion=this.cast[2],enemy=this.cast[3];this.pulseAge+=dt
    if(this.pulseMesh.visible){this.pulseMesh.scale.setScalar(.2+this.pulseAge*7);(this.pulseMesh.material as T.MeshBasicMaterial).opacity=Math.max(0,1-this.pulseAge);if(this.pulseAge>=1)this.pulseMesh.visible=false}
    if(companion.root.visible){
      if(!this.trail.length||this.trail[this.trail.length-1].distanceTo(p)>.55)this.trail.push(p.clone())
      if(this.trail.length>45)this.trail.shift()
      const lead=this.trail[0],v=companion.root.position;let moving=false
      if(v.distanceTo(p)>1.4){const d=Math.hypot(lead.x-v.x,lead.z-v.z);if(d<.45&&this.trail.length>1)this.trail.shift();else if(d>.02){const f=Math.min(d,dt*4.9)/d;v.x+=(lead.x-v.x)*f;v.z+=(lead.z-v.z)*f;companion.root.rotation.y=Math.atan2(lead.x-v.x,lead.z-v.z);moving=true}}
      companion.setAction(moving?'walk':'idle')
    }
    if(enemy.root.visible){
      const v=enemy.root.position,dx=p.x-v.x,dz=p.z-v.z,d=Math.max(.01,Math.hypot(dx,dz));let speed=0
      if(this.retreat>0){this.retreat-=dt;speed=-2.7;if(this.retreat<=0)enemy.root.visible=false}
      else if(d<11&&d>1.7)speed=1+this.settings.difficulty*.28
      v.x+=dx/d*speed*dt;v.z+=dz/d*speed*dt;enemy.root.rotation.y=Math.atan2(dx,dz)+(speed<0?Math.PI:0);enemy.setAction(speed?'run':'idle')
      this.dangerCooldown-=dt;if(d<2.6&&this.retreat<=0&&this.dangerCooldown<=0){this.health-=[5,10,16][this.settings.difficulty]*(this.crouched?.5:1);this.dangerCooldown=2;this.audio.cue('pulse',v.x,v.z);this.hooks.notice('أطلق نداء المساندة أو ابتعد عن الخطر');if(this.health<=0){this.stop();this.hooks.failure()}}
    }
    for(const a of this.cast)if(a.root.visible||a===this.cast[0])a.update(dt)
    this.audio.listener(p.x,p.z,this.yaw);this.timer+=dt;if(this.timer>18){this.timer=0;this.audio.cue(this.chapter===3?'radio':'creak',p.x+5,p.z-7)}
  }
  private updateCamera(dt:number){
    const p=this.player.position;this.cine=Math.max(0,this.cine-dt)
    this.player.visible=!this.settings.first
    const focusY=this.crouched?1.1:1.56
    if(this.settings.first){this.camera.position.set(p.x,p.y+focusY,p.z);this.camera.lookAt(p.x+Math.sin(this.yaw),p.y+focusY-this.pitch+.2,p.z-Math.cos(this.yaw));return}
    this.aim.set(p.x,p.y+focusY,p.z)
    const a=this.yaw+this.cine*.35,dist=3.6+this.cine*.7
    const dir=this.temp.set(-Math.sin(a)*dist+.38*Math.cos(a),.48+this.pitch*2.6,Math.cos(a)*dist+.38*Math.sin(a))
    const len=dir.length();dir.normalize()
    const hit=this.physics.castRay(new R.Ray(this.aim,dir),len,true,undefined,undefined,this.collider)
    dir.multiplyScalar(hit?Math.max(.35,hit.timeOfImpact-.17):len).add(this.aim)
    this.camera.position.lerp(dir,1-Math.exp(-dt*14));this.camera.lookAt(p.x+Math.sin(a)*2,p.y+focusY-.05,p.z-Math.cos(a)*2)
  }
  private updateHud(){
    const t=this.task,d=this.dist()
    el('distance').textContent=arabic(d)+' م · '+arabic(this.step+1)+' من '+arabic(chapters[this.chapter].tasks.length)
    const button=el<HTMLButtonElement>('interact-prompt');button.hidden=d>2.65||this.pending>0;button.textContent=actionLabel[t.kind]+(matchMedia('(pointer:coarse)').matches?'':'  [E]')
    el<HTMLMeterElement>('health').value=this.health;el<HTMLMeterElement>('stamina').value=this.stamina
    const marker=this.temp.copy(this.targetP).project(this.camera),dot=el('target-dot');dot.hidden=!this.settings.guide||marker.z<0||marker.z>1||Math.abs(marker.x)>.97||Math.abs(marker.y)>.95
    if(!dot.hidden)dot.style.transform='translate('+((marker.x+1)*innerWidth/2-16)+'px,'+((1-marker.y)*innerHeight/2-17)+'px)'
    this.waypoint.visible=this.settings.guide
    const c=this.map;c.clearRect(0,0,152,152);const s=2.65,mx=(x:number)=>76+x*s,my=(z:number)=>76+z*2.24
    c.fillStyle='#a8997959';for(const b of this.terrain.colliders)c.fillRect(mx(b.x-b.w/2),my(b.z-b.d/2),b.w*s,b.d*2.24)
    c.strokeStyle='#b6b79e40';c.beginPath();c.moveTo(76,0);c.lineTo(76,152);c.stroke()
    c.font='13px sans-serif';c.fillStyle='#efe2bf';c.fillText('ش',71,14)
    if(this.settings.guide){c.save();c.translate(mx(t.x),my(t.z));c.rotate(.785);c.fillStyle='#f1c675';c.fillRect(-4,-4,8,8);c.restore()}
    c.save();c.translate(mx(this.player.position.x),my(this.player.position.z));c.rotate(this.yaw);c.fillStyle='#fbf6df';c.beginPath();c.moveTo(0,-6);c.lineTo(4,5);c.lineTo(0,3);c.lineTo(-4,5);c.closePath();c.fill();c.restore()
  }
}

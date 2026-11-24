import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface WorldCollider { x: number; z: number; w: number; d: number; h: number }
type V = [number, number, number]
type Dimensions = [number, number, number]
type Paint = T.MeshStandardMaterial

/** Built in metres. X runs east, and the upper end of the market lane faces north (-Z). */
export function createWorld(scene: T.Scene) {
  const root = new T.Group()
  root.name = 'حيّ الجبل'
  scene.add(root)
  const colliders: WorldCollider[] = []
  const textures: T.Texture[] = []
  const materials: T.Material[] = []
  const loader = new T.TextureLoader()
  const base = import.meta.env.BASE_URL + 'world/'
  function texture(file: string, colour = true, repeating = true) {
    const t = loader.load(base + file + '.webp')
    t.colorSpace = colour ? T.SRGBColorSpace : T.NoColorSpace
    if (repeating) t.wrapS = t.wrapT = T.RepeatWrapping
    t.anisotropy = 2
    textures.push(t)
    return t
  }
  const diffuse = Object.fromEntries(['wall', 'mortar', 'ashlar', 'wood', 'iron', 'rock', 'shoulder', 'ridge'].map(k => [k, texture(k)]))
  const normals = Object.fromEntries(['wall', 'mortar', 'ashlar', 'earth'].map(k => [k, texture(k + '-n', false)]))
  function paint(colour: T.ColorRepresentation, key?: string, roughness = .92, metalness = 0) {
    const m = new T.MeshStandardMaterial({ color: colour, roughness, metalness, map: key ? diffuse[key] : null, normalMap: key ? normals[key] || null : null, normalScale: new T.Vector2(.55,.55) })
    materials.push(m)
    return m
  }
  const limestone = paint('#fff0d4','ashlar'), masonry = paint('#d5be99','wall')
  const render = [paint('#f6dfad','mortar'),paint('#e2c4a1','mortar'),paint('#ddc9ad','wall'),paint('#c9bca7','mortar')]
  const ground = paint('#f5e8d3','shoulder'), timber = paint('#d1ab83','wood'), darkTimber = paint('#775d43','wood')
  const steel = paint('#49483f',undefined,.72,.36), black = paint('#201f1b'), glass = paint('#495a56',undefined,.29,.37)
  const fadedBlue = paint('#506d6a','iron'), shutters = [fadedBlue,paint('#848477','iron'),paint('#926f52','iron')]
  const trim = paint('#b2926d'), plaster = paint('#d8bea0'), rust = paint('#865a40'), cable = paint('#322b27')
  const headlamp=paint('#eee0bd'),carGlass=paint('#52605c',undefined,.27,.40)
  const lampGlass=paint('#c8bc9b');lampGlass.emissive.set('#ffc47e');lampGlass.emissiveIntensity=0
  const rafter = paint('#574535','wood'), shadeCloth = [paint('#b5a078'),paint('#94705b'),paint('#7c8680')]
  const mistGrey = paint('#b4b4ac',undefined,.67,.25), rubber = paint('#302f2a')
  const labelMaterial = paint('#ffffff')
  labelMaterial.map = texture('lettering',true,false); labelMaterial.alphaTest = .23; labelMaterial.polygonOffset = true; labelMaterial.polygonOffsetFactor=-1
  const mural = paint('#f8ecd5'); mural.map = texture('mural',true,false)
  const oliveMat = paint('#e4dcba'); oliveMat.map = texture('olive',true,false); oliveMat.alphaTest = .46; oliveMat.side = T.DoubleSide
  const commonUnit = new T.BoxGeometry(1,1,1)
  const cylinderCache = new Map<number,T.CylinderGeometry>()
  const place = new T.Object3D(), identity = new T.Matrix4()
  let buildingTransform = identity
  const batches = new Map<string,{mat:Paint; geometries:T.BufferGeometry[]; shadow:boolean}>()
  let seed = 6409
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)
  const between = (a:number,b:number) => a+(b-a)*random()
  const signed=(n:number)=>Math.sin(n*121.73+56.3)*43758.5453%1
  function emit(g:T.BufferGeometry, mat:Paint, shadow = true) {
    g.applyMatrix4(buildingTransform)
    g.computeBoundingBox()
    const min = g.boundingBox!.min, area = Math.floor(min.x/25)+','+Math.floor(min.z/25)
    const id = mat.uuid+'|'+area+'|'+shadow
    let batch=batches.get(id)
    if (!batch) batches.set(id,batch={mat,geometries:[],shadow})
    g.clearGroups()
    if (g.index) { const flat = g.toNonIndexed(); g.dispose(); g=flat }
    batch.geometries.push(g)
  }
  function box(x:number,y:number,z:number,w:number,h:number,d:number,m:Paint, rot:V=[0,0,0],shadow = true) {
    const g=commonUnit.clone()
    const uv=g.attributes.uv
    if(m.map && m!==mural && m!==labelMaterial) for(let i=0;i<uv.count;i++) {
      const face=Math.floor(i/4),sx=face<2?d:w,sy=face===2||face===3?d:h
      uv.setXY(i,uv.getX(i)*sx/2.7,uv.getY(i)*sy/2.7)
    }
    place.position.set(x,y,z);place.scale.set(w,h,d);place.rotation.set(...rot);place.updateMatrix()
    g.applyMatrix4(place.matrix);emit(g,m,shadow)
  }
  function rod(a:V,b:V,r:number,m:Paint,r2=r,n=6,shadow=true) {
    const av=new T.Vector3(...a),bv=new T.Vector3(...b),v=bv.clone().sub(av)
    if(v.lengthSq()<1e-6)return
    const key=n*10000+Math.round(r2/r*100)
    let cylinder=cylinderCache.get(key)
    if(!cylinder)cylinderCache.set(key,cylinder=new T.CylinderGeometry(r2/r,1,1,n))
    place.position.copy(av).lerp(bv,.5);place.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.clone().normalize());place.scale.set(r,v.length(),r);place.updateMatrix()
    const g=cylinder.clone().applyMatrix4(place.matrix)
    emit(g,m,shadow)
  }
  function plane(x:number,y:number,z:number,w:number,h:number,m:Paint,rot:V=[0,0,0],cell=-1,shadow=false) {
    const g=new T.PlaneGeometry(w,h)
    if(cell>=0){
      const uv=g.attributes.uv
      for(let i=0;i<uv.count;i++)uv.setXY(i,(cell%4+.012+uv.getX(i)*.976)/4,(4-Math.floor(cell/4)+.012+uv.getY(i)*.976)/5)
    }
    g.rotateX(rot[0]);g.rotateY(rot[1]);g.rotateZ(rot[2]);g.translate(x,y,z);emit(g,m,shadow)
  }
  const positioned=(x:number,z:number,yaw:number)=>new T.Matrix4().makeRotationY(yaw).setPosition(x,0,z)
  function solid(x:number,z:number,w:number,d:number,h:number) {
    const b=new T.Box3(new T.Vector3(x-w/2,0,z-d/2),new T.Vector3(x+w/2,h,z+d/2)).applyMatrix4(buildingTransform)
    const v=b.getSize(new T.Vector3()),p=b.getCenter(new T.Vector3())
    colliders.push({x:p.x,z:p.z,w:v.x,d:v.z,h})
  }

  // Sky and bounced dawn light are derived from the same panorama.
  const sky=texture('sky',true,false);sky.mapping=T.EquirectangularReflectionMapping
  const fog=new T.FogExp2('#c7b29d',.0095)
  scene.background=sky;scene.environment=sky;scene.environmentIntensity=.27
  scene.backgroundRotation.y=-2.5;scene.environmentRotation.y=-2.5;scene.fog=fog
  const hemi=new T.HemisphereLight('#e5ebf1','#9b7964',1.6)
  const sun=new T.DirectionalLight('#ffe2ad',2.15)
  sun.position.set(-24,27,-35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024)
  Object.assign(sun.shadow.camera,{left:-38,right:38,top:37,bottom:-37,near:1,far:115})
  sun.shadow.bias=-.00035;sun.shadow.normalBias=.027
  root.add(hemi,sun,sun.target)
  box(0,-.28,0,300,.55,280,ground,[0,0,0],false)

  ground.normalMap=normals.earth
  const roadMat=paint('#ebe7df')
  roadMat.map=texture('road');roadMat.transparent=true;roadMat.depthWrite=false
  roadMat.polygonOffset=true;roadMat.polygonOffsetFactor=-1
  function road(x:number,z:number,width:number,length:number,rotation:number,height:number){
    const g=new T.PlaneGeometry(width,length,4,20);g.rotateX(-Math.PI/2)
    const a=g.attributes.position,uv=g.attributes.uv
    for(let i=0;i<a.count;i++){
      uv.setXY(i,uv.getX(i),uv.getY(i)*length/13)
      a.setX(i,a.getX(i)+.17*Math.sin(a.getZ(i)*.16)+.18*Math.sin(a.getZ(i)*.068))
    }
    g.rotateY(rotation);g.translate(x,height,z);emit(g,roadMat,false)
  }
  road(0,0,7.2,90,0,.006);road(0,.04,4.1,69,Math.PI*.5,.004);road(0,12,3.8,68,Math.PI*.5,.004)
  // The ridge consists of uplifted limestone bands with gullies cut into the near slopes.
  function ridge(depth:number,amplitude:number,tint:string,id:number) {
    const nx=187, nz=34,verts:number[]=[],uv:number[]=[],ix:number[]=[],colors:number[]=[]
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const x=(i/nx-.5)*340, t=j/nz, ridgeLine=.52+.075*Math.sin(x*.055+id)+.055*Math.sin(x*.11-id)
      const localHeight=.50+.15*Math.sin(x*.027+id)+.038*Math.cos(x*.13+id)+.012*Math.sin(x*.40-id)
      const contour=Math.pow(Math.max(0,1-Math.abs(t-ridgeLine)/(t<ridgeLine?ridgeLine:1-ridgeLine)),.68)
      const gully=Math.abs(Math.sin(x*.147+t*3.4+Math.sin(x*.078+id)))**.45
      const fn=(.81+.19*gully)*localHeight*contour
      const z=-depth + (t-.5)*48+2*Math.sin(x*.047+id)
      const y=-1.3+amplitude*fn+signed(i*45+j+id)*.52*contour
      verts.push(x,y,z);uv.push(x*.105,(z*.075+y*.094))
      const c=new T.Color(tint).multiplyScalar(.78+.23*gully+.05*Math.sin(y*1.9)+.04*Math.sin(x+t))
      colors.push(c.r,c.g,c.b)
      if(j<nz && i<nx){const k=j*(nx+1)+i;ix.push(k,k+nx+1,k+1,k+1,k+nx+1,k+nx+2)}
    }
    const g=new T.BufferGeometry()
    g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals()
    const m=paint('#ffffff',id===3?'rock':'ridge');m.vertexColors=true
    const mountain=new T.Mesh(g,m);root.add(mountain)
  }
  ridge(116,69,'#beb6b3',3);ridge(88,48,'#dccabd',1);ridge(65,24,'#c4ae8f',5)

  const doors:{hinge:T.Group;point:T.Vector3;angle:number;open:boolean;rest:number}[]=[]
  const breakables:{mesh:T.Group;point:T.Vector3;broken:boolean}[]=[]
  function window(u:number,y:number,z:number,w:number,h:number,open:boolean) {
    box(u,y,z,w+.19,h+.23,.12,limestone)
    box(u,y,z+.068,w,h,.04,black)
    box(u,y,z+.103,w-.11,h-.09,.02,glass)
    box(u,y-h/2-.065,z+.09,w+.29,.13,.30,trim)
    box(u,y,z+.14,.042,h,.045,steel)
    box(u,y+.12*h,z+.14,w,.043,.045,steel)
    if(open){
      for(const sign of [-1,1]){
        const sx=u+sign*(w*.59)
        box(sx,y,z+.14,w*.23,h,.08,fadedBlue,[0,sign*.19,0])
        for(let j=0;j<6;j++)box(sx,y-h*.42+j*h*.15,z+.19,w*.23,.022,.03,steel)
      }
    }else for(let i=-1;i<=1;i++)box(u+i*w*.28,y,z+.18,.023,h,.03,steel)
  }
  function door(u:number,z:number,wood:Paint) {
    const h=2.28,w=1.12
    box(u,h/2,z-.02,w+.22,h+.16,.17,limestone)
    box(u,h/2,z+.073,w+.03,h,.02,black)
    // Independent hinges allow an actual swinging door rather than a sign that changes state.
    const pivot=new T.Group();const p=new T.Vector3(u-w*.5,.01,z+.095).applyMatrix4(buildingTransform)
    pivot.position.copy(p);pivot.quaternion.setFromRotationMatrix(buildingTransform)
    const leaf=new T.Mesh(new T.BoxGeometry(w,h-.045,.074),wood)
    leaf.position.set(w*.5,h*.5,0);leaf.castShadow=true;pivot.add(leaf)
    const knob=new T.Mesh(new T.SphereGeometry(.046,6,4),steel);knob.position.set(w*.86,1.05,.085);pivot.add(knob)
    for(let i=0;i<3;i++) {const panel=new T.Mesh(new T.BoxGeometry(w*.82,.07,.025),darkTimber);panel.position.set(w*.5,.32+i*.79,.05);pivot.add(panel)}
    root.add(pivot)
    const worldAngle=Math.atan2(buildingTransform.elements[8],buildingTransform.elements[10])
    doors.push({hinge:pivot,point:p,angle:0,open:false,rest:worldAngle})
  }
  function textileAwning(x:number,y:number,z:number,w:number,depth:number,variant:number) {
    const m=shadeCloth[variant%3];m.side=T.DoubleSide
    const g=new T.PlaneGeometry(w,depth,9,4)
    g.rotateX(-Math.PI/2);const a=g.attributes.position
    for(let i=0;i<a.count;i++){const xx=a.getX(i),zz=a.getZ(i),along=zz/depth+.5
      a.setXYZ(i,xx+x,y-.39*along-.11*Math.sin(Math.PI*along)-.085*Math.cos(xx/w*Math.PI),z+zz+depth/2)
    }
    g.computeVertexNormals();emit(g,m)
    box(x,y-.47,z+depth,w,.16,.045,m)
    for(const s of [-1,1])rod([x+s*w*.48,y-.85,z],[x+s*w*.48,y-.38,z+depth],.022,steel)
    rod([x-w*.5,y-.38,z+depth],[x+w*.5,y-.38,z+depth],.026,steel)
  }
  function waterTank(x:number,y:number,z:number) {
    // Rooftop water cistern, ribbed plastic with fill-cap and outlet pipe.
    rod([x,y+.09,z],[x,y+1.19,z],.52,black,.52,14)
    for(let j=0;j<4;j++)rod([x,y+.18+j*.27,z],[x,y+.215+j*.27,z],.54,steel,.54,14)
    rod([x,y+1.19,z],[x,y+1.25,z],.28,steel,.27,10)
    rod([x+.43,y+.17,z],[x+.74,y+.17,z],.035,mistGrey)
    rod([x+.74,y+.17,z],[x+.74,y-.38,z],.035,mistGrey)
  }
  function house(side:number,cz:number,width:number,depth:number,index:number,storeys:number) {
    const front=side*(7.15+between(0,.9)), yaw=-side*Math.PI/2
    buildingTransform=positioned(front,cz,yaw)
    const floor=2.92,h=storeys*floor+.16, z=-depth*.5, wall=render[index%4]
    const shelter=index===3
    if(shelter){
      for(const sign of [-1,1]){box(sign*(width*.5-.15),h*.5,z,.30,h,depth,wall);solid(sign*(width*.5-.15),z,.3,depth,h)}
      box(0,h*.5,-depth+.15,width,h,.30,wall);solid(0,-depth+.15,width,.3,h)
      box(0,h-.15,z,width,.30,depth,limestone)
      for(const s of [-1,1]){
        const w=width*.28;box(s*(width-w)/2,1.44,-.12,w,2.88,.24,wall);solid(s*(width-w)/2,-.12,w,.24,2.88)
      }
      for(const s of [-1,1]) {box(s*width*.35,.4,-2.9,1.3,.20,2.55,timber);box(s*width*.35,.55,-2.9,1.25,.15,2.43,shadeCloth[2])}
    }else{
      box(0,h*.5,z,width,h,depth,wall);solid(0,z,width,depth,h)
    }
    box(0,.20,.01,width,.4,.13,masonry)
    box(0,h+.03,z,width+.28,.22,depth+.28,limestone)
    // Broken parapets expose silo tanks, drainage pipes and roof beams.
    for(const s of [-1,1])box(s*(width*.5-.075),h+.29,z,.15,.41,depth,wall)
    const intact=index%4!==2
    box(-width*(intact?0:.28),h+.31,.02,width*(intact?1:.44),.40,.17,wall)
    if(storeys>1){
      for(let u=-width*.30;u<=width*.32;u+=width*.60)window(u,4.27,.04,1.16,1.19,index%3!==0)
      if(index%2===0){
        box(0,3.13,.53,width*.79,.16,1.15,limestone)
        rod([-width*.4,4.02,1.04],[width*.4,4.02,1.04],.037,steel)
        for(let i=0;i<11;i++)rod([-width*.39+i*width*.078,3.19,1.04],[-width*.39+i*width*.078,4,1.04],.021,steel)
      }
    }
    if(!shelter && index%3===0 && width>5){
      box(0,1.23,.09,width*.69,2.36,.09,black)
      box(0,1.24,.155,width*.66,2.29,.07,shutters[index%3])
      cellSign(0,2.75,.17,width*.62,.61,10+[0,2,3,7][Math.floor(index/3)%4])
      textileAwning(0,2.52,.17,width*.82,1.27,index)
    }else if(shelter){
      cellSign(0,2.58,.23,2.46,.63,11)
      textileAwning(0,2.70,.20,width*.77,1.37,0)
    }else{
      door(-width*.235,.02,index%2===0?timber:fadedBlue)
      window(width*.225,1.61,.045,1.34,1.02,index%2===0)
    }
    if(index%3!==1)waterTank(between(-width*.25,width*.25),h+.16,-depth*.65)
    if(index%2===0 || shelter) {
      const lx=-width*.38
      box(lx,2.59,.15,.13,.20,.12,steel)
      rod([lx,2.64,.16],[lx,2.64,.44],.022,steel)
      rod([lx,2.59,.42],[lx,2.46,.42],.112,steel,.055,8)
      rod([lx,2.31,.42],[lx,2.47,.42],.065,lampGlass,.097,8)
    }
    // Metal downpipe, bands and a partly detached outlet.
    const px=width*.5-.24
    rod([px,.31,.20],[px,h+.20,.20],.045,mistGrey)
    rod([px,.32,.20],[px,.18,.36],.046,mistGrey)
    if(index%4===0){
      box(px-.65,2.44,.19,.72,.43,.25,mistGrey)
      for(let i=0;i<6;i++)box(px-.65,2.29+i*.051,.325,.61,.012,.018,steel)
    }
    // The writing belongs to walls, with respectful clear space around each inscription.
    if(index<10){
      const exposedFace=side===1?-1:1
      const sideYaw=exposedFace*Math.PI/2
      plane(exposedFace*(width*.5+.018),1.61,-depth*.32,Math.min(3.3,depth*.53),.82,labelMaterial,[0,sideYaw,0],index)
    }
    if(index===4){
      plane(width*.5+.017,1.85,-depth*.57,2.86,1.95,mural,[0,Math.PI/2,0])
      plane(width*.5+.024,.7,-depth*.53,2.38,.42,labelMaterial,[0,Math.PI/2,0],14)
    }
    if(index===1 || index===8)cellSign(0,2.74,.14,1.55,.42,index===1?14:15)
    buildingTransform=identity
  }
  function cellSign(x:number,y:number,z:number,w:number,h:number,id:number){plane(x,y,z,w,h,labelMaterial,[0,0,0],id)}
  const homes:[number,number,number,number,number,number][]=[
    [-1,-23.5,7.8,6.9,0,1],[-1,-15.5,7.0,7.0,1,2],[-1,-7.3,7.5,6.3,2,1],[-1,6,5.3,6.0,3,1],[-1,20.8,8.1,6.9,4,2],[-1,29.6,7.2,6.0,5,1],
    [1,-25,7.7,7.1,6,1],[1,-16.8,7.4,6.4,7,2],[1,-8.2,7.6,7.0,8,1],[1,5.8,5.5,6.5,9,1],[1,20.8,7.6,6.1,10,2],[1,29.3,7.4,6.4,11,1]]
  for(const h of homes)house(...h)
  // A small pedestrian arcade terminates the vista without sealing the mountain road.
  function arch(x:number,z:number,yaw:number,span:number,rise:number) {
    buildingTransform=positioned(x,z,yaw)
    const spring=2.22,thickness=.53
    for(const s of [-1,1]){
      box(s*(span*.5+thickness*.5),spring*.5,0,thickness,spring,1.23,limestone)
      box(s*(span*.5+thickness*.5),.15,0,thickness+.29,.30,1.38,masonry)
      box(s*(span*.5+thickness*.5),spring-.07,0,thickness+.23,.16,1.34,limestone)
      solid(s*(span*.5+thickness*.5),0,thickness,1.23,spring)
    }
    const r=span*.5
    for(let i=0;i<17;i++){
      const a=i/17*Math.PI+.004,b=(i+1)/17*Math.PI-.004
      const shape=new T.Shape()
      shape.moveTo(Math.cos(a)*r,spring+Math.sin(a)*rise)
      shape.lineTo(Math.cos(a)*(r+thickness),spring+Math.sin(a)*(rise+thickness))
      shape.lineTo(Math.cos(b)*(r+thickness),spring+Math.sin(b)*(rise+thickness))
      shape.lineTo(Math.cos(b)*r,spring+Math.sin(b)*rise);shape.closePath()
      const g=new T.ExtrudeGeometry(shape,{depth:1.24,bevelEnabled:false});g.translate(0,0,-.62)
      emit(g,i%5===0?masonry:limestone)
    }
    buildingTransform=identity
  }
  arch(1,-31,.05,5.8,1.94)
  for(const side of [-1,1]){
    for(let j=0;j<3;j++){
      const x=side*(9+j*6.5),z=-35-between(0,3),w=between(4.5,6.5),h=between(2.5,4.0)
      box(x,h*.5,z,w,h,5.3,render[(j+2)%4]);box(x,h+.08,z,w+.16,.17,5.45,limestone)
      for(const sign of [-1,1])window(x+sign*w*.25,h*.55,z+2.68,.7,.83,false)
      solid(x,z,w,5.3,h)
    }
    for(let j=0;j<5;j++){
      const z=-23+j*12, x=side*between(24,30),h=between(3.2,5.1)
      box(x,h*.5,z,6.4,h,6.8,render[j%4]);box(x,h+.08,z,6.55,.17,6.95,limestone);solid(x,z,6.4,6.8,h)
      window(x-1.7,1.6,z+3.43,1.1,1.12,true);window(x+1.6,1.6,z+3.43,1.12,1.1,false)
    }
  }
  function wire(a:V,b:V,sag:number,m:Paint,r=.016){
    let prev=a
    for(let j=1;j<=8;j++){const t=j/8,p:V=[T.MathUtils.lerp(a[0],b[0],t),T.MathUtils.lerp(a[1],b[1],t)-Math.sin(t*Math.PI)*sag,T.MathUtils.lerp(a[2],b[2],t)]
      rod(prev,p,r,m,r,4,false);prev=p}
  }
  const poles:V[]=[[-6.55,6.65,27],[-6.44,6.4,9],[-6.77,6.13,-11],[-6.35,6.36,-28]]
  for(let i=0;i<poles.length;i++){
    const [x,h,z]=poles[i],lean=i===2?.32:.07
    rod([x,0,z],[x+lean,h+.3,z+.08],.14,timber,.095,9)
    rod([x-.66+lean,h-.08,z],[x+.66+lean,h-.08,z],.055,rafter)
    for(let n=0;n<3;n++){
      const dx=(n-1)*.51
      rod([x+dx+lean,h-.08,z],[x+dx+lean,h+.19,z],.047,mistGrey,.066,7)
      if(i>0){const [px,ph,pz]=poles[i-1];wire([px+dx+.07,ph+.16,pz],[x+dx+lean,h+.16,z],.59+n*.09,cable)}
    }
    if(i!==1)wire([x+lean,h-.24,z],[8.17,h-.75,z+3.8],1.13,cable,.021)
    if(i===2){wire([x+lean,h-.32,z],[x+.88,2.8,z+1.1],.86,cable,.021)}
    solid(x,z,.3,.3,h)
  }
  // Canvas shades cross an alley, separated by gaps that let bands of sunlight through.
  for(let j=0;j<3;j++){
    const x=-11.1-j*2.42
    const awn=new T.PlaneGeometry(1.98,6.6,3,8);awn.rotateX(-Math.PI/2)
    const a=awn.attributes.position
    for(let i=0;i<a.count;i++){const z=a.getZ(i);a.setXYZ(i,x+a.getX(i),3.74-.58*Math.cos(z/6.6*Math.PI)+.09*Math.sin(i*2),z)}
    awn.computeVertexNormals();shadeCloth[j].side=T.DoubleSide;emit(awn,shadeCloth[j])
  }
  function olive(x:number,z:number,scale:number){
    buildingTransform=positioned(x,z,between(-3,3))
    const s=scale
    rod([0,0,0],[.11*s,1.12*s,.06*s],.17*s,darkTimber,.12*s,8)
    for(let i=0;i<7;i++){
      const a=i*.898+random()*.29,dx=Math.cos(a)*s,dz=Math.sin(a)*s
      const y=between(1.64,2.22)*s
      rod([.06*s,.86*s,.03*s],[dx*.62,y-s*.29,dz*.62],.078*s,timber,.036*s,7)
      rod([dx*.62,y-s*.29,dz*.62],[dx*1.07,y+.24*s,dz*1.07],.033*s,timber,.011*s,5)
      for(let j=0;j<12;j++){
        const radius=between(.34,1.43),cx=dx*radius+between(-.27,.27)*s,cz=dz*radius+between(-.27,.27)*s
        plane(cx,y+between(-.16,.52)*s,cz,.72*s,.91*s,oliveMat,[between(-.6,.6),between(-Math.PI,Math.PI),between(-.4,.4)],-1,true)
      }
    }
    buildingTransform=identity
  }
  const trees=[[-5.95,19.4,1.37],[6.2,-3.8,1.25],[-6.1,-21.4,1.15],[12.8,14.1,1.45],[-16.9,1.9,1.03],[7.2,27.1,1.65],[-20.3,-26,1.98],[16.4,-28,1.5],[17.5,31,1.55],[-17.2,29.4,1.4]]
  for(const [x,z,s] of trees)olive(x,z,s)
  // Village sedan: separate bonnet, sloping glazed cabin, wheel arches, lights and doors.
  function vehicle(x:number,z:number,yaw:number,bodyColour:string) {
    buildingTransform=positioned(x,z,yaw)
    const body=paint(bodyColour,undefined,.70,.27)
    const profile=(shape:[number,number][],width:number,mat:Paint)=>{
      const points=new T.Shape()
      shape.forEach(([zz,yy],i)=>i?points.lineTo(zz,yy):points.moveTo(zz,yy));points.closePath()
      const g=new T.ExtrudeGeometry(points,{depth:width,bevelEnabled:true,bevelSize:.045,bevelThickness:.045,bevelSegments:1,curveSegments:1})
      g.rotateY(-Math.PI/2);g.translate(width*.5,0,0);emit(g,mat)
    }
    profile([[-2.04,.46],[-2.05,.75],[-1.73,.84],[-.86,.89],[.96,.88],[1.93,.79],[2.04,.68],[2.00,.44]],1.63,body)
    profile([[-1.05,.87],[-.49,1.41],[.43,1.45],[1.02,.89]],1.43,carGlass)
    box(0,1.455,.01,1.45,.073,1.01,body)
    for(const sign of [-1,1]){
      const xx=sign*.76
      for(const [za,ya,zb,yb] of [[-.99,.89,-.49,1.43],[-.05,.90,-.08,1.44],[.97,.89,.43,1.44]])rod([xx,ya,za],[xx,yb,zb],.042,body)
      rod([sign*.825,.89,-1.06],[sign*.825,.89,1.06],.024,mistGrey)
      for(const zz of [-1.33,1.28]){
        const bx=sign*.81
        rod([bx-.106,.398,zz],[bx+.106,.398,zz],.375,rubber,.375,16)
        rod([sign*.914,.398,zz],[sign*.93,.398,zz],.186,steel,.18,12)
        rod([sign*.93,.398,zz],[sign*.947,.398,zz],.091,mistGrey,.081,8)
      }
      box(sign*.66,.71,-2.055,.28,.115,.042,headlamp)
      box(sign*.65,.69,2.025,.29,.125,.04,rust)
      box(sign*.83,.81,.12,.034,.037,.16,mistGrey)
      box(sign*.83,.81,.81,.034,.037,.16,mistGrey)
    }
    for(const ss of [-1,1])box(0,.46,ss*2.043,1.54,.12,.092,steel)
    box(0,.69,-2.073,.79,.12,.03,black)
    for(let i=0;i<10;i++)box((i-4.5)*.072,.69,-2.094,.021,.10,.015,mistGrey)
    buildingTransform=identity
    const p=positioned(x,z,yaw);buildingTransform=p;solid(0,0,1.76,4.12,1.45);buildingTransform=identity
  }
  vehicle(-5.89,-4.8,-.09,'#97988a')
  vehicle(6.0,23.8,-.17,'#5e7775')
  function bench(x:number,z:number,yaw:number){
    buildingTransform=positioned(x,z,yaw)
    for(let i=0;i<3;i++)box(0,.44,-.17+i*.17,1.68,.07,.14,timber)
    box(0,.79,-.24,1.68,.21,.075,timber)
    for(const ss of [-1,1]){rod([ss*.61,.05,-.21],[ss*.61,.91,-.24],.034,steel);rod([ss*.61,.05,.19],[ss*.61,.43,.16],.032,steel)}
    buildingTransform=identity
  }
  bench(-7.0,4.9,Math.PI*.5);bench(6.65,-15,.5*Math.PI)
  // The grocer's stand and textiles give the near residential façades a human scale.
  const canvasReds=[paint('#8e4e3e'),paint('#cab58e'),paint('#656d63'),paint('#b48958')]
  function grocery(x:number,z:number,yaw:number) {
    buildingTransform=positioned(x,z,yaw)
    for(const a of [-1,1])for(const b of [-1,1])rod([a*1.09,.03,b*.40],[a*1.09,2.04+.10*b,b*.40],.038,timber)
    box(0,.76,0,2.34,.13,.95,timber)
    for(let i=0;i<15;i++)box(-1.08+i*.154,.51,.405,.142,.53,.052,i%3===0?darkTimber:timber)
    for(let i=0;i<8;i++)box(-1.15+i*.33,2.08,0,.329,.05,1.18,canvasReds[i%2],[.11,0,0])
    box(0,2.002,.58,2.65,.12,.05,canvasReds[0])
    for(let i=0;i<3;i++){
      const px=-.73+i*.73
      box(px,.88,0,.60,.13,.56,darkTimber)
      for(const ss of [-1,1])box(px,.99,ss*.25,.63,.16,.04,timber)
      for(let j=0;j<8;j++){
        const ax=px+(j%4-1.5)*.117,az=(Math.floor(j/4)-.5)*.17
        rod([ax,1.02,az],[ax,1.14,az],.065,canvasReds[(i+3)%4],.051,7)
      }
    }
    buildingTransform=identity
  }
  grocery(-5.97,24.1,Math.PI*.5);grocery(6.08,-10.1,-Math.PI*.5)
  // Garments hang on the line anchored to residential roof parapets.
  wire([-7.3,5.75,-16.8],[7.3,5.82,-14.9],.76,cable,.012)
  for(let i=0;i<8;i++){
    const t=.13+i*.1, x=-7.3+14.6*t, z=-16.8+1.9*t, top=5.75+t*.07-Math.sin(Math.PI*t)*.76
    const g=new T.PlaneGeometry(.48+random()*.29,.59+random()*.42,5,4),a=g.attributes.position
    for(let j=0;j<a.count;j++){const xx=a.getX(j),yy=a.getY(j);a.setXYZ(j,x+xx,top-.44+yy+.034*Math.cos(xx*14),z+.076*Math.sin(xx*16)+.04*yy)}
    g.computeVertexNormals();canvasReds[i%4].side=T.DoubleSide;emit(g,canvasReds[i%4],false)
  }
  // Collapsed masonry sits in the setbacks; the crossing streets remain unobstructed.
  for(const [cx,cz] of [[6.62,18.65],[-6.55,-8.75],[6.51,-25.8]]){
    for(let i=0;i<23;i++){
      const dx=between(-.57,.64),dz=between(-.92,.85),layer=Math.max(0,.5-.40*Math.hypot(dx,dz))
      box(cx+dx,.11+layer*random(),cz+dz,between(.19,.49),between(.10,.20),between(.16,.31),i%3===0?masonry:limestone,[between(-.43,.49),between(0,3),between(-.44,.45)])
    }
    rod([cx-.24,.22,cz-.19],[cx+.22,.89,cz+.17],.017,rust)
    rod([cx+.22,.89,cz+.17],[cx+.37,1.09,cz+.32],.017,rust)
  }
  function trunk(x:number,z:number,w:number){
    const g=new T.Group();g.position.set(x,.01,z)
    const board=(d:Dimensions,p:V,m:Paint)=>{const mesh=new T.Mesh(new T.BoxGeometry(...d),m);mesh.position.set(...p);mesh.castShadow=true;g.add(mesh)}
    board([w,.59,w*.72],[0,.3,0],timber)
    for(const s of [-1,1]){board([.054,.61,w*.73],[s*w*.40,.31,0],darkTimber);board([w,.053,.048],[0,.12,s*w*.36],darkTimber)}
    root.add(g);breakables.push({mesh:g,point:g.position.clone(),broken:false})
  }
  trunk(6.09,5.8,.90);trunk(-6.27,-17.1,.74)
  // Scattered luggage and folded household textiles sit on the shoulders of the street.
  for(const [x,z,sz] of [[-5.57,14.5,.78],[6.16,-6.1,.63],[-6.0,3.6,.66]]){
    box(x,.22,z,sz,.41,sz*.52,darkTimber,[.02,.14,.04])
    for(const s of [-1,1])box(x+sz*s*.27,.22,z,.048,.42,sz*.54,rafter)
    rod([x-.07,.425,z],[x-.07,.493,z],.014,steel);rod([x+.07,.425,z],[x+.07,.493,z],.014,steel);rod([x-.07,.493,z],[x+.07,.493,z],.014,steel)
  }
  // Staggered threshold paving and worn kerbs mark the shop margins.
  for(const [side,cz,w] of homes){
    const count=Math.floor(w/.78)
    for(let i=0;i<count;i++){
      const zz=cz-w*.5+(i+.5)*w/count
      box(side*7.08,.03,zz,1.18,.065,w/count-.028,i%4===0?masonry:limestone,[0,between(-.012,.012),0],false)
      if(i%3!==1)box(side*6.47,.062,zz,.13,.125,w/count-.035,trim,[0,between(-.016,.016),0],false)
    }
  }
  // A sun banner is hoisted on a fixed civic wall; it belongs to no damageable object.
  const flagCanvas=document.createElement('canvas');flagCanvas.width=384;flagCanvas.height=246
  const ctx=flagCanvas.getContext('2d')!
  for(const [i,c] of ['#a64439','#eee2c9','#d8af4e'].entries()){ctx.fillStyle=c;ctx.fillRect(0,i*82,384,82)}
  ctx.fillStyle='#c08623';ctx.beginPath()
  for(let i=0;i<42;i++){
    const a=i*Math.PI/21-Math.PI*.5,r=i%2===0?35:23
    if(!i)ctx.moveTo(192+Math.cos(a)*r,123+Math.sin(a)*r);else ctx.lineTo(192+Math.cos(a)*r,123+Math.sin(a)*r)
  }
  ctx.closePath();ctx.fill()
  const flagTex=new T.CanvasTexture(flagCanvas);flagTex.colorSpace=T.SRGBColorSpace;textures.push(flagTex)
  const flagMat=paint('#faf2dc');flagMat.map=flagTex;flagMat.side=T.DoubleSide
  const flags:{mesh:T.Mesh<T.PlaneGeometry,Paint>;base:Float32Array}[]=[]
  for(const [x,z,top,yaw] of [[-7.81,6.2,5.04,-.35],[7.49,-15.0,7.25,2.64]]){
    rod([x,top-2.35,z],[x,top+.09,z],.031,mistGrey)
    const geo=new T.PlaneGeometry(1.68,.91,13,4);geo.translate(.84,-.455,0)
    const mesh=new T.Mesh(geo,flagMat);mesh.position.set(x,top,z);mesh.rotation.y=yaw;mesh.castShadow=true
    root.add(mesh);flags.push({mesh,base:new Float32Array(geo.attributes.position.array)})
  }
  // Thin rubble avoids per-stone draw calls. The lane itself stays passable.
  const debrisGeo=new T.DodecahedronGeometry(1,0),count=260
  const debris=new T.InstancedMesh(debrisGeo,masonry,count);debris.receiveShadow=true
  for(let i=0;i<count;i++){
    const x=(random()<.5?-1:1)*between(5.05,7.09),z=between(-29,31),size=between(.035,.145)
    place.position.set(x,size*.17,z);place.rotation.set(random()*2,random()*6,random()*2);place.scale.set(size*1.44,size*.52,size);place.updateMatrix();debris.setMatrixAt(i,place.matrix)
    debris.setColorAt(i,new T.Color().setScalar(between(.59,1)))
  }
  debris.computeBoundingSphere();root.add(debris)
  for(const {mat,geometries,shadow} of batches.values()){
    const merged=mergeGeometries(geometries,false)
    if(merged){merged.computeBoundingSphere();const mesh=new T.Mesh(merged,mat);mesh.castShadow=shadow;mesh.receiveShadow=true;root.add(mesh)}
    geometries.forEach(g=>g.dispose())
  }
  batches.clear();commonUnit.dispose();cylinderCache.forEach(g=>g.dispose())

  // Camera-facing translucent soot layers rise behind roofs, away from passable routes.
  const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=96
  const sc=smokeCanvas.getContext('2d')!
  for(let i=0;i<80;i++){
    const a=random()*Math.PI*2,r=between(0,29),px=48+Math.cos(a)*r,py=48+Math.sin(a)*r,rs=between(8,19)
    const grad=sc.createRadialGradient(px,py,0,px,py,rs);grad.addColorStop(0,'rgba(230,225,220,.12)');grad.addColorStop(1,'rgba(230,225,220,0)');sc.fillStyle=grad;sc.fillRect(px-rs,py-rs,rs*2,rs*2)
  }
  const smokeTex=new T.CanvasTexture(smokeCanvas);textures.push(smokeTex)
  const smokeMat=new T.SpriteMaterial({map:smokeTex,color:'#655f55',transparent:true,opacity:.24,depthWrite:false})
  materials.push(smokeMat)
  const smoke=Array.from({length:9},()=>{const s=new T.Sprite(smokeMat);root.add(s);return s})
  const dustGeometry=new T.BufferGeometry(),dustData=new Float32Array(96*3)
  for(let i=0;i<dustData.length;i+=3){dustData[i]=between(-19,19);dustData[i+1]=between(.1,7);dustData[i+2]=between(-27,28)}
  dustGeometry.setAttribute('position',new T.BufferAttribute(dustData,3))
  const dustMat=new T.PointsMaterial({size:.049,color:'#f8ddaf',transparent:true,opacity:.48,depthWrite:false})
  materials.push(dustMat);const dust=new T.Points(dustGeometry,dustMat);root.add(dust)
  const starGeo=new T.BufferGeometry(),starPositions:number[]=[]
  for(let i=0;i<350;i++){
    const az=between(0,Math.PI*2),h=between(.08,1.48),r=151
    starPositions.push(r*Math.cos(h)*Math.cos(az),r*Math.sin(h),r*Math.cos(h)*Math.sin(az))
  }
  starGeo.setAttribute('position',new T.Float32BufferAttribute(starPositions,3))
  const starMat=new T.PointsMaterial({color:'#dddccf',size:.13,opacity:.62,transparent:true,fog:false,depthWrite:false})
  materials.push(starMat);const stars=new T.Points(starGeo,starMat);root.add(stars)
  let previousChapter=-1,quality=2
  const palette=[
    ['#ffe1ae','#c5b7a5',2.24,1.45,.98],['#f0ba88','#ac9b89',1.80,1.24,.83],['#ffda9f','#b9a78f',2.40,1.43,.95],
    ['#a4badc','#68727e',.76,.82,.38],['#e9bd93','#b3a59a',1.64,1.31,.82],['#9cb5d8','#566270',.50,.76,.26],['#ffe3a9','#cabeaa',2.38,1.55,1.01]
  ] as const
  const setQuality=(n:number)=>{
    quality=Math.max(0,Math.min(3,Math.round(n)))
    sun.castShadow=quality>0;dust.visible=quality>0
    const mapSize=[512,512,1024,2048][quality]
    if(sun.shadow.mapSize.x!==mapSize){sun.shadow.mapSize.set(mapSize,mapSize);sun.shadow.map?.dispose();sun.shadow.map=null}
  }
  function interact(x:number,z:number){
    for(const door of doors)if(Math.hypot(x-door.point.x,z-door.point.z)<2.45){door.open=!door.open;return}
    for(const prop of breakables)if(!prop.broken&&Math.hypot(x-prop.point.x,z-prop.point.z)<2.15){prop.broken=true;prop.mesh.rotation.z=.29;prop.mesh.scale.y=.46;return}
  }
  function update(dt:number,time:number,chapter:number){
    const c=Math.min(6,Math.max(0,Math.floor(chapter)))
    if(c!==previousChapter){
      const [light,far,sunlight,skyLight,skyBrightness]=palette[c]
      sun.color.set(light);sun.intensity=sunlight;hemi.intensity=skyLight;fog.color.set(far)
      hemi.color.set(c===3||c===5?'#96abd0':'#e9e6e1')
      const night=c===3||c===5
      stars.visible=night;lampGlass.emissiveIntensity=night?2.0:.02
      glass.emissive.set('#8b653b');glass.emissiveIntensity=night?.41:0
      const direction:V[]=[[-24,25,-34],[-12,44,-23],[27,16,-22],[18,26,31], [23,11,-27],[-18,27,31],[-27,15,-32]]
      sun.position.set(...direction[c]);sun.shadow.needsUpdate=true
      fog.density=c===1?.014:.0095;scene.backgroundIntensity=skyBrightness
      scene.environmentIntensity=skyBrightness*.28
      previousChapter=c
    }
    for(const flag of flags){
      const attr=flag.mesh.geometry.attributes.position
      for(let i=0;i<attr.count;i++){const x=flag.base[i*3],y=flag.base[i*3+1],w=x/1.68
        attr.setXYZ(i,x-.065*w*(1+Math.sin(time*2+x*3)),y-.14*w+.045*w*Math.sin(time*2.4-x*3.8),w*(.13*Math.sin(time*2.5-x*3.1)+.045*Math.sin(time*4+y*3.7)))}
      attr.needsUpdate=true
    }
    for(const door of doors){door.angle=T.MathUtils.damp(door.angle,door.open?1.25:0,6,dt);door.hinge.rotation.y=door.rest+door.angle}
    dust.position.x=Math.sin(time*.12)*1.4;dust.position.y=Math.sin(time*.27)*.11
    smoke.forEach((s,i)=>{
      s.visible=quality>0 && (c===1||c===3||c===4||c===5)
      if(s.visible){const p=(time*.065+i/9)%1;s.position.set(-16.5+p*6+Math.sin(p*8)*.4,3.5+p*12,-18.5+p*.45);s.scale.setScalar(1.8+p*5.8)}
    })
  }
  function dispose(){
    scene.remove(root);if(scene.environment===sky)scene.environment=null;if(scene.background===sky)scene.background=null
    const geometries=new Set<T.BufferGeometry>();root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points)geometries.add(o.geometry)})
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());sun.shadow.dispose()
  }
  update(0,0,0)
  return {colliders,update,interact,setQuality,dispose}
}

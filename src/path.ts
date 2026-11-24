import type {WorldCollider} from './world'
// Breadth-first search on the compact walkable neighbourhood. Called only when guidance is requested.
export function walkingPath(px:number,pz:number,tx:number,tz:number,solids:WorldCollider[]){
  const left=-18,top=-27,width=37,height=53
  const idx=(x:number,z:number)=>(z-top)*width+x-left
  const start=idx(Math.round(px),Math.round(pz)),goal=idx(Math.round(tx),Math.round(tz))
  const parent=new Int16Array(width*height).fill(-1),queue=[start];parent[start]=start
  for(let i=0;i<queue.length&&parent[goal]===-1;i++){
    const n=queue[i],x=left+n%width,z=top+Math.floor(n/width)
    for(const [sx,sz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const a=x+sx,b=z+sz,k=idx(a,b)
      if(a<left||a>=left+width||b<top||b>=top+height||parent[k]!==-1)continue
      if(solids.some(s=>Math.abs(a-s.x)<s.w/2+.4&&Math.abs(b-s.z)<s.d/2+.4))continue
      parent[k]=n;queue.push(k)
    }
  }
  if(parent[goal]===-1)return []
  const full:{x:number;z:number}[]=[]
  for(let n=goal;n!==start;n=parent[n])full.push({x:left+n%width,z:top+Math.floor(n/width)})
  full.reverse()
  return full.filter((p,i)=>{const a=full[i-1],b=full[i+1];return !a||!b||(a.x!==b.x&&a.z!==b.z)})
}

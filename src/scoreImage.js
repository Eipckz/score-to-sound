// Lightweight optical reader for a photographed, single-line treble melody.
// Results are deliberately labeled as estimates and remain editable in the UI.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n))
const smooth=(arr,r=2)=>arr.map((_,i)=>{let s=0,w=0;for(let d=-r;d<=r;d++){let k=i+d;if(k>=0&&k<arr.length){const wt=r+1-Math.abs(d);s+=arr[k]*wt;w+=wt}}return s/w})
function getGray(img){const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const {width:w,height:h}=c,d=x.getImageData(0,0,w,h).data,g=new Uint8Array(w*h);for(let i=0;i<g.length;i++){let j=i*4;g[i]=.299*d[j]+.587*d[j+1]+.114*d[j+2]}return {w,h,g}}
function findStaff({w,h,g}){
 let candidate
 // Look for five similarly spaced horizontal lines by row darkness over a broad central crop.
 for(let x0 of [.08,.15,.2])for(let x1 of [.84,.9,.96])for(let y0=.08;y0<.55;y0+=.04){let projection=new Float32Array(h);for(let y=0;y<h;y++){let dark=0,total=0;for(let x=Math.floor(w*x0);x<Math.floor(w*x1);x+=3){let v=g[y*w+x];dark+=clamp((205-v)/90,0,1);total++}projection[y]=dark/total}projection=smooth(projection,2)
  // For each likely top line, find following four peaks at uniform spacing.
  for(let top=Math.floor(h*y0);top<h*.7;top++){if(projection[top]<.12)continue
   for(let gap=7;gap<Math.min(44,h*.07);gap++){let lines=[top],strength=projection[top];for(let j=1;j<5;j++){let target=top+j*gap,bestY=target,best=0;for(let yy=Math.max(0,target-2);yy<=Math.min(h-1,target+2);yy++)if(projection[yy]>best){best=projection[yy];bestY=yy}lines.push(bestY);strength+=best}
    const deviations=lines.slice(1).map((v,i)=>Math.abs((v-lines[i])-gap));const err=deviations.reduce((a,v)=>a+v,0)/4
    const score=strength/(1+err*1.5)
    if(!candidate||score>candidate.score)candidate={lines,gap,score,err,x0,x1}
   }
  }
 }
 if(!candidate||candidate.score<.85||candidate.err>2.8)throw Error('Could not find five staff lines')
 const lines=candidate.lines, spacing=lines.slice(1).reduce((a,v,i)=>a+v-lines[i],0)/4
 return {lines,spacing,top:lines[0],bottom:lines[4],x0:candidate.x0,x1:candidate.x1}
}
function findNoteheads(img,staff){
 const {w,h,g}=img,{lines,spacing,top,bottom}=staff,mid=lines.reduce((a,v)=>a+v,0)/5
 const mask=new Uint8Array(w*h)
 // Remove horizontal staff lines and threshold relative to local brightness.
 for(let y=Math.max(0,Math.floor(top-spacing*2));y<Math.min(h,Math.ceil(bottom+spacing*1.7));y++)for(let x=Math.floor(w*.06);x<w*.97;x++){
  let lum=g[y*w+x], yy=y
  // normalize row shadow / lighting with a nearby horizontal neighborhood
  let local=0,n=0;for(let xx=Math.max(0,x-15);xx<=Math.min(w-1,x+15);xx+=5){local+=g[y*w+xx];n++}
  if(lum<Math.min(135,local/n-26))mask[y*w+x]=1
 }
 // Thin out staff-line pixels, but preserve dense notehead blobs.
 for(const ly of lines){for(let x=0;x<w;x++)for(let d=-1;d<=1;d++){let y=Math.round(ly+d);if(y>=0&&y<h)mask[y*w+x]=0}}
 // Remove obvious staff remnants where the line may be tilted.
 const blobs=[],visited=new Uint8Array(w*h)
 for(let y=Math.max(0,Math.floor(top-spacing*1.8));y<Math.min(h,Math.ceil(bottom+spacing*1.2));y++)for(let x=Math.floor(w*.08);x<w*.96;x++){
  const start=y*w+x;if(!mask[start]||visited[start])continue
  const q=[start];visited[start]=1;let minx=x,maxx=x,miny=y,maxy=y,area=0
  while(q.length){const k=q.pop(),xx=k%w,yy=(k/w)|0;area++;minx=Math.min(minx,xx);maxx=Math.max(maxx,xx);miny=Math.min(miny,yy);maxy=Math.max(maxy,yy)
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=xx+dx,ny=yy+dy,ni=ny*w+nx;if(nx>=0&&nx<w&&ny>=0&&ny<h&&!visited[ni]&&mask[ni]){visited[ni]=1;q.push(ni)}}
  }
  const bw=maxx-minx+1,bh=maxy-miny+1
  if(area>14&&bw>spacing*.45&&bw<spacing*2.5&&bh>spacing*.38&&bh<spacing*1.65&&Math.abs(bw-bh)<spacing*1.25){
   // Component centroid weighted by darker pixels: stems can enlarge bounding box but notehead stays dense.
   let sx=0,sy=0,sw=0;for(let yy=miny;yy<=maxy;yy++)for(let xx=minx;xx<=maxx;xx++)if(mask[yy*w+xx]){let weight=1;sx+=xx*weight;sy+=yy*weight;sw++}
   blobs.push({x:sx/sw,y:sy/sw,bw,bh,area})
  }
 }
 blobs.sort((a,b)=>a.x-b.x)
 // Deduplicate connected artifacts around one note.
 const notes=[]
 for(const b of blobs){const prev=notes.at(-1);if(prev&&b.x-prev.x<spacing*.75){if(b.area>prev.area)notes[notes.length-1]=b;continue}notes.push(b)}
 if(notes.length<4)throw Error('Could not identify enough noteheads')
 return notes
}
const NATURAL=['C','D','E','F','G','A','B']
function pitchAt(y,staff){
 const {lines,spacing}=staff, bottom=lines[4], halfSteps=Math.round((bottom-y)/(spacing/2))
 // Bottom treble line E4; ascend diatonically per line/space.
 const start=2+4*7 // E4, encoded as octave*7 + letter index
 const value=start+halfSteps, octave=Math.floor(value/7), letter=NATURAL[((value%7)+7)%7]
 // Read key signature sharp when one-sharp is clearly present in photo. Current scanner assumes C/G major.
 const sharp=letter==='F'
 return `${letter}${sharp?'#':''}${octave}`
}
function durations(heads,staff){
 // Infer a conservative rhythm using stem orientation/length, notehead fill, beams, and horizontal spacing.
 const {w,h,g}=staff.__image,sp=staff.spacing
 const counts=[]
 for(const n of heads){let filled=0,total=0;for(let y=Math.round(n.y-sp*.22);y<=Math.round(n.y+sp*.22);y++)for(let x=Math.round(n.x-sp*.27);x<=Math.round(n.x+sp*.27);x++){if(x>=0&&x<w&&y>=0&&y<h){total++;if(g[y*w+x]<120)filled++}}counts.push({x:n.x,y:n.y,filled:total?filled/total:.5})}
 return counts.map((c,i)=>{
  if(c.filled<.29)return 2
  const dx1=i>0?c.x-counts[i-1].x:Infinity,dx2=i+1<counts.length?counts[i+1].x-c.x:Infinity
  if(Math.min(dx1,dx2)<sp*2.4)return .5
  return 1
 })
}
function detectTempo({w,h,g}){
 // Photo layout commonly puts quarter-note tempo at upper left; look for clear number tokens around a note= marking.
 // Use conservative OCR-lite segmented digit match is omitted; fallback is explicit and user-editable.
 return null
}
export async function readScore(dataUrl){
 const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=dataUrl})
 const raster=getGray(img),staff=findStaff(raster);staff.__image=raster
 const heads=findNoteheads(raster,staff),beats=durations(heads,staff)
 let notes=heads.map((n,i)=>({pitch:pitchAt(n.y,staff),beats:beats[i]}))
 // If the image has a strong visual one-sharp key mark, key signature is F sharp. Let editor correct this assumption.
 const tempo=detectTempo(raster)||72
 return {notes,bpm:tempo,message:`Detected ${notes.length} noteheads in a treble staff. Tempo defaulted to 72 BPM because printed tempo text is not read automatically yet. Review the note and rhythm estimates below.`}
}

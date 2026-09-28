import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Accidental } from 'vexflow'
import { AudioLines, Camera, CircleHelp, FileImage, Pause, Play, Plus, RotateCcw, ScanLine, Settings2, Sparkles, Trash2, Upload, Volume2, X } from 'lucide-react'
import './style.css'
import { readScore } from './scoreImage.js'

const DEMO = [
  { pitch:'F#5', beats:1 }, { pitch:'F#5', beats:.5 }, { pitch:'E5', beats:.5 }, { pitch:'D5', beats:1 }, { pitch:'C#5', beats:1 },
  { pitch:'B4', beats:1.5 }, { pitch:'A4', beats:.5 }, { pitch:'G4', beats:2 },
  { pitch:'rest', beats:1 }, { pitch:'F#4', beats:1 }, { pitch:'E4', beats:1 }, { pitch:'D4', beats:.5 }, { pitch:'C#4', beats:.5 }, { pitch:'B3', beats:1 }, { pitch:'C#4', beats:.5 }, { pitch:'D4', beats:.5 }, { pitch:'E4', beats:1 }
]
const NOTE_OPTIONS = ['C3','D3','E3','F#3','G3','A3','B3','C4','D4','E4','F#4','G4','A4','B4','C5','D5','E5','F#5','G5']
const durName = b => b >= 4 ? 'w' : b >= 2 ? 'h' : b >= 1 ? 'q' : b >= .5 ? '8' : '16'
const vfKey = p => p === 'rest' ? 'b/4' : `${p[0].toLowerCase()}${p.includes('#') ? '#' : ''}/${p.slice(-1)}`
const copyNotes = ns => ns.map(n=>({...n}))

function Score({ notes, playingIndex, onSeek }) {
  const host = useRef(null)
  useEffect(() => {
    const el=host.current
    if(!el) return
    el.innerHTML=''
    const width=Math.max(el.clientWidth||720, 360)
    const height=202
    const renderer=new Renderer(el,Renderer.Backends.SVG)
    renderer.resize(width,height)
    const ctx=renderer.getContext()
    ctx.setFont('Georgia', 10)
    const stave=new Stave(10,27,width-20)
    stave.addClef('treble').addKeySignature('G').addTimeSignature('4/4')
    stave.setContext(ctx).draw()
    const usable=width-155
    const perRow=width<520?9:14
    const rowCount=Math.ceil(notes.length/perRow)
    renderer.resize(width, rowCount*202)
    const context=renderer.getContext()
    for(let row=0;row<rowCount;row++){
      const rowNotes=notes.slice(row*perRow,(row+1)*perRow)
      const y=row*202+27
      const st=new Stave(10,y,width-20)
      if(row===0) st.addClef('treble').addKeySignature('G').addTimeSignature('4/4')
      else st.addClef('treble')
      st.setContext(context).draw()
      let vfNotes=rowNotes.map((n,i)=>{
        const index=row*perRow+i
        const keys=[vfKey(n.pitch)]
        const sn=new StaveNote({keys, duration:n.pitch==='rest'?`${durName(n.beats)}r`:durName(n.beats), clef:'treble', autoStem:true})
        if(n.pitch.includes('#')) sn.addModifier(new Accidental('#'),0)
        if(index===playingIndex) sn.setStyle({fillStyle:'#dc572f',strokeStyle:'#dc572f'})
        return sn
      })
      const v=new Voice({numBeats:Math.max(1,Math.ceil(rowNotes.reduce((a,n)=>a+n.beats,0))),beatValue:4}).setStrict(false).addTickables(vfNotes)
      new Formatter().joinVoices([v]).format([v],width-175)
      v.draw(context,st)
      vfNotes.forEach((n,i)=>{
        const box=n.getBoundingBox()
        if(box) {
          const target=document.createElementNS('http://www.w3.org/2000/svg','rect')
          target.setAttribute('x',box.getX()-4); target.setAttribute('y',box.getY()-7); target.setAttribute('width',box.getW()+8); target.setAttribute('height',box.getH()+14); target.setAttribute('fill','transparent'); target.setAttribute('class','note-hit')
          target.addEventListener('click',()=>onSeek(row*perRow+i))
          el.querySelector('svg')?.appendChild(target)
        }
      })
    }
  },[notes,playingIndex,onSeek])
  return <div className="score-window"><div ref={host} className="score-svg"/></div>
}

function App(){
 const [notes,setNotes]=useState(copyNotes(DEMO)); const [bpm,setBpm]=useState(72); const [image,setImage]=useState(null); const [fileName,setFileName]=useState(''); const [playing,setPlaying]=useState(false); const [playingIndex,setPlayingIndex]=useState(-1); const [mode,setMode]=useState('demo'); const [scanMessage,setScanMessage]=useState(''); const [scanBusy,setScanBusy]=useState(false); const [showHelp,setShowHelp]=useState(false); const [tone,setTone]=useState('piano'); const [volume,setVolume]=useState(.55); const [quickOctave,setQuickOctave]=useState(4); const [quickDuration,setQuickDuration]=useState(1)
 const audioRef=useRef(null), timerRef=useRef(null), currentRef=useRef(-1), playingRef=useRef(false), inputRef=useRef(null)
 useEffect(()=>{playingRef.current=playing},[playing])
 const totalBeats=notes.reduce((sum,n)=>sum+n.beats,0)
 const duration=totalBeats*60/bpm
 const formatted=useMemo(()=>`${Math.floor(duration/60)}:${String(Math.floor(duration%60)).padStart(2,'0')}`, [duration])
 function stop(){clearTimeout(timerRef.current);playingRef.current=false;setPlaying(false);setPlayingIndex(-1);currentRef.current=-1}
 function sound(pitch, beats){
   if(pitch==='rest') return
   const ac=audioRef.current || (audioRef.current=new (window.AudioContext||window.webkitAudioContext)())
   if(ac.state==='suspended') ac.resume()
   const midi=(parseInt(pitch.slice(-1))+1)*12+({C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11}[pitch.slice(0,-1)]??0)
   const freq=440*Math.pow(2,(midi-69)/12)
   const osc=ac.createOscillator(), gain=ac.createGain()
   osc.type=tone==='organ'?'sine':tone==='bell'?'triangle':'triangle'; osc.frequency.value=freq
   gain.gain.setValueAtTime(0,ac.currentTime); gain.gain.linearRampToValueAtTime(volume*.32,ac.currentTime+.018); gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+Math.max(.08,beats*60/bpm-.035))
   osc.connect(gain);gain.connect(ac.destination);osc.start();osc.stop(ac.currentTime+beats*60/bpm)
 }
 function playFrom(index=0){stop(); if(!notes.length)return; setPlaying(true);playingRef.current=true;currentRef.current=index; const step=()=>{if(!playingRef.current)return; const i=currentRef.current;if(i>=notes.length){stop();return} setPlayingIndex(i);sound(notes[i].pitch,notes[i].beats);currentRef.current=i+1;timerRef.current=setTimeout(step,notes[i].beats*60000/bpm)};step()}
 function seek(index){if(playing)playFrom(index);else setPlayingIndex(index)}
 function updateNote(i,key,value){setNotes(old=>old.map((n,j)=>j===i?{...n,[key]:value}:n))}
 function addNote(){setNotes(n=>[...n,{pitch:'C4',beats:quickDuration}])}
 function quickAdd(pitch){setNotes(n=>[...n,{pitch,beats:quickDuration}])}
 function resetDemo(){stop();setNotes(copyNotes(DEMO));setBpm(72);setImage(null);setFileName('');setMode('demo');setScanMessage('Example loaded from your image: treble clef, one-sharp key signature, 4/4, and quarter note = 72.')}
 function loadFile(file){if(!file)return; if(!file.type.startsWith('image/')){setScanMessage('Please choose a photo or image file.');return} stop();setFileName(file.name);const reader=new FileReader();reader.onload=()=>{setImage(reader.result);setMode('scan');setScanMessage('Photo loaded. Tap “Read the music” to detect notes. For best results, crop to one flat, clearly lit staff.')} ;reader.readAsDataURL(file)}
 async function scan(){if(!image)return;setScanBusy(true);setScanMessage('Reading staff lines and noteheads…');try{
   const result=await readScore(image)
   setNotes(result.notes);setBpm(result.bpm);setScanMessage(result.message);setMode('scan-result')
 }catch(e){setScanMessage('I could not read a clear single staff from this image. Try cropping closer, taking the photo straight-on, or editing the notes below.')}finally{setScanBusy(false)}}

 return <main className="app-shell">
  <header className="topbar"><a className="brand" href="#" onClick={e=>{e.preventDefault();resetDemo()}}><span className="brand-mark"><AudioLines size={20}/></span><span>Score to Sound<span className="brand-caption">A pocket score reader</span></span></a><button className="icon-button help-button" aria-label="Help" onClick={()=>setShowHelp(true)}><CircleHelp size={21}/></button></header>
  <section className="hero"><div className="eyebrow"><span className="live-dot"/> YOUR MUSIC, PLAYED BACK</div><h1>See the notes.<br/><em>Hear the music.</em></h1><p>Take a photo of a melody and hear it back at the tempo on the page.</p></section>
  <section className="upload-card">
   <div className="section-head"><div><span className="step">01</span><h2>Bring in your music</h2></div><span className="local-tag">PRIVATE BY DESIGN</span></div>
   {!image?<button className="dropzone" onClick={()=>inputRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();loadFile(e.dataTransfer.files?.[0])}}><span className="upload-symbol"><ScanLine size={24}/></span><span className="drop-title">Upload a photo of your score</span><span className="drop-sub">JPG, PNG, or HEIC · processed on this device</span><span className="upload-cta"><Upload size={16}/> Choose photo</span></button>:<div className="photo-preview"><img src={image} alt="Uploaded score"/><div className="photo-info"><span className="photo-file"><FileImage size={15}/>{fileName}</span><button className="text-button" onClick={()=>inputRef.current?.click()}><Camera size={15}/> Change</button><button className="remove-button" aria-label="Remove photo" onClick={()=>{setImage(null);setFileName('');setMode('demo')}}><X size={17}/></button></div></div>}
   <input ref={inputRef} hidden type="file" accept="image/*" capture="environment" onChange={e=>loadFile(e.target.files?.[0])}/>
   {image&&<button className="scan-button" onClick={scan} disabled={scanBusy}><Sparkles size={17}/>{scanBusy?'Reading score…':'Read the music'}</button>}
   <div className="privacy-note"><span className="lock-dot"/> Your image stays in your browser. Nothing is uploaded.</div>
  </section>
  {scanMessage&&<div className="status-note"><span className="status-icon"><Sparkles size={15}/></span><span>{scanMessage}</span></div>}
  <section className="workspace-card">
   <div className="section-head workspace-head"><div><span className="step">02</span><h2>Check your melody</h2></div><span className="editable-tag"><span/> EDITABLE</span></div>
   <div className="score-container"><div className="score-caption"><span>MELODY PREVIEW</span><span className="clef-caption">𝄞 &nbsp; Treble · G major</span></div><Score notes={notes} playingIndex={playingIndex} onSeek={seek}/></div>
   <div className="controls"><button className="play-button" onClick={()=>playing?stop():playFrom(0)}>{playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}<span>{playing?'Pause':'Play melody'}</span></button><div className="control-divider"/><label className="tempo-control"><span>♩</span><span className="control-label">TEMPO</span><input aria-label="Tempo in beats per minute" type="number" min="30" max="240" value={bpm} onChange={e=>setBpm(Math.max(30,Math.min(240,Number(e.target.value)||30)))}/><span className="bpm">BPM</span></label><span className="duration">{formatted}</span></div>
   <div className="sound-controls"><label><Volume2 size={15}/><input type="range" min="0.1" max="1" step="0.05" value={volume} onChange={e=>setVolume(Number(e.target.value))} aria-label="Playback volume"/></label><select value={tone} onChange={e=>setTone(e.target.value)} aria-label="Instrument sound"><option value="piano">Soft piano</option><option value="organ">Organ</option><option value="bell">Bell</option></select><button className="reset-button" onClick={resetDemo}><RotateCcw size={14}/> Reset example</button></div>
  </section>
  <section className="edit-card"><div className="edit-heading"><div><span className="step">03</span><h2>Fine-tune notes</h2></div><button className="add-note" onClick={addNote}><Plus size={16}/> Add note</button></div><p className="edit-sub">Correct a scan or enter a melody with the quick keys.</p><div className="quick-entry"><div className="quick-top"><span className="quick-label">QUICK NOTE ENTRY</span><label className="quick-octave">OCTAVE <select value={quickOctave} onChange={e=>setQuickOctave(Number(e.target.value))}><option>3</option><option>4</option><option>5</option></select></label><label className="quick-rhythm">NOTE LENGTH <select value={quickDuration} onChange={e=>setQuickDuration(Number(e.target.value))}><option value="2">Half</option><option value="1">Quarter</option><option value="0.5">Eighth</option><option value="0.25">16th</option></select></label><button className="clear-notes" onClick={()=>{stop();setNotes([])}}>Clear</button></div><div className="pitch-keys">{['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((p,i)=><button key={p} className={p.includes('#')?'black-key':'white-key'} onClick={()=>quickAdd(`${p}${quickOctave}`)}>{p.replace('#','♯')}</button>)}<button className="rest-key" onClick={()=>quickAdd('rest')}>Rest</button></div></div><div className="note-list">{notes.map((n,i)=><div key={i} className={`note-row ${i===playingIndex?'active':''}`}><span className="note-index">{String(i+1).padStart(2,'0')}</span><select value={n.pitch} onChange={e=>updateNote(i,'pitch',e.target.value)} aria-label={`Note ${i+1} pitch`}><option value="rest">Rest</option>{NOTE_OPTIONS.map(p=><option key={p} value={p}>{p.replace('#','♯')}</option>)}</select><select value={n.beats} onChange={e=>updateNote(i,'beats',Number(e.target.value))} aria-label={`Note ${i+1} duration`}><option value="4">Whole · 4 beats</option><option value="2">Half · 2 beats</option><option value="1.5">Dotted quarter · 1½ beats</option><option value="1">Quarter · 1 beat</option><option value="0.75">Dotted eighth · ¾ beat</option><option value="0.5">Eighth · ½ beat</option><option value="0.25">Sixteenth · ¼ beat</option></select><button className="delete-note" aria-label={`Delete note ${i+1}`} onClick={()=>setNotes(old=>old.filter((_,j)=>i!==j))}><Trash2 size={16}/></button></div>)}</div></section>
  <footer><span>Made for practice rooms, rehearsal breaks, and curious ears.</span><button onClick={()=>setShowHelp(true)}>How it works</button></footer>
  {showHelp&&<div className="modal-backdrop" onClick={()=>setShowHelp(false)}><div className="help-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowHelp(false)}><X size={19}/></button><div className="modal-icon"><Settings2 size={21}/></div><h2>A helpful first reading</h2><p>This app reads one clear, single-line melody in treble clef. It estimates pitches and note lengths from the staff, then looks for a printed tempo marking.</p><p>Music photos can be tricky: lighting, perspective, beams, ties, key signatures, and accidental marks all affect recognition. Review the editable note list before relying on playback. Tempo text is not read automatically yet, so enter the printed BPM yourself.</p><p>Your photo is processed in this browser and is never sent to a server. Bass clef, chords, and multiple staves are not supported yet.</p><button className="modal-done" onClick={()=>setShowHelp(false)}>Got it</button></div></div>}
 </main>
}


createRoot(document.getElementById('root')).render(<App/>)

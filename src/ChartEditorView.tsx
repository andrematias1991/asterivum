import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Circle, Download, Eraser, Highlighter, Maximize2, MousePointer2, Pencil, Printer, Redo2, Save, Slash, Square, Trash2, Type, Undo2 } from 'lucide-react';
import { api } from './api';
import ChartWheel from './ChartWheel';
import { useI18n } from './i18n';
import type { AnnotationContext, AnnotationPoint, AnnotationSession, Chart, ChartAnnotation, Profile, SynastryResult } from './types';

type Tool='SELECT'|'PEN'|'HIGHLIGHTER'|'LINE'|'ARROW'|'RECTANGLE'|'ELLIPSE'|'TEXT'|'ERASER';
const toolItems:[Tool,typeof MousePointer2,string][]=[
  ['SELECT',MousePointer2,'Select / move'],['PEN',Pencil,'Pen'],['HIGHLIGHTER',Highlighter,'Highlighter'],['LINE',Slash,'Line'],
  ['ARROW',ArrowUpRight,'Arrow'],['RECTANGLE',Square,'Rectangle'],['ELLIPSE',Circle,'Ellipse'],['TEXT',Type,'Text'],['ERASER',Eraser,'Eraser'],
];
const id=()=>`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const point=(event:React.PointerEvent<SVGElement>):AnnotationPoint=>{
  const svg=event.currentTarget instanceof SVGSVGElement?event.currentTarget:event.currentTarget.ownerSVGElement!;
  const rect=svg.getBoundingClientRect();
  return {x:Math.max(0,Math.min(560,(event.clientX-rect.left)*560/rect.width)),y:Math.max(0,Math.min(560,(event.clientY-rect.top)*560/rect.height))};
};
const moveAnnotation=(annotation:ChartAnnotation,dx:number,dy:number):ChartAnnotation=>{
  const move=(p:AnnotationPoint)=>({x:Math.max(0,Math.min(560,p.x+dx)),y:Math.max(0,Math.min(560,p.y+dy))});
  if('points'in annotation)return {...annotation,points:annotation.points.map(move)};
  if('position'in annotation)return {...annotation,position:move(annotation.position)};
  return {...annotation,start:move(annotation.start),end:move(annotation.end)};
};

export default function ChartEditorView({profiles}:{profiles:Profile[]}) {
  const {t}=useI18n();
  const [context,setContext]=useState<AnnotationContext>({profileId:profiles[0]?.id||0,mode:'NATAL'});
  const [chart,setChart]=useState<Chart|null>(null),[loading,setLoading]=useState(false);
  const [annotations,setAnnotations]=useState<ChartAnnotation[]>([]),[undo,setUndo]=useState<ChartAnnotation[][]>([]),[redo,setRedo]=useState<ChartAnnotation[][]>([]);
  const [tool,setTool]=useState<Tool>('PEN'),[color,setColor]=useState('#b1324d'),[width,setWidth]=useState(3),[textValue,setTextValue]=useState('Note');
  const [drawing,setDrawing]=useState<ChartAnnotation|null>(null),[selectedId,setSelectedId]=useState<string|null>(null),[dragOrigin,setDragOrigin]=useState<AnnotationPoint|null>(null);
  const [sessions,setSessions]=useState<AnnotationSession[]>([]),[sessionId,setSessionId]=useState<number|null>(null),[title,setTitle]=useState(t('Teaching notes'));
  const [notice,setNotice]=useState(''),[error,setError]=useState('');
  const workspace=useRef<HTMLDivElement>(null);
  const dragSnapshot=useRef<ChartAnnotation[]|null>(null);
  const profile=profiles.find(item=>item.id===context.profileId);
  const second=profiles.find(item=>item.id===context.secondProfileId);

  const loadSessions=()=>context.profileId&&api<{annotations:AnnotationSession[]}>(`/annotations?profileId=${context.profileId}`).then(r=>setSessions(r.annotations));
  useEffect(()=>{void loadSessions();},[context.profileId]);
  useEffect(()=>{
    if(!profile)return;setLoading(true);setError('');
    const promise=context.mode==='SYNASTRY'&&context.secondProfileId
      ?api<SynastryResult>(`/synastry?firstId=${context.profileId}&secondId=${context.secondProfileId}`).then(r=>r.chart)
      :api<{chart:Chart}>(`/charts/${context.profileId}?mode=${context.mode}&date=${context.targetDate||new Date().toISOString()}`).then(r=>r.chart);
    promise.then(setChart).catch(e=>setError((e as Error).message)).finally(()=>setLoading(false));
  },[context.profileId,context.secondProfileId,context.mode,context.targetDate]);
  const commit=(next:ChartAnnotation[])=>{setUndo(history=>[...history.slice(-49),annotations]);setAnnotations(next);setRedo([]);};
  const undoOnce=()=>{const previous=undo.at(-1);if(!previous)return;setRedo(history=>[annotations,...history].slice(0,50));setAnnotations(previous);setUndo(undo.slice(0,-1));};
  const redoOnce=()=>{const next=redo[0];if(!next)return;setUndo(history=>[...history,annotations].slice(-50));setAnnotations(next);setRedo(redo.slice(1));};
  const selectSession=async(value:string)=>{
    if(!value){setSessionId(null);setAnnotations([]);setUndo([]);setRedo([]);return;}
    const result=await api<{annotation:AnnotationSession}>(`/annotations/${value}`);const session=result.annotation;
    setSessionId(session.id);setTitle(session.title);setContext(session.chartContext);setAnnotations(session.annotations||[]);setUndo([]);setRedo([]);
  };
  const save=async()=>{
    if(!profile)return;setError('');
    try{const body=JSON.stringify({title,context,annotations});if(sessionId)await api(`/annotations/${sessionId}`,{method:'PUT',body});else{const result=await api<{id:number}>('/annotations',{method:'POST',body});setSessionId(result.id);}await loadSessions();setNotice(t('Annotation session saved'));window.setTimeout(()=>setNotice(''),2500);}
    catch(e){setError((e as Error).message);}
  };
  const onDown=(event:React.PointerEvent<SVGSVGElement>)=>{
    const p=point(event);event.currentTarget.setPointerCapture(event.pointerId);
    if(tool==='TEXT'){if(textValue.trim())commit([...annotations,{id:id(),type:'TEXT',position:p,text:textValue.trim(),color,size:Math.max(12,width*5)}]);return;}
    if(tool==='SELECT'){if(selectedId)setDragOrigin(p);return;}
    if(tool==='ERASER')return;
    if(tool==='PEN'||tool==='HIGHLIGHTER')setDrawing({id:id(),type:tool,points:[p,p],color,width:tool==='HIGHLIGHTER'?Math.max(10,width*4):width});
    else setDrawing({id:id(),type:tool,start:p,end:p,color,width} as ChartAnnotation);
  };
  const onMove=(event:React.PointerEvent<SVGSVGElement>)=>{
    const p=point(event);
    if(tool==='SELECT'&&dragOrigin&&selectedId){const dx=p.x-dragOrigin.x,dy=p.y-dragOrigin.y;setAnnotations(current=>current.map(item=>item.id===selectedId?moveAnnotation(item,dx,dy):item));setDragOrigin(p);return;}
    if(!drawing)return;
    if('points'in drawing)setDrawing({...drawing,points:[...drawing.points,p]});
    else if('start'in drawing)setDrawing({...drawing,end:p});
  };
  const onUp=()=>{if(drawing){commit([...annotations,drawing]);setDrawing(null);}if(dragOrigin){setDragOrigin(null);if(dragSnapshot.current)setUndo(history=>[...history.slice(-49),dragSnapshot.current!]);dragSnapshot.current=null;setRedo([]);}};
  const all=useMemo(()=>drawing?[...annotations,drawing]:annotations,[annotations,drawing]);
  const shape=(item:ChartAnnotation)=>{
    const common={stroke:item.color,strokeWidth:'width'in item?item.width:1,fill:'none',strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
    if('points'in item)return <polyline points={item.points.map(p=>`${p.x},${p.y}`).join(' ')} {...common} opacity={item.type==='HIGHLIGHTER'?.3:1}/>;
    if('position'in item)return <text x={item.position.x} y={item.position.y} fill={item.color} fontSize={item.size} fontWeight="600" paintOrder="stroke" stroke="#fffdf8" strokeWidth="2">{item.text}</text>;
    if(item.type==='RECTANGLE')return <rect x={Math.min(item.start.x,item.end.x)} y={Math.min(item.start.y,item.end.y)} width={Math.abs(item.end.x-item.start.x)} height={Math.abs(item.end.y-item.start.y)} {...common}/>;
    if(item.type==='ELLIPSE')return <ellipse cx={(item.start.x+item.end.x)/2} cy={(item.start.y+item.end.y)/2} rx={Math.abs(item.end.x-item.start.x)/2} ry={Math.abs(item.end.y-item.start.y)/2} {...common}/>;
    if(item.type==='ARROW')return <><defs><marker id={`annotation-arrow-${item.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={item.color}/></marker></defs><line x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} {...common} markerEnd={`url(#annotation-arrow-${item.id})`}/></>;
    return <line x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} {...common}/>;
  };
  const exportPdf=async()=>{
    if(!chart||!profile||!workspace.current)return;
    const source=workspace.current.querySelector('.chart-wheel') as SVGSVGElement|null;
    const overlay=workspace.current.querySelector('.annotation-overlay') as SVGSVGElement|null;
    if(!source||!overlay)return;
    const combined=source.cloneNode(true) as SVGSVGElement;
    Array.from(overlay.children).forEach(child=>combined.appendChild(child.cloneNode(true)));
    combined.style.position='fixed';combined.style.left='-10000px';combined.style.width='1000px';document.body.appendChild(combined);
    try{const {exportChartPdf}=await import('./pdfExports');await exportChartPdf({...profile,name:second?`${profile.name} + ${second.name}`:profile.name},chart,combined);}finally{combined.remove();}
  };

  if(!profiles.length)return <div className="empty"><Pencil/><h3>{t('Add a birth profile first')}</h3></div>;
  return <div className="chart-editor-page">
    <header className="page-head compact"><div><p className="eyebrow">{t('Teaching workspace')}</p><h1>{t('Chart annotation editor')}</h1><p className="muted">{t('Draw, explain and save private teaching layers without changing the calculated chart.')}</p></div><div className="head-controls"><button className="ghost" disabled={!chart} onClick={()=>window.print()}><Printer size={16}/>{t('Print')}</button><button className="ghost" disabled={!chart} onClick={()=>void exportPdf()}><Download size={16}/>{t('Export PDF')}</button><button className="primary" onClick={()=>void save()}><Save size={16}/>{t('Save')}</button></div></header>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
    <section className="editor-context no-print">
      <label>{t('Saved session')}<select value={sessionId||''} onChange={e=>void selectSession(e.target.value)}><option value="">{t('New annotation session')}</option>{sessions.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>{t('Title')}<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>{t('Profile')}<select value={context.profileId} onChange={e=>{const profileId=Number(e.target.value);setContext({...context,profileId,secondProfileId:context.mode==='SYNASTRY'?profiles.find(item=>item.id!==profileId)?.id:undefined});setSessionId(null);setAnnotations([]);}}>{profiles.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>{t('Chart')}<select value={context.mode} onChange={e=>setContext({...context,mode:e.target.value as AnnotationContext['mode'],secondProfileId:e.target.value==='SYNASTRY'?(profiles.find(item=>item.id!==context.profileId)?.id):undefined})}><option value="NATAL">{t('Natal')}</option><option value="TRANSIT">{t('Transit')}</option><option value="PROGRESSION">{t('Progression')}</option><option value="SYNASTRY" disabled={profiles.length<2}>{t('Synastry')}</option></select></label>
      {context.mode==='SYNASTRY'&&<label>{t('Person B')}<select value={context.secondProfileId||''} onChange={e=>setContext({...context,secondProfileId:Number(e.target.value)})}>{profiles.filter(item=>item.id!==context.profileId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {(context.mode==='TRANSIT'||context.mode==='PROGRESSION')&&<label>{t('Target date')}<input type="date" value={(context.targetDate||new Date().toISOString()).slice(0,10)} onChange={e=>setContext({...context,targetDate:`${e.target.value}T12:00:00.000Z`})}/></label>}
    </section>
    <div className="editor-layout">
      <aside className="editor-tools no-print">
        <div className="tool-grid">{toolItems.map(([value,Icon,label])=><button key={value} className={tool===value?'active':''} onClick={()=>setTool(value)} title={t(label)}><Icon size={18}/><span>{t(label)}</span></button>)}</div>
        <label>{t('Colour')}<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label>{t('Width')}<input type="range" min="1" max="12" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label>
        {tool==='TEXT'&&<label>{t('Text')}<input value={textValue} onChange={e=>setTextValue(e.target.value)} maxLength={240}/></label>}
        <div className="editor-history"><button className="ghost" onClick={undoOnce} disabled={!undo.length}><Undo2 size={15}/>{t('Undo')}</button><button className="ghost" onClick={redoOnce} disabled={!redo.length}><Redo2 size={15}/>{t('Redo')}</button></div>
        <button className="ghost wide danger" onClick={()=>annotations.length&&commit([])} disabled={!annotations.length}><Trash2 size={15}/>{t('Clear layer')}</button>
        <p className="hint">{t('Select a mark to move it. Use Eraser and tap a mark to remove it.')}</p>
      </aside>
      <section ref={workspace} className="annotation-workspace">
        <button className="editor-fullscreen icon-btn no-print" onClick={()=>workspace.current?.requestFullscreen()} title={t('Full screen')}><Maximize2/></button>
        {loading?<div className="loading">{t('Calculating the sky…')}</div>:chart&&<div className="annotation-stage"><ChartWheel chart={chart}/><svg className={`annotation-overlay tool-${tool.toLowerCase()}`} viewBox="0 0 560 560" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {all.map(item=><g key={item.id} className={selectedId===item.id?'annotation-selected':''} onPointerDown={event=>{if(tool==='SELECT'){event.stopPropagation();setSelectedId(item.id);dragSnapshot.current=annotations;setDragOrigin(point(event));}else if(tool==='ERASER'){event.stopPropagation();commit(annotations.filter(value=>value.id!==item.id));}}}>{shape(item)}{'start'in item&&item.type==='ELLIPSE'?<ellipse className="annotation-hit" cx={(item.start.x+item.end.x)/2} cy={(item.start.y+item.end.y)/2} rx={Math.abs(item.end.x-item.start.x)/2} ry={Math.abs(item.end.y-item.start.y)/2}/>:<path className="annotation-hit" d={'points'in item?`M${item.points.map(p=>`${p.x},${p.y}`).join(' L')}`:'position'in item?`M${item.position.x-8},${item.position.y-20}h${Math.max(30,item.text.length*item.size*.55)}v${item.size+8}h-${Math.max(30,item.text.length*item.size*.55)}z`:item.type==='RECTANGLE'?`M${item.start.x},${item.start.y}L${item.end.x},${item.start.y}L${item.end.x},${item.end.y}L${item.start.x},${item.end.y}z`:`M${item.start.x},${item.start.y}L${item.end.x},${item.end.y}`}/>}</g>)}
        </svg></div>}
      </section>
    </div>
  </div>;
}

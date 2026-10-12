(() => {
  'use strict';

  const STORAGE_KEY = 'flowos-logic-mvp-v1';
  const NODE_W = 220;
  const NODE_H = 94;
  const JUNCTOR_SIZE = 30;
  const svgNS = 'http://www.w3.org/2000/svg';

  const classOptions = [
    { value: 'White', domain: 'Colors', label: 'White / generic', fill: '#ffffff' },
    { value: 'Red', domain: 'Colors', label: 'Red', fill: '#ffe5e2' },
    { value: 'Green', domain: 'Colors', label: 'Green', fill: '#e6f5ea' },
    { value: 'Blue', domain: 'Colors', label: 'Blue', fill: '#e7f0ff' },
    { value: 'Undesirable Effect', domain: 'Effects-Based Planning', label: 'Undesirable Effect', fill: '#ffe7e4' },
    { value: 'Desirable Effect', domain: 'Effects-Based Planning', label: 'Desirable Effect', fill: '#e6f5ea' },
    { value: 'Action', domain: 'Effects-Based Planning', label: 'Action', fill: '#e7f0ff' },
    { value: 'Objective', domain: 'Prerequisite Tree', label: 'Objective', fill: '#efe8ff' },
    { value: 'Necessary Condition', domain: 'Prerequisite Tree', label: 'Necessary Condition', fill: '#fff7d6' },
    { value: 'Milestone', domain: 'Prerequisite Tree', label: 'Milestone', fill: '#e9f7f7' },
    { value: 'Obstacle', domain: 'Prerequisite Tree', label: 'Obstacle', fill: '#ffe9d9' },
    { value: 'Intermediate Objective', domain: 'Prerequisite Tree', label: 'Intermediate Objective', fill: '#edf1ff' }
  ];

  const el = id => document.getElementById(id);
  const canvas = el('canvas');
  const viewport = el('viewport');
  const edgeLayer = el('edgeLayer');
  const nodeLayer = el('nodeLayer');

  let model = newBlankModel();
  let selectedNodeId = null;
  let selectedEdgeId = null;
  let selectedJunctorId = null;
  let connectMode = false;
  let connectSourceId = null;
  let camera = { x: 0, y: 0, scale: 1 };
  let pointerState = new Map();
  let gesture = null;
  let saveTimer = null;

  function newBlankModel() {
    return {
      document: {
        title: 'Untitled Logic',
        annotation: '',
        diagram_type: 'GENERIC',
        orientation: 'Bottom to Top',
        compactness: 'Comfortable',
        entity_operator: 'AND',
        default_junctor_operator: 'OR'
      },
      document_attributes: {},
      entities: [],
      junctors: [],
      groups: [],
      edges: [],
      export_metadata: {
        exporter: 'FlowOS Logic MVP',
        purpose: 'Mobile logic capture and RIT/Flying Logic interchange',
        counts: { entities: 0, junctors: 0, groups: 0, edges: 0 }
      },
      format: 'P3_FLYING_LOGIC_EXCHANGE',
      version: '0.3',
      bridge_profile: 'RIT_FL_BRIDGE_1.0'
    };
  }

  function uid(prefix) {
    const raw = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`)
      .replaceAll('-', '_');
    return `MOB_${prefix}_${raw}`;
  }

  function normalizeModel(data) {
    if (!data || typeof data !== 'object') throw new Error('JSON root must be an object.');
    if (data.format !== 'P3_FLYING_LOGIC_EXCHANGE') throw new Error('This is not P3_FLYING_LOGIC_EXCHANGE JSON.');
    data.version = data.version || '0.3';
    data.bridge_profile = data.bridge_profile || 'RIT_FL_BRIDGE_1.0';
    data.document = data.document || {};
    data.document.title = data.document.title || 'Imported Logic';
    data.document.diagram_type = data.document.diagram_type || 'GENERIC';
    data.document.orientation = data.document.orientation || 'Bottom to Top';
    data.document.compactness = data.document.compactness || 'Comfortable';
    data.document.entity_operator = data.document.entity_operator || 'AND';
    data.document.default_junctor_operator = data.document.default_junctor_operator || 'OR';
    data.document_attributes = data.document_attributes || {};
    data.entities = Array.isArray(data.entities) ? data.entities : [];
    data.junctors = Array.isArray(data.junctors) ? data.junctors : [];
    data.groups = Array.isArray(data.groups) ? data.groups : [];
    data.edges = Array.isArray(data.edges) ? data.edges : [];
    data.export_metadata = data.export_metadata || {};
    const hadStoredLayout = hasAnyStoredLayout(data);
    data.entities.forEach((n, i) => normalizeEntity(n, i));
    data.junctors.forEach((j, i) => normalizeJunctor(j, i));
    data.edges.forEach((e, i) => {
      e.id = e.id || uid('X');
      e.annotation = e.annotation ?? '';
      e.weight = Number.isFinite(Number(e.weight)) ? Number(e.weight) : 1;
      e.is_back_edge = Boolean(e.is_back_edge);
      e.attributes = e.attributes || {};
    });
    ensureUniqueIDs(data);
    if (!hadStoredLayout) autoLayout(data, false);
    updateCounts(data);
    return data;
  }

  function normalizeEntity(n, i) {
    n.id = n.id || uid('E');
    n.title = n.title || `Statement ${i + 1}`;
    n.class = n.class || 'White';
    n.confidence = Number.isFinite(Number(n.confidence)) ? Number(n.confidence) : 0.5;
    n.annotation = n.annotation ?? '';
    n.attributes = n.attributes || {};
    if (!n.attributes.FL_DOMAIN) n.attributes.FL_DOMAIN = domainForClass(n.class);
    if (!n.attributes.P3_ID_SOURCE) n.attributes.P3_ID_SOURCE = 'mobile_uuid';
    if (!Number.isFinite(Number(n.attributes.FLOWOS_MOBILE_X))) n.attributes.FLOWOS_MOBILE_X = 260 + (i % 4) * 260;
    if (!Number.isFinite(Number(n.attributes.FLOWOS_MOBILE_Y))) n.attributes.FLOWOS_MOBILE_Y = 180 + Math.floor(i / 4) * 160;
  }

  function normalizeJunctor(j, i) {
    j.id = j.id || uid('J');
    j.operator = (j.operator || 'AND').toUpperCase();
    j.confidence = Number.isFinite(Number(j.confidence)) ? Number(j.confidence) : 0.5;
    j.annotation = j.annotation ?? '';
    j.attributes = j.attributes || {};
    if (!j.attributes.P3_ID_SOURCE) j.attributes.P3_ID_SOURCE = 'mobile_uuid';
    if (!Number.isFinite(Number(j.attributes.FLOWOS_MOBILE_X))) j.attributes.FLOWOS_MOBILE_X = 420 + (i % 4) * 260;
    if (!Number.isFinite(Number(j.attributes.FLOWOS_MOBILE_Y))) j.attributes.FLOWOS_MOBILE_Y = 260 + Math.floor(i / 4) * 160;
  }

  function ensureUniqueIDs(data) {
    const seen = new Set();
    for (const obj of [...data.entities, ...data.junctors, ...data.groups, ...data.edges]) {
      if (!obj.id) continue;
      if (seen.has(obj.id)) throw new Error(`Duplicate ID: ${obj.id}`);
      seen.add(obj.id);
    }
  }

  function hasAnyStoredLayout(data) {
    return data.entities.some(n => Number.isFinite(Number(n.attributes?.FLOWOS_MOBILE_X))) ||
      data.junctors.some(j => Number.isFinite(Number(j.attributes?.FLOWOS_MOBILE_X)));
  }

  function updateCounts(target = model) {
    target.export_metadata = target.export_metadata || {};
    target.export_metadata.exporter = 'FlowOS Logic MVP';
    target.export_metadata.purpose = 'Mobile logic capture and RIT/Flying Logic interchange';
    target.export_metadata.counts = {
      entities: target.entities.length,
      junctors: target.junctors.length,
      groups: target.groups.length,
      edges: target.edges.length
    };
  }

  function scheduleSave() {
    updateCounts();
    el('saveStatus').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
        el('saveStatus').textContent = 'Saved locally';
      } catch (err) {
        el('saveStatus').textContent = 'Save failed';
        toast('Local save failed. Export JSON to protect your work.');
      }
    }, 180);
  }

  function loadSaved() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try { model = normalizeModel(JSON.parse(raw)); }
    catch { localStorage.removeItem(STORAGE_KEY); model = newBlankModel(); }
  }

  function nodePosition(id) {
    const n = model.entities.find(x => x.id === id) || model.junctors.find(x => x.id === id);
    if (!n) return null;
    return { x: Number(n.attributes?.FLOWOS_MOBILE_X || 0), y: Number(n.attributes?.FLOWOS_MOBILE_Y || 0) };
  }

  function setNodePosition(id, x, y) {
    const n = model.entities.find(x => x.id === id) || model.junctors.find(x => x.id === id);
    if (!n) return;
    n.attributes = n.attributes || {};
    n.attributes.FLOWOS_MOBILE_X = Math.round(x * 10) / 10;
    n.attributes.FLOWOS_MOBILE_Y = Math.round(y * 10) / 10;
  }

  function domainForClass(className) {
    return classOptions.find(x => x.value === className)?.domain || 'Colors';
  }

  function fillForClass(className) {
    return classOptions.find(x => x.value === className)?.fill || '#ffffff';
  }

  function classLabel(className) {
    return classOptions.find(x => x.value === className)?.label || className || 'Statement';
  }

  function addEntity(title = 'New statement', x = null, y = null) {
    const center = screenToWorld(innerWidth / 2, innerHeight / 2);
    const entity = {
      id: uid('E'),
      title,
      class: 'White',
      confidence: 0.5,
      annotation: '',
      attributes: {
        FL_DOMAIN: 'Colors',
        P3_ID_SOURCE: 'mobile_uuid',
        FLOWOS_MOBILE_X: x ?? center.x,
        FLOWOS_MOBILE_Y: y ?? center.y
      }
    };
    model.entities.push(entity);
    scheduleSave();
    render();
    selectNode(entity.id, true);
    openNodeSheet(entity.id);
    return entity;
  }

  function duplicateEntity(id) {
    const source = model.entities.find(x => x.id === id);
    if (!source) return;
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = uid('E');
    copy.title = `${source.title} copy`;
    copy.attributes.P3_ID_SOURCE = 'mobile_uuid';
    copy.attributes.FLOWOS_MOBILE_X = Number(source.attributes.FLOWOS_MOBILE_X || 0) + 28;
    copy.attributes.FLOWOS_MOBILE_Y = Number(source.attributes.FLOWOS_MOBILE_Y || 0) + 28;
    model.entities.push(copy);
    scheduleSave(); render(); selectNode(copy.id, true); openNodeSheet(copy.id);
  }

  function deleteEntity(id) {
    model.entities = model.entities.filter(x => x.id !== id);
    model.edges = model.edges.filter(e => e.from !== id && e.to !== id);
    for (const group of model.groups) group.children = (group.children || []).filter(child => child !== id);
    selectedNodeId = null;
    connectSourceId = connectSourceId === id ? null : connectSourceId;
    pruneOrphanJunctors();
    scheduleSave(); render(); closeSheets();
  }

  function pruneOrphanJunctors() {
    const used = new Set(model.edges.flatMap(e => [e.from, e.to]));
    const orphanIDs = new Set(model.junctors.filter(j => !used.has(j.id)).map(j => j.id));
    if (!orphanIDs.size) return;
    model.junctors = model.junctors.filter(j => !orphanIDs.has(j.id));
    for (const group of model.groups) group.children = (group.children || []).filter(child => !orphanIDs.has(child));
  }

  function addEdge(from, to) {
    if (!from || !to || from === to) return false;
    if (model.edges.some(e => e.from === from && e.to === to)) {
      toast('That connection already exists.'); return false;
    }
    model.edges.push({
      id: uid('X'), from, to, annotation: '', weight: 1, is_back_edge: false,
      attributes: { P3_ID_SOURCE: 'mobile_uuid' }
    });
    scheduleSave(); render();
    return true;
  }

  function addAnd(inputs, output) {
    const uniqueInputs = [...new Set(inputs)].filter(id => id !== output);
    if (uniqueInputs.length < 2 || !output) throw new Error('Choose at least two conditions and one effect.');
    const points = [...uniqueInputs, output].map(nodePosition).filter(Boolean);
    const x = points.reduce((s,p) => s+p.x,0) / points.length;
    const y = points.reduce((s,p) => s+p.y,0) / points.length;
    const targetTitle = model.entities.find(e => e.id === output)?.title || 'effect';
    const j = {
      id: uid('J'), operator: 'AND', confidence: 0.8,
      annotation: `JOINT NECESSITY FOR: ${targetTitle}\nREADING: All incoming conditions are required together for this relationship.`,
      attributes: { P3_ID_SOURCE: 'mobile_uuid', FLOWOS_MOBILE_X: x, FLOWOS_MOBILE_Y: y }
    };
    model.junctors.push(j);
    uniqueInputs.forEach(input => model.edges.push({ id: uid('X'), from: input, to: j.id, annotation: '', weight: 1, is_back_edge: false, attributes: { P3_ID_SOURCE: 'mobile_uuid' } }));
    model.edges.push({ id: uid('X'), from: j.id, to: output, annotation: '', weight: 1, is_back_edge: false, attributes: { P3_ID_SOURCE: 'mobile_uuid' } });
    scheduleSave(); render();
  }

  function render() {
    renderHeader();
    renderEdges();
    renderNodes();
    updateTransform();
    el('emptyState').classList.toggle('hidden', model.entities.length > 0);
    el('connectBtn').classList.toggle('active', connectMode);
    if (connectMode) {
      el('modeHint').classList.remove('hidden');
      el('modeHint').textContent = connectSourceId ? 'CONNECT · tap the effect' : 'CONNECT · tap the cause';
    } else el('modeHint').classList.add('hidden');
  }

  function renderHeader() {
    const title = model.document?.title || 'Untitled Logic';
    el('projectTitleBtn').textContent = title;
    el('projectTitleInput').value = title;
    el('renameInput').value = title;
    el('entityCount').textContent = model.entities.length;
    el('edgeCount').textContent = model.edges.length;
    el('andCount').textContent = model.junctors.filter(j => j.operator === 'AND').length;
  }

  function renderEdges() {
    edgeLayer.replaceChildren();
    for (const edge of model.edges) {
      const a = anchorFor(edge.from, edge.to, true);
      const b = anchorFor(edge.to, edge.from, false);
      if (!a || !b) continue;
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('class', 'edge-line');
      const dx = Math.abs(b.x-a.x), dy = Math.abs(b.y-a.y);
      const bend = Math.max(38, Math.min(150, (dx+dy)*0.28));
      const c1 = {x:a.x, y:a.y - Math.sign(a.y-b.y || -1)*bend};
      const c2 = {x:b.x, y:b.y + Math.sign(a.y-b.y || -1)*bend};
      const d = `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
      path.setAttribute('d', d);
      path.dataset.edgeId = edge.id;
      edgeLayer.appendChild(path);
      const hit = document.createElementNS(svgNS, 'path');
      hit.setAttribute('class', 'edge-hit');
      hit.setAttribute('d', d);
      hit.dataset.edgeId = edge.id;
      hit.addEventListener('pointerdown', ev => { ev.stopPropagation(); openEdgeSheet(edge.id); });
      edgeLayer.appendChild(hit);
    }
  }

  function anchorFor(id, otherId, leaving) {
    const p = nodePosition(id), q = nodePosition(otherId);
    if (!p || !q) return null;
    const isJunctor = model.junctors.some(j => j.id === id);
    const hw = isJunctor ? JUNCTOR_SIZE/2 : NODE_W/2;
    const hh = isJunctor ? JUNCTOR_SIZE/2 : NODE_H/2;
    const dx = q.x-p.x, dy=q.y-p.y;
    if (Math.abs(dx/hw) > Math.abs(dy/hh)) return {x:p.x + Math.sign(dx||1)*hw, y:p.y};
    return {x:p.x, y:p.y + Math.sign(dy||1)*hh};
  }

  function renderNodes() {
    nodeLayer.replaceChildren();
    for (const n of model.entities) nodeLayer.appendChild(entitySVG(n));
    for (const j of model.junctors) nodeLayer.appendChild(junctorSVG(j));
  }

  function entitySVG(n) {
    const p = nodePosition(n.id);
    const g = document.createElementNS(svgNS,'g');
    g.setAttribute('class', `node${selectedNodeId===n.id?' selected':''}${connectSourceId===n.id?' connect-source':''}`);
    g.setAttribute('transform', `translate(${p.x-NODE_W/2},${p.y-NODE_H/2})`);
    g.dataset.nodeId = n.id;
    const rect=document.createElementNS(svgNS,'rect');rect.setAttribute('width',NODE_W);rect.setAttribute('height',NODE_H);rect.setAttribute('fill',fillForClass(n.class));
    g.appendChild(rect);
    const meta=document.createElementNS(svgNS,'text');meta.setAttribute('class','meta');meta.setAttribute('x','13');meta.setAttribute('y','18');meta.textContent=classLabel(n.class).toUpperCase().slice(0,28);g.appendChild(meta);
    const lines=wrapText(n.title,31,3);
    lines.forEach((line,i)=>{const t=document.createElementNS(svgNS,'text');t.setAttribute('x','13');t.setAttribute('y',String(42+i*18));t.textContent=line;g.appendChild(t);});
    g.addEventListener('pointerdown', ev => nodePointerDown(ev,n.id));
    g.addEventListener('dblclick', ev => { ev.stopPropagation(); openNodeSheet(n.id); });
    return g;
  }

  function junctorSVG(j) {
    const p=nodePosition(j.id);const g=document.createElementNS(svgNS,'g');g.setAttribute('class','junctor');g.setAttribute('transform',`translate(${p.x},${p.y})`);g.dataset.junctorId=j.id;
    const poly=document.createElementNS(svgNS,'polygon');const s=JUNCTOR_SIZE/2;poly.setAttribute('points',`0,${-s} ${s},0 0,${s} ${-s},0`);g.appendChild(poly);
    const t=document.createElementNS(svgNS,'text');t.setAttribute('x','0');t.setAttribute('y','1');t.textContent=j.operator;g.appendChild(t);
    g.addEventListener('pointerdown', ev => junctorPointerDown(ev,j.id));
    return g;
  }

  function wrapText(text,maxChars,maxLines){
    const words=String(text||'').trim().split(/\s+/);const lines=[];let line='';
    for(const w of words){const test=line?`${line} ${w}`:w;if(test.length<=maxChars)line=test;else{if(line)lines.push(line);line=w;if(lines.length===maxLines-1)break;}}
    if(line&&lines.length<maxLines)lines.push(line);
    const used=lines.join(' ').length;if(String(text||'').length>used&&lines.length)lines[lines.length-1]=lines[lines.length-1].replace(/[.…]*$/,'')+'…';
    return lines.length?lines:['Untitled'];
  }

  function selectNode(id, silent=false){ selectedNodeId=id; if(!silent) render(); }

  function nodePointerDown(ev,id){
    ev.stopPropagation();
    if (connectMode) {
      if (!connectSourceId) { connectSourceId=id; render(); }
      else if (connectSourceId === id) { connectSourceId=null; render(); }
      else { const source=connectSourceId; connectSourceId=null; if(addEdge(source,id)) toast('Connected.'); }
      return;
    }
    selectNode(id);
    const p=nodePosition(id); const start=screenToWorld(ev.clientX,ev.clientY);
    gesture={type:'node',id,start,p0:{...p},pointerId:ev.pointerId,moved:false};
    canvas.setPointerCapture(ev.pointerId);
  }

  function junctorPointerDown(ev,id){
    ev.stopPropagation();
    if(connectMode){toast('Connect statements, not AND diamonds.');return;}
    const p=nodePosition(id);const start=screenToWorld(ev.clientX,ev.clientY);
    gesture={type:'junctor',id,start,p0:{...p},pointerId:ev.pointerId,moved:false};
    canvas.setPointerCapture(ev.pointerId);
  }

  canvas.addEventListener('pointerdown', ev => {
    if (ev.target.closest?.('.node,.junctor')) return;
    if (connectMode) { connectSourceId=null; render(); return; }
    selectedNodeId=null; render();
    pointerState.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    canvas.setPointerCapture(ev.pointerId);
    if(pointerState.size===1) gesture={type:'pan',pointerId:ev.pointerId,startScreen:{x:ev.clientX,y:ev.clientY},camera0:{...camera},moved:false};
    else if(pointerState.size===2) startPinch();
  });

  canvas.addEventListener('pointermove', ev => {
    if(pointerState.has(ev.pointerId)) pointerState.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(!gesture) return;
    if(gesture.type==='node'||gesture.type==='junctor'){
      if(gesture.pointerId!==ev.pointerId)return;
      const now=screenToWorld(ev.clientX,ev.clientY);const dx=now.x-gesture.start.x,dy=now.y-gesture.start.y;
      if(Math.abs(dx)+Math.abs(dy)>2)gesture.moved=true;
      setNodePosition(gesture.id,gesture.p0.x+dx,gesture.p0.y+dy);renderEdges();renderNodes();scheduleSave();
    } else if(gesture.type==='pan'&&gesture.pointerId===ev.pointerId){
      const dx=ev.clientX-gesture.startScreen.x,dy=ev.clientY-gesture.startScreen.y;if(Math.abs(dx)+Math.abs(dy)>2)gesture.moved=true;
      camera.x=gesture.camera0.x+dx;camera.y=gesture.camera0.y+dy;updateTransform();
    } else if(gesture.type==='pinch'&&pointerState.size>=2) updatePinch();
  });

  function endPointer(ev){
    if(gesture&&(gesture.type==='node'||gesture.type==='junctor')&&gesture.pointerId===ev.pointerId){
      const wasMoved=gesture.moved;const id=gesture.id;gesture=null;
      if(!wasMoved&&model.entities.some(n=>n.id===id)) openNodeSheet(id);
      if(!wasMoved&&model.junctors.some(j=>j.id===id)) openJunctorSheet(id);
    }
    pointerState.delete(ev.pointerId);
    if(gesture?.type==='pinch'){
      if(pointerState.size===1){const [id,p]=pointerState.entries().next().value;gesture={type:'pan',pointerId:id,startScreen:{...p},camera0:{...camera},moved:false};}
      else gesture=null;
    } else if(gesture?.pointerId===ev.pointerId) gesture=null;
  }
  canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);

  function startPinch(){
    const pts=[...pointerState.values()];const center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
    gesture={type:'pinch',startDistance:distance(pts[0],pts[1]),startScale:camera.scale,startCamera:{...camera},worldAtCenter:screenToWorld(center.x,center.y)};
  }
  function updatePinch(){
    const pts=[...pointerState.values()];if(pts.length<2)return;const center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
    const ratio=distance(pts[0],pts[1])/gesture.startDistance;camera.scale=clamp(gesture.startScale*ratio,.25,2.4);
    camera.x=center.x-gesture.worldAtCenter.x*camera.scale;camera.y=center.y-gesture.worldAtCenter.y*camera.scale;updateTransform();
  }
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
  function screenToWorld(clientX,clientY){const r=canvas.getBoundingClientRect();return{x:(clientX-r.left-camera.x)/camera.scale,y:(clientY-r.top-camera.y)/camera.scale}}
  function updateTransform(){viewport.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`)}

  function endpointLabel(id) {
    const entity = model.entities.find(x => x.id === id);
    if (entity) return entity.title;
    const junctor = model.junctors.find(x => x.id === id);
    if (junctor) return junctor.operator;
    return id;
  }

  function openEdgeSheet(id) {
    const edge = model.edges.find(x => x.id === id);
    if (!edge) return;
    selectedEdgeId = id;
    selectedJunctorId = model.junctors.some(j => j.id === edge.from) ? edge.from : model.junctors.some(j => j.id === edge.to) ? edge.to : null;
    el('edgeSheetTitle').textContent = selectedJunctorId ? 'AND relationship' : 'Connection';
    el('edgeDescription').textContent = `${endpointLabel(edge.from)} → ${endpointLabel(edge.to)}`;
    el('edgeAnnotation').value = edge.annotation || '';
    el('deleteEdgeBtn').textContent = selectedJunctorId ? 'Delete AND relationship' : 'Delete connection';
    openSheet('edgeSheet');
  }

  function openJunctorSheet(id) {
    selectedJunctorId = id;
    selectedEdgeId = null;
    const incoming = model.edges.filter(e => e.to === id).map(e => endpointLabel(e.from));
    const outgoing = model.edges.filter(e => e.from === id).map(e => endpointLabel(e.to));
    el('edgeSheetTitle').textContent = 'AND relationship';
    el('edgeDescription').textContent = `${incoming.join(' + ')} → ${outgoing.join(', ')}`;
    const j = model.junctors.find(x => x.id === id);
    el('edgeAnnotation').value = j?.annotation || '';
    el('deleteEdgeBtn').textContent = 'Delete AND relationship';
    openSheet('edgeSheet');
  }

  function saveEdgeSheet() {
    const value = el('edgeAnnotation').value;
    if (selectedJunctorId) {
      const j = model.junctors.find(x => x.id === selectedJunctorId);
      if (j) j.annotation = value;
    } else if (selectedEdgeId) {
      const edge = model.edges.find(x => x.id === selectedEdgeId);
      if (edge) edge.annotation = value;
    }
    scheduleSave();
  }

  function deleteSelectedRelationship() {
    if (selectedJunctorId) {
      const id = selectedJunctorId;
      model.junctors = model.junctors.filter(j => j.id !== id);
      model.edges = model.edges.filter(e => e.from !== id && e.to !== id);
      for (const group of model.groups) group.children = (group.children || []).filter(child => child !== id);
    } else if (selectedEdgeId) {
      model.edges = model.edges.filter(e => e.id !== selectedEdgeId);
    }
    selectedEdgeId = null; selectedJunctorId = null;
    scheduleSave(); render(); closeSheets();
  }

  function openNodeSheet(id){
    const n=model.entities.find(x=>x.id===id);if(!n)return;selectedNodeId=id;
    el('nodeTitle').value=n.title;el('nodeClass').value=n.class;el('nodeConfidence').value=closestConfidence(n.confidence);el('nodeAnnotation').value=n.annotation||'';openSheet('nodeSheet');
  }
  function closestConfidence(v){const n=Number(v);return n>=.65?'0.8':n<=.35?'0.2':'0.5'}
  function saveNodeSheet(){
    if(!selectedNodeId)return;const n=model.entities.find(x=>x.id===selectedNodeId);if(!n)return;
    n.title=el('nodeTitle').value.trim()||'Untitled statement';n.class=el('nodeClass').value;n.confidence=Number(el('nodeConfidence').value);n.annotation=el('nodeAnnotation').value;n.attributes.FL_DOMAIN=domainForClass(n.class);scheduleSave();render();
  }

  function openAndSheet(){
    if(model.entities.length<3){toast('Add at least three statements first.');return;}
    const box=el('andInputs');box.replaceChildren();
    for(const n of model.entities){const label=document.createElement('label');label.className='check-row';const c=document.createElement('input');c.type='checkbox';c.value=n.id;const s=document.createElement('span');s.textContent=n.title;label.append(c,s);box.appendChild(label);}
    const out=el('andOutput');out.replaceChildren(new Option('Choose effect…',''));for(const n of model.entities)out.add(new Option(n.title,n.id));openSheet('andSheet');
  }

  function openSheet(id){closeSheets(false);el('scrim').classList.remove('hidden');el(id).classList.remove('hidden')}
  function closeSheets(hideScrim=true){document.querySelectorAll('.sheet').forEach(s=>s.classList.add('hidden'));if(hideScrim)el('scrim').classList.add('hidden')}

  function autoLayout(target=model,shouldRender=true){
    const ids=[...target.entities.map(n=>n.id),...target.junctors.map(j=>j.id)];const outgoing=new Map(ids.map(id=>[id,[]]));const incoming=new Map(ids.map(id=>[id,[]]));
    target.edges.forEach(e=>{if(outgoing.has(e.from)&&incoming.has(e.to)){outgoing.get(e.from).push(e.to);incoming.get(e.to).push(e.from)}});
    const level=new Map();const queue=[];ids.filter(id=>(outgoing.get(id)?.length||0)===0).forEach(id=>{level.set(id,0);queue.push(id)});
    while(queue.length){const id=queue.shift();const l=level.get(id);for(const prev of incoming.get(id)||[]){const next=l+1;if(!level.has(prev)||next>level.get(prev)){level.set(prev,next);queue.push(prev)}}}
    let fallback=Math.max(0,...level.values())+1;for(const id of ids){if(!level.has(id))level.set(id,fallback++)}
    const buckets={};for(const id of ids){const l=level.get(id);(buckets[l]??=[]).push(id)}
    const levels=Object.keys(buckets).map(Number).sort((a,b)=>a-b);for(const l of levels){const items=buckets[l];const total=(items.length-1)*260;items.forEach((id,i)=>setPositionOnTarget(target,id,360+i*260-total/2,160+l*170));}
    if(target===model){scheduleSave();if(shouldRender){render();fitToScreen();}}
  }

  function setPositionOnTarget(target,id,x,y){const obj=target.entities.find(n=>n.id===id)||target.junctors.find(j=>j.id===id);if(!obj)return;obj.attributes=obj.attributes||{};obj.attributes.FLOWOS_MOBILE_X=x;obj.attributes.FLOWOS_MOBILE_Y=y;}

  function fitToScreen(){
    const pts=[...model.entities,...model.junctors].map(n=>({x:Number(n.attributes.FLOWOS_MOBILE_X||0),y:Number(n.attributes.FLOWOS_MOBILE_Y||0)}));if(!pts.length){camera={x:0,y:0,scale:1};updateTransform();return;}
    const r=canvas.getBoundingClientRect();const minX=Math.min(...pts.map(p=>p.x))-NODE_W/2-40,maxX=Math.max(...pts.map(p=>p.x))+NODE_W/2+40,minY=Math.min(...pts.map(p=>p.y))-NODE_H/2-40,maxY=Math.max(...pts.map(p=>p.y))+NODE_H/2+40;
    const w=maxX-minX,h=maxY-minY;camera.scale=clamp(Math.min(r.width/w,r.height/h),.25,1.15);camera.x=(r.width-w*camera.scale)/2-minX*camera.scale;camera.y=(r.height-h*camera.scale)/2-minY*camera.scale;updateTransform();
  }

  function exportJSONText(){updateCounts();return JSON.stringify(model,null,2)}
  function filename(){return (model.document.title||'FlowOS-Logic').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-|-$/g,'')+'.json'}
  function makeFile(){return new File([exportJSONText()],filename(),{type:'application/json'})}
  function downloadFile(){const file=makeFile();const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('JSON exported.');}
  async function shareFile(){
    const file=makeFile();
    if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:model.document.title,text:'FlowOS RIT JSON',files:[file]});return}catch(err){if(err.name==='AbortError')return;}}
    downloadFile();
  }
  async function copyJSON(){try{await navigator.clipboard.writeText(exportJSONText());toast('JSON copied — ready to paste into ChatGPT.')}catch{toast('Clipboard unavailable. Use Export JSON instead.')}}
  async function pasteJSON(){
    try {
      let text = await navigator.clipboard.readText();
      text = text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
      if(!text) throw new Error('Clipboard is empty.');
      const next = normalizeModel(JSON.parse(text));
      if(!confirm('Replace the current model with the JSON on your clipboard?')) return;
      model = next; selectedNodeId=null; selectedEdgeId=null; selectedJunctorId=null; connectSourceId=null; connectMode=false; camera={x:0,y:0,scale:1};
      scheduleSave(); render(); fitToScreen(); closeSheets(); toast('Revised JSON loaded.');
    } catch(err) { toast(`Paste failed: ${err.message || 'clipboard unavailable'}`); }
  }

  function toast(message){const t=el('toast');t.textContent=message;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),2600)}

  function importFile(file){
    const reader=new FileReader();reader.onload=()=>{try{model=normalizeModel(JSON.parse(reader.result));selectedNodeId=null;connectSourceId=null;connectMode=false;camera={x:0,y:0,scale:1};scheduleSave();render();fitToScreen();closeSheets();toast('RIT JSON imported.')}catch(err){toast(`Import failed: ${err.message}`)}};reader.onerror=()=>toast('Could not read that file.');reader.readAsText(file);
  }

  function initControls(){
    for(const option of classOptions) el('nodeClass').add(new Option(option.label,option.value));
    el('addBtn').addEventListener('click',()=>addEntity());el('emptyAddBtn').addEventListener('click',()=>addEntity());
    el('connectBtn').addEventListener('click',()=>{connectMode=!connectMode;connectSourceId=null;closeSheets();render()});
    el('andBtn').addEventListener('click',openAndSheet);el('fileBtn').addEventListener('click',()=>openSheet('fileSheet'));el('moreBtn').addEventListener('click',()=>openSheet('moreSheet'));
    el('projectTitleBtn').addEventListener('click',()=>{el('renameInput').value=model.document.title;openSheet('renameSheet');setTimeout(()=>el('renameInput').focus(),100)});
    document.querySelectorAll('[data-close-sheet]').forEach(b=>b.addEventListener('click',()=>{if(!el('nodeSheet').classList.contains('hidden'))saveNodeSheet();if(!el('edgeSheet').classList.contains('hidden'))saveEdgeSheet();if(!el('renameSheet').classList.contains('hidden'))renameProject(el('renameInput').value);if(!el('moreSheet').classList.contains('hidden'))renameProject(el('projectTitleInput').value);closeSheets()}));
    el('scrim').addEventListener('click',()=>{if(!el('nodeSheet').classList.contains('hidden'))saveNodeSheet();if(!el('edgeSheet').classList.contains('hidden'))saveEdgeSheet();closeSheets()});
    ['nodeTitle','nodeClass','nodeConfidence','nodeAnnotation'].forEach(id=>el(id).addEventListener('input',saveNodeSheet));
    el('edgeAnnotation').addEventListener('input', saveEdgeSheet);
    el('deleteEdgeBtn').addEventListener('click',()=>{if(confirm(selectedJunctorId ? 'Delete this entire AND relationship?' : 'Delete this connection?')) deleteSelectedRelationship()});
    el('duplicateNodeBtn').addEventListener('click',()=>{const id=selectedNodeId;closeSheets();duplicateEntity(id)});
    el('deleteNodeBtn').addEventListener('click',()=>{if(selectedNodeId&&confirm('Delete this statement and its connections?'))deleteEntity(selectedNodeId)});
    el('createAndBtn').addEventListener('click',()=>{const inputs=[...el('andInputs').querySelectorAll('input:checked')].map(c=>c.value);const output=el('andOutput').value;try{addAnd(inputs,output);closeSheets();toast('Explicit AND created.')}catch(err){toast(err.message)}});
    el('newProjectBtn').addEventListener('click',()=>{if(confirm('Start a new blank model? Export first if you need to keep this one.')){model=newBlankModel();selectedNodeId=null;connectSourceId=null;camera={x:0,y:0,scale:1};scheduleSave();render();closeSheets();}});
    el('importBtn').addEventListener('click',()=>el('fileInput').click());el('fileInput').addEventListener('change',ev=>{const file=ev.target.files?.[0];if(file)importFile(file);ev.target.value=''});
    el('exportBtn').addEventListener('click',downloadFile);el('shareBtn').addEventListener('click',shareFile);el('copyBtn').addEventListener('click',copyJSON);el('pasteBtn').addEventListener('click',pasteJSON);
    el('autoLayoutBtn').addEventListener('click',()=>{autoLayout();closeSheets();toast('Layout rebuilt.')});el('fitBtn').addEventListener('click',()=>{fitToScreen();closeSheets()});
    el('projectTitleInput').addEventListener('input',ev=>renameProject(ev.target.value,false));el('renameInput').addEventListener('input',ev=>renameProject(ev.target.value,false));
    window.addEventListener('resize',()=>requestAnimationFrame(updateTransform));
  }

  function renameProject(value,save=true){model.document.title=value.trim()||'Untitled Logic';renderHeader();if(save)scheduleSave();else scheduleSave()}

  loadSaved();initControls();render();setTimeout(()=>{if(model.entities.length)fitToScreen()},80);

  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
})();

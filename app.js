(() => {
  'use strict';

  const STORAGE_KEY = 'flowos-logic-mvp-v1';
  const NODE_W = 220;
  const NODE_H = 94;
  const JUNCTOR_SIZE = 30;
  const LAYOUT_VERSION = 2;
  const LEVEL_GAP = 190;
  const NODE_GAP = 72;
  const GROUP_GAP = 150;
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
      document_attributes: { FLOWOS_LAYOUT_VERSION: LAYOUT_VERSION, FLOWOS_LAYOUT_ENGINE: 'hierarchical_barycentric_v2' },
      entities: [],
      junctors: [],
      groups: [],
      edges: [],
      export_metadata: {
        exporter: 'FlowOS Logic MVP 1.1',
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
    const layoutVersion = Number(data.document_attributes?.FLOWOS_LAYOUT_VERSION || 0);
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
    if (!hadStoredLayout || layoutVersion < LAYOUT_VERSION) autoLayout(data, false);
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
    target.export_metadata.exporter = 'FlowOS Logic MVP 1.1';
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
    const related = selectedNodeId ? relatedIDs(selectedNodeId) : null;
    const overview = camera.scale < 0.34;
    for (const edge of model.edges) {
      const a = anchorFor(edge.from, edge.to, true);
      const b = anchorFor(edge.to, edge.from, false);
      if (!a || !b) continue;
      const path = document.createElementNS(svgNS, 'path');
      const isRelated = !related || related.has(edge.from) || related.has(edge.to);
      const relationClass = related ? (isRelated ? ' related' : ' unrelated') : '';
      path.setAttribute('class', `edge-line${relationClass}${edge.is_back_edge ? ' back-edge' : ''}`);
      const d = routedEdgePath(edge, a, b);
      path.setAttribute('d', d);
      path.dataset.edgeId = edge.id;
      if (overview && !isRelated) path.setAttribute('marker-end', 'none');
      edgeLayer.appendChild(path);
      const hit = document.createElementNS(svgNS, 'path');
      hit.setAttribute('class', 'edge-hit');
      hit.setAttribute('d', d);
      hit.dataset.edgeId = edge.id;
      hit.addEventListener('pointerdown', ev => { ev.stopPropagation(); openEdgeSheet(edge.id); });
      edgeLayer.appendChild(hit);
    }
  }

  function routedEdgePath(edge, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Normal FlowOS hierarchy runs from a prerequisite below to an effect above.
    // Keep those links vertically disciplined; side-route back/same-level links.
    if (Math.abs(dy) >= 45 && !edge.is_back_edge) {
      const direction = Math.sign(dy || -1);
      const spread = Math.max(38, Math.min(120, Math.abs(dy) * 0.42));
      return `M ${a.x} ${a.y} C ${a.x} ${a.y + direction*spread}, ${b.x} ${b.y - direction*spread}, ${b.x} ${b.y}`;
    }
    const side = Math.sign(dx || 1);
    const bend = Math.max(70, Math.min(220, Math.abs(dx) * 0.35 + 70));
    return `M ${a.x} ${a.y} C ${a.x + side*bend} ${a.y}, ${b.x - side*bend} ${b.y}, ${b.x} ${b.y}`;
  }

  function relatedIDs(id) {
    const ids = new Set([id]);
    for (const e of model.edges) {
      if (e.from === id || e.to === id) { ids.add(e.from); ids.add(e.to); }
    }
    // Treat an AND junctor as transparent for neighborhood highlighting.
    for (const j of model.junctors) {
      if (!ids.has(j.id)) continue;
      for (const e of model.edges) if (e.from === j.id || e.to === j.id) { ids.add(e.from); ids.add(e.to); }
    }
    return ids;
  }

  function anchorFor(id, otherId, leaving) {
    const p = nodePosition(id), q = nodePosition(otherId);
    if (!p || !q) return null;
    const isJunctor = model.junctors.some(j => j.id === id);
    const hw = isJunctor ? JUNCTOR_SIZE/2 : NODE_W/2;
    const hh = isJunctor ? JUNCTOR_SIZE/2 : NODE_H/2;
    const dx = q.x-p.x, dy=q.y-p.y;
    // Prefer vertical ports in hierarchical layouts. This removes the large side loops
    // that made dense imported models look like a knot of spaghetti.
    if (Math.abs(dy) > 36) return {x:p.x, y:p.y + Math.sign(dy||1)*hh};
    return {x:p.x + Math.sign(dx||1)*hw, y:p.y};
  }

  function renderNodes() {
    nodeLayer.replaceChildren();
    const neighborhood = selectedNodeId ? relatedIDs(selectedNodeId) : null;
    for (const n of model.entities) nodeLayer.appendChild(entitySVG(n, neighborhood));
    for (const j of model.junctors) nodeLayer.appendChild(junctorSVG(j, neighborhood));
  }

  function entitySVG(n, neighborhood=null) {
    const p = nodePosition(n.id);
    const g = document.createElementNS(svgNS,'g');
    const unrelated = neighborhood && !neighborhood.has(n.id);
    g.setAttribute('class', `node${selectedNodeId===n.id?' selected':''}${connectSourceId===n.id?' connect-source':''}${unrelated?' unrelated':''}`);
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

  function junctorSVG(j, neighborhood=null) {
    const p=nodePosition(j.id);const g=document.createElementNS(svgNS,'g');g.setAttribute('class',`junctor${neighborhood&&!neighborhood.has(j.id)?' unrelated':''}`);g.setAttribute('transform',`translate(${p.x},${p.y})`);g.dataset.junctorId=j.id;
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
    const ratio=distance(pts[0],pts[1])/gesture.startDistance;camera.scale=clamp(gesture.startScale*ratio,.08,2.4);
    camera.x=center.x-gesture.worldAtCenter.x*camera.scale;camera.y=center.y-gesture.worldAtCenter.y*camera.scale;updateTransform();
  }
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
  function screenToWorld(clientX,clientY){const r=canvas.getBoundingClientRect();return{x:(clientX-r.left-camera.x)/camera.scale,y:(clientY-r.top-camera.y)/camera.scale}}
  function updateTransform(){
    viewport.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    canvas.classList.toggle('zoom-overview', camera.scale < 0.34);
    canvas.classList.toggle('zoom-mid', camera.scale >= 0.34 && camera.scale < 0.68);
    canvas.classList.toggle('zoom-detail', camera.scale >= 0.68);
  }

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
    const ids=[...target.entities.map(n=>n.id),...target.junctors.map(j=>j.id)];
    if(!ids.length)return;
    const idSet=new Set(ids);
    const out=new Map(ids.map(id=>[id,[]]));
    const inc=new Map(ids.map(id=>[id,[]]));
    for(const e of target.edges){
      if(!idSet.has(e.from)||!idSet.has(e.to))continue;
      out.get(e.from).push(e.to);inc.get(e.to).push(e.from);
    }

    // 1) Collapse cycles so feedback loops do not explode into fake extra levels.
    const components=stronglyConnectedComponents(ids,out);
    const compOf=new Map();components.forEach((members,i)=>members.forEach(id=>compOf.set(id,i)));
    const compOut=new Map(components.map((_,i)=>[i,new Set()]));
    const compInc=new Map(components.map((_,i)=>[i,new Set()]));
    for(const e of target.edges){
      if(!compOf.has(e.from)||!compOf.has(e.to))continue;
      const a=compOf.get(e.from),b=compOf.get(e.to);if(a===b)continue;
      compOut.get(a).add(b);compInc.get(b).add(a);
    }

    // 2) Longest distance from a sink. Final effects/goals sit at the top (rank 0).
    const memo=new Map();const visiting=new Set();
    function rankOf(c){
      if(memo.has(c))return memo.get(c);
      if(visiting.has(c))return 0;
      visiting.add(c);
      const next=[...compOut.get(c)];
      const r=next.length?1+Math.max(...next.map(rankOf)):0;
      visiting.delete(c);memo.set(c,r);return r;
    }
    components.forEach((_,i)=>rankOf(i));
    const nodeRank=new Map();components.forEach((members,i)=>members.forEach(id=>nodeRank.set(id,memo.get(i))));

    // 3) Initial order prefers semantic groups, then prior horizontal position/title.
    const groupKey=groupKeys(target);
    const buckets=new Map();
    for(const id of ids){const r=nodeRank.get(id)||0;if(!buckets.has(r))buckets.set(r,[]);buckets.get(r).push(id)}
    for(const [r,items] of buckets){
      items.sort((a,b)=>{
        const ga=groupKey.get(a)||'~',gb=groupKey.get(b)||'~';if(ga!==gb)return ga.localeCompare(gb,undefined,{numeric:true});
        const xa=storedX(target,a),xb=storedX(target,b);if(Number.isFinite(xa)&&Number.isFinite(xb)&&xa!==xb)return xa-xb;
        return nodeTitle(target,a).localeCompare(nodeTitle(target,b));
      });
    }

    // 4) Sugiyama-style barycentric sweeps. This is the crossing-reduction step
    // missing from the original MVP layout.
    const ranks=[...buckets.keys()].sort((a,b)=>a-b);
    for(let pass=0;pass<10;pass++){
      const forward=pass%2===0;
      const ordered=forward?ranks.slice(1):ranks.slice(0,-1).reverse();
      for(const r of ordered){
        const items=buckets.get(r);const referenceRank=forward?r-1:r+1;const ref=buckets.get(referenceRank)||[];
        const refPos=new Map(ref.map((id,i)=>[id,i]));
        items.sort((a,b)=>{
          const ba=barycenter(a,forward?out:inc,refPos);const bb=barycenter(b,forward?out:inc,refPos);
          if(ba!=null&&bb!=null&&ba!==bb)return ba-bb;if(ba!=null&&bb==null)return-1;if(ba==null&&bb!=null)return 1;
          const ga=groupKey.get(a)||'~',gb=groupKey.get(b)||'~';return ga.localeCompare(gb,undefined,{numeric:true});
        });
      }
    }

    // 5) Position each rank. Extra gaps between group clusters make large models scannable.
    const maxCount=Math.max(...[...buckets.values()].map(x=>x.length));
    const baseX=420;
    for(const r of ranks){
      const items=buckets.get(r);let cursor=0;let prevGroup=null;const positions=[];
      for(const id of items){
        const g=groupKey.get(id)||'~';
        if(prevGroup!==null&&g!==prevGroup)cursor+=GROUP_GAP;
        positions.push({id,x:cursor});cursor+=NODE_W+NODE_GAP;prevGroup=g;
      }
      const width=Math.max(0,cursor-(NODE_W+NODE_GAP));
      const shift=baseX-width/2;
      positions.forEach(p=>setPositionOnTarget(target,p.id,p.x+shift,170+r*LEVEL_GAP));
    }

    // 6) AND diamonds belong between their conditions and result. Nudge them onto
    // the median lane of their neighbors so they do not create huge triangular loops.
    for(const j of target.junctors){
      const neighbors=[...(inc.get(j.id)||[]),...(out.get(j.id)||[])].map(id=>positionOnTarget(target,id)).filter(Boolean);
      if(!neighbors.length)continue;
      const xs=neighbors.map(p=>p.x).sort((a,b)=>a-b);const median=xs[Math.floor(xs.length/2)];
      const own=positionOnTarget(target,j.id);setPositionOnTarget(target,j.id,median,own?.y||170+(nodeRank.get(j.id)||0)*LEVEL_GAP);
    }

    target.document_attributes=target.document_attributes||{};
    target.document_attributes.FLOWOS_LAYOUT_VERSION=LAYOUT_VERSION;
    target.document_attributes.FLOWOS_LAYOUT_ENGINE='hierarchical_barycentric_v2';
    if(target===model){scheduleSave();if(shouldRender){render();if(model.entities.length>60)focusGoal();else fitToScreen();}}
  }

  function stronglyConnectedComponents(ids,out){
    let index=0;const stack=[];const onStack=new Set();const indices=new Map();const low=new Map();const comps=[];
    function visit(v){
      indices.set(v,index);low.set(v,index);index++;stack.push(v);onStack.add(v);
      for(const w of out.get(v)||[]){
        if(!indices.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)))}
        else if(onStack.has(w))low.set(v,Math.min(low.get(v),indices.get(w)));
      }
      if(low.get(v)===indices.get(v)){
        const comp=[];let w;do{w=stack.pop();onStack.delete(w);comp.push(w)}while(w!==v);comps.push(comp);
      }
    }
    ids.forEach(v=>{if(!indices.has(v))visit(v)});return comps;
  }

  function barycenter(id,neighborMap,refPos){
    const vals=(neighborMap.get(id)||[]).map(n=>refPos.get(n)).filter(Number.isFinite);if(!vals.length)return null;return vals.reduce((a,b)=>a+b,0)/vals.length;
  }

  function groupKeys(target){
    const result=new Map();const groupMap=new Map((target.groups||[]).map(g=>[g.id,g]));
    const parent=new Map();for(const g of target.groups||[])for(const child of g.children||[])if(groupMap.has(child))parent.set(child,g.id);
    function pathFor(gid){const path=[];const seen=new Set();let cur=gid;while(cur&&!seen.has(cur)){seen.add(cur);path.unshift(cur);cur=parent.get(cur)}return path.join('/');}
    for(const g of target.groups||[]){const key=pathFor(g.id);for(const child of g.children||[]){if(!groupMap.has(child)&&!result.has(child))result.set(child,key)}}
    return result;
  }

  function storedX(target,id){const o=target.entities.find(n=>n.id===id)||target.junctors.find(j=>j.id===id);return Number(o?.attributes?.FLOWOS_MOBILE_X)}
  function nodeTitle(target,id){return target.entities.find(n=>n.id===id)?.title||target.junctors.find(j=>j.id===id)?.operator||id}
  function positionOnTarget(target,id){const o=target.entities.find(n=>n.id===id)||target.junctors.find(j=>j.id===id);if(!o)return null;return{x:Number(o.attributes?.FLOWOS_MOBILE_X||0),y:Number(o.attributes?.FLOWOS_MOBILE_Y||0)}}

  function setPositionOnTarget(target,id,x,y){const obj=target.entities.find(n=>n.id===id)||target.junctors.find(j=>j.id===id);if(!obj)return;obj.attributes=obj.attributes||{};obj.attributes.FLOWOS_MOBILE_X=x;obj.attributes.FLOWOS_MOBILE_Y=y;}

  function fitToScreen(){
    const pts=[...model.entities,...model.junctors].map(n=>({x:Number(n.attributes.FLOWOS_MOBILE_X||0),y:Number(n.attributes.FLOWOS_MOBILE_Y||0)}));if(!pts.length){camera={x:0,y:0,scale:1};updateTransform();return;}
    const r=canvas.getBoundingClientRect();const minX=Math.min(...pts.map(p=>p.x))-NODE_W/2-60,maxX=Math.max(...pts.map(p=>p.x))+NODE_W/2+60,minY=Math.min(...pts.map(p=>p.y))-NODE_H/2-60,maxY=Math.max(...pts.map(p=>p.y))+NODE_H/2+60;
    const w=maxX-minX,h=maxY-minY;camera.scale=clamp(Math.min(r.width/w,r.height/h),.08,1.15);camera.x=(r.width-w*camera.scale)/2-minX*camera.scale;camera.y=(r.height-h*camera.scale)/2-minY*camera.scale;updateTransform();renderEdges();renderNodes();
  }

  function focusGoal(){
    if(!model.entities.length)return fitToScreen();
    const entityIDs=new Set(model.entities.map(n=>n.id));
    const outgoingCount=new Map(model.entities.map(n=>[n.id,0]));
    for(const e of model.edges){if(entityIDs.has(e.from))outgoingCount.set(e.from,(outgoingCount.get(e.from)||0)+1)}
    const sinks=model.entities.filter(n=>(outgoingCount.get(n.id)||0)===0);
    const target=(sinks.sort((a,b)=>goalPriority(b)-goalPriority(a))[0]||model.entities[0]);
    const p=nodePosition(target.id);const r=canvas.getBoundingClientRect();camera.scale=clamp(model.entities.length>150?.58:.72,.08,1.15);camera.x=r.width/2-p.x*camera.scale;camera.y=Math.min(r.height*.24-p.y*camera.scale,80);selectedNodeId=target.id;updateTransform();renderEdges();renderNodes();
  }

  function goalPriority(n){
    const cls=String(n.class||'').toLowerCase(),title=String(n.title||'').toLowerCase();let score=0;
    if(cls.includes('objective')||cls.includes('goal'))score+=5;if(title.includes('goal')||title.includes('uncompromised'))score+=3;if(title.includes('value'))score+=1;return score;
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
      scheduleSave(); render(); if(model.entities.length>60)focusGoal();else fitToScreen(); closeSheets(); toast(model.entities.length>60?'Revised JSON loaded — showing the goal area.':'Revised JSON loaded.');
    } catch(err) { toast(`Paste failed: ${err.message || 'clipboard unavailable'}`); }
  }

  function toast(message){const t=el('toast');t.textContent=message;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),2600)}

  function importFile(file){
    const reader=new FileReader();reader.onload=()=>{try{model=normalizeModel(JSON.parse(reader.result));selectedNodeId=null;connectSourceId=null;connectMode=false;camera={x:0,y:0,scale:1};scheduleSave();render();if(model.entities.length>60)focusGoal();else fitToScreen();closeSheets();toast(model.entities.length>60?'Large model organized — showing the goal area.':'RIT JSON imported.')}catch(err){toast(`Import failed: ${err.message}`)}};reader.onerror=()=>toast('Could not read that file.');reader.readAsText(file);
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
    el('autoLayoutBtn').addEventListener('click',()=>{autoLayout();closeSheets();toast(model.entities.length>60?'Hierarchy rebuilt — crossings reduced.':'Layout rebuilt.')});el('fitBtn').addEventListener('click',()=>{fitToScreen();closeSheets()});el('focusGoalBtn')?.addEventListener('click',()=>{focusGoal();closeSheets()});
    el('projectTitleInput').addEventListener('input',ev=>renameProject(ev.target.value,false));el('renameInput').addEventListener('input',ev=>renameProject(ev.target.value,false));
    window.addEventListener('resize',()=>requestAnimationFrame(updateTransform));
  }

  function renameProject(value,save=true){model.document.title=value.trim()||'Untitled Logic';renderHeader();if(save)scheduleSave();else scheduleSave()}

  loadSaved();initControls();render();setTimeout(()=>{if(model.entities.length){if(model.entities.length>60)focusGoal();else fitToScreen()}},80);

  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
})();

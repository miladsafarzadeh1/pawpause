import React, { useState, useRef, useCallback, useEffect } from "react";
import { Cat, ShieldCheck, ShieldAlert, Activity, Trash2, Zap, Lock, Unlock, Send, Hash, Layers } from "lucide-react";

/**
 * PAW PAUSE — interactive demo of the cat-typing detection model.
 * The detection logic below mirrors the published library core (Detector +
 * scoreWindow); a real app would install the package and attach its guard.
 * This artifact shows two faces of the same engine:
 *   1) INSTRUMENT — the raw algorithm, every signal visible.
 *   2) INTEGRATION — a Slack-style composer using the guard the way a host app would.
 */

// ---- Detection model (mirrors the library core) ---------------------------
const WINDOW_MS = 1500, TRIGGER = 1.0, RELEASE_MS = 1000, SAFE_WM = 0.3;
const ROWS = [
  ["KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI","KeyO","KeyP"],
  ["KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL"],
  ["KeyZ","KeyX","KeyC","KeyV","KeyB","KeyN","KeyM","Comma","Period"],
];
const STRUCTURAL = new Set(["Space","Enter","Backspace","Tab","NumpadEnter"]);
const ADJ = (() => {
  const m = {};
  ROWS.forEach((row, r) => row.forEach((key, c) => {
    const n = new Set();
    if (c > 0) n.add(row[c-1]);
    if (c < row.length-1) n.add(row[c+1]);
    [r-1, r+1].forEach((dr) => { if (dr>=0 && dr<ROWS.length) [c-1,c,c+1].forEach((oc)=>{ if(oc>=0&&oc<ROWS[dr].length) n.add(ROWS[dr][oc]); }); });
    m[key] = n;
  }));
  return m;
})();
const areAdjacent = (a, b) => a !== b && !!ADJ[a]?.has(b);

const SIGNALS = [
  { id:"concurrent", label:"Concurrent keys", weight:0.7, hint:"3+ keys held at once" },
  { id:"concurrentHi", label:"Heavy press", weight:0.7, hint:"5+ keys — sitting on it" },
  { id:"burst", label:"Burst rate", weight:0.4, hint:"8+ keys / sec" },
  { id:"cluster", label:"Adjacency roll", weight:0.4, hint:"neighboring keys in a row" },
  { id:"repeat", label:"Repetition", weight:0.3, hint:"same key 6+ times" },
  { id:"nostruct", label:"No structure", weight:0.2, hint:"no space / return / delete" },
];

function scoreWindow(buffer, keysDownCount) {
  const fired = {}; let s = 0;
  if (keysDownCount >= 3) { fired.concurrent = true; s += 0.7; }
  if (keysDownCount >= 5) { fired.concurrentHi = true; s += 0.7; }
  const rate = buffer.length / (WINDOW_MS/1000);
  if (rate >= 8) { fired.burst = true; s += 0.4; }
  let run = 0;
  for (let i=1;i<buffer.length;i++) if (areAdjacent(buffer[i-1].code, buffer[i].code)) run++;
  if (run >= 3) { fired.cluster = true; s += 0.4; }
  const counts = {}; buffer.forEach((b)=>counts[b.code]=(counts[b.code]||0)+1);
  if (Object.values(counts).some((v)=>v>=6)) { fired.repeat = true; s += 0.3; }
  if (buffer.length>=6 && !buffer.some((b)=>STRUCTURAL.has(b.code))) { fired.nostruct = true; s += 0.2; }
  return { score:s, fired, rate };
}

// A tiny reusable detector hook mirroring the library's Detector + guard.
function useDetector(threshold, stayLocked) {
  const buffer = useRef([]), keysDown = useRef(new Set()), lastEvent = useRef(0), blockingRef = useRef(false);
  const [verdict, setVerdict] = useState({ score:0, fired:{}, rate:0 });
  const [blocking, setBlocking] = useState(false);
  const setBlock = (v) => { if (v!==blockingRef.current){ blockingRef.current=v; setBlocking(v);} };
  const feedDown = (code, repeat=false) => {
    const t = performance.now(); lastEvent.current = t;
    if (!repeat) keysDown.current.add(code);
    buffer.current.push({ code, time:t });
    buffer.current = buffer.current.filter((e)=>t-e.time<=WINDOW_MS);
    const v = scoreWindow(buffer.current, keysDown.current.size);
    setVerdict(v);
    if (v.score >= threshold) { setBlock(true); return true; }
    return false;
  };
  const feedUp = (code) => keysDown.current.delete(code);
  const reset = () => { buffer.current=[]; keysDown.current.clear(); setVerdict({score:0,fired:{},rate:0}); setBlock(false); };
  const tick = () => {
    if (!blockingRef.current || stayLocked) return;
    if (keysDown.current.size===0 && performance.now()-lastEvent.current>=RELEASE_MS) reset();
  };
  const isCalm = () => scoreWindow(buffer.current, keysDown.current.size).score < SAFE_WM;
  return { verdict, blocking, blockingRef, feedDown, feedUp, reset, tick, isCalm, lastEvent };
}

// ============================================================================
export default function PawPause() {
  const [tab, setTab] = useState("instrument");
  return (
    <div style={S.root}>
      <style>{CSS}</style>
      <header style={S.header} className="pp-rise">
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={S.glyph}><Cat size={26} strokeWidth={2} /></div>
          <div>
            <h1 style={S.title}>PAW&nbsp;PAUSE</h1>
            <p style={S.subtitle}>npm: pawpause · detect &amp; suppress cat-on-keyboard input</p>
          </div>
        </div>
        <div style={S.tabs}>
          <button onClick={()=>setTab("instrument")} style={{...S.tab, ...(tab==="instrument"?S.tabOn:{})}}>
            <Activity size={14}/> Instrument
          </button>
          <button onClick={()=>setTab("integration")} style={{...S.tab, ...(tab==="integration"?S.tabOn:{})}}>
            <Layers size={14}/> Integration
          </button>
        </div>
      </header>
      {tab === "instrument" ? <Instrument/> : <Integration/>}
      <footer style={S.footer}>
        One engine, two surfaces. The Instrument shows the raw model; the Integration shows how a host
        app (Slack-style composer) consumes <code style={S.code}>pawpause</code> — controlled input,
        rollback via <code style={S.code}>safeValue</code>, send gated on the clamp, Esc to override.
      </footer>
    </div>
  );
}

// ---- Tab 1: Instrument -----------------------------------------------------
function Instrument() {
  const [armed, setArmed] = useState(true);
  const [stayLocked, setStayLocked] = useState(false);
  const [threshold, setThreshold] = useState(TRIGGER);
  const [text, setText] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [log, setLog] = useState([{ t: time(), m: "System ready. Channel open." }]);
  const det = useDetector(threshold, stayLocked);
  const lastSafe = useRef("");

  const pushLog = useCallback((m)=>setLog((l)=>[{t:time(),m},...l].slice(0,7)),[]);
  useEffect(()=>{ const id=setInterval(()=>det.tick(),200); return ()=>clearInterval(id); });
  useEffect(()=>{ if(det.blocking) pushLog("⚠ CLAMP — cat pattern detected"); /*eslint-disable-next-line*/ },[det.blocking]);

  const onKeyDown = (e) => {
    if (!armed) return;
    if (e.key==="Escape" && det.blockingRef.current){ det.reset(); return; }
    if (det.blockingRef.current){ e.preventDefault(); return; }
    if (det.feedDown(e.code, e.repeat)){ e.preventDefault(); setText(lastSafe.current); }
  };
  const onChange = (e) => { if(det.blockingRef.current) return; const v=e.target.value; setText(v); if(det.isCalm()) lastSafe.current=v; };

  const simulateCat = () => {
    if (simulating||!armed) return; setSimulating(true); lastSafe.current=text;
    const paw=["KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL","KeyF","KeyD","KeyS"];
    let i=0; pushLog("▶ Simulating cat …");
    const step=()=>{
      if(i>=paw.length||det.blockingRef.current){ setSimulating(false); return; }
      const blocked=det.feedDown(paw[i], false);
      if(!blocked) setText((p)=>p+paw[i].replace("Key","").toLowerCase());
      i++; if(det.blockingRef.current){ setSimulating(false); return; } setTimeout(step,70);
    };
    step();
  };

  const pct = Math.min(det.verdict.score/Math.max(threshold,0.1),1.2);
  return (
    <div style={S.grid}>
      <section style={S.panel} className="pp-rise pp-d1">
        <div style={S.panelHead}>
          <span style={S.panelLabel}>INPUT CHANNEL</span>
          <button onClick={()=>{setArmed(a=>!a); pushLog(armed?"Disarmed.":"Armed.");}} style={{...S.power,...(armed?S.powerOn:{})}}>
            <span style={{...S.powerDot,...(armed?S.powerDotOn:{})}}/>{armed?"ARMED":"OFF"}
          </button>
        </div>
        <div style={{ position:"relative" }}>
          <textarea value={text} onChange={onChange} onKeyDown={onKeyDown} onKeyUp={(e)=>det.feedUp(e.code)}
            placeholder={armed?"Type here. Let a cat try too. (Esc overrides)":"Disarmed — type freely."}
            spellCheck={false} style={{...S.textarea,...(det.blocking?S.textareaLocked:{})}}/>
          {det.blocking && (
            <div style={S.clamp} className="pp-flash">
              <ShieldAlert size={30}/>
              <div style={{ fontWeight:700, letterSpacing:1, marginTop:6 }}>INPUT CLAMPED</div>
              <div style={S.clampSub}>{stayLocked?"Locked until you release.":"Auto-releases when typing settles."}</div>
              <button onClick={()=>det.reset()} style={S.unlock}><Unlock size={14}/> Release (Esc)</button>
            </div>
          )}
        </div>
        <div style={S.controls}>
          <button onClick={simulateCat} disabled={!armed||simulating} style={S.btn}><Zap size={14}/> {simulating?"running…":"Simulate cat"}</button>
          <button onClick={()=>{setText("");lastSafe.current="";det.reset();pushLog("Cleared.");}} style={S.btnGhost}><Trash2 size={14}/> Clear</button>
          <label style={S.lockToggle}>{stayLocked?<Lock size={13}/>:<Unlock size={13}/>}
            <input type="checkbox" checked={stayLocked} onChange={(e)=>setStayLocked(e.target.checked)} style={{accentColor:"#e8a33d"}}/> stay locked
          </label>
        </div>
      </section>

      <section style={S.panel} className="pp-rise pp-d2">
        <div style={S.panelHead}>
          <span style={S.panelLabel}>DETECTION</span>
          <span style={{...S.verdict, color: det.blocking?"#ff5c47":armed?"#e8a33d":"#6b6456"}}>
            {det.blocking?<ShieldAlert size={13}/>:<ShieldCheck size={13}/>}{det.blocking?"CAT":armed?"CLEAR":"IDLE"}
          </span>
        </div>
        <Gauge pct={pct} score={det.verdict.score} threshold={threshold} blocking={det.blocking}/>
        <div style={S.thRow}>
          <span style={S.thLabel}>trigger threshold</span>
          <input type="range" min={0.4} max={2} step={0.1} value={threshold} onChange={(e)=>setThreshold(parseFloat(e.target.value))} style={{flex:1,accentColor:"#e8a33d"}}/>
          <span style={S.thVal}>{threshold.toFixed(1)}</span>
        </div>
        <div style={S.signals}>
          {SIGNALS.map((sig)=>{ const on=!!det.verdict.fired[sig.id]; return (
            <div key={sig.id} style={S.sigRow}>
              <div style={S.sigTop}>
                <span style={{...S.sigName, color:on?"#f3e9d6":"#7a7263"}}>{sig.label}</span>
                <span style={{...S.sigW, color:on?"#e8a33d":"#5c554a"}}>+{sig.weight.toFixed(1)}</span>
              </div>
              <div style={S.sigTrack}><div style={{...S.sigFill, width:on?"100%":"0%", background:on?"linear-gradient(90deg,#c97a1f,#e8a33d)":"transparent", boxShadow:on?"0 0 10px rgba(232,163,61,.5)":"none"}}/></div>
              <span style={S.sigHint}>{sig.hint}</span>
            </div>
          );})}
        </div>
      </section>

      <section style={{...S.panel, gridColumn:"1 / -1", marginTop:14}} className="pp-rise pp-d3">
        <div style={S.panelHead}><span style={S.panelLabel}><Activity size={12} style={{marginRight:6,verticalAlign:-1}}/>EVENT LOG</span></div>
        <div style={S.logBox}>{log.map((e,i)=>(
          <div key={i} style={{...S.logLine, opacity:i===0?1:0.55-i*0.05}}><span style={S.logTime}>{e.t}</span><span>{e.m}</span></div>
        ))}</div>
      </section>
    </div>
  );
}

// ---- Tab 2: Integration (Slack-style composer) -----------------------------
function Integration() {
  const det = useDetector(TRIGGER, false);
  const [value, setValue] = useState("");
  const [held, setHeld] = useState(null);
  const [sent, setSent] = useState([{ who:"Mara", text:"did the deploy finish?" }]);
  const [simulating, setSimulating] = useState(false);
  const lastSafe = useRef("");
  useEffect(()=>{ const id=setInterval(()=>det.tick(),200); return ()=>clearInterval(id); });
  useEffect(()=>{ if(!det.blocking) setHeld(null); },[det.blocking]);

  const onKeyDown = (e) => {
    if (e.key==="Escape" && det.blockingRef.current){ det.reset(); return; }
    if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); return; }
    if (det.blockingRef.current){ e.preventDefault(); return; }
    if (det.feedDown(e.code, e.repeat)){ e.preventDefault(); const h=value.length-lastSafe.current.length; setValue(lastSafe.current); setHeld(h>0?h:0); }
  };
  const onChange = (e) => { if(det.blockingRef.current) return; const v=e.target.value; setValue(v); if(det.isCalm()) lastSafe.current=v; };
  const send = () => { if(det.blockingRef.current||!value.trim()) return; setSent((s)=>[...s,{who:"You",text:value}]); setValue(""); lastSafe.current=""; };

  const simulateCat = () => {
    if(simulating) return; setSimulating(true); lastSafe.current=value;
    const paw=["KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL","KeyF","KeyD"]; let i=0;
    const step=()=>{
      if(i>=paw.length||det.blockingRef.current){ if(det.blockingRef.current) setHeld(Math.max(value.length+i-lastSafe.current.length,i)); setSimulating(false); return; }
      const blocked=det.feedDown(paw[i],false);
      if(!blocked) setValue((p)=>p+paw[i].replace("Key","").toLowerCase());
      i++; setTimeout(step,70);
    }; step();
  };

  return (
    <div style={S.slackWrap} className="pp-rise pp-d1">
      <div style={S.slackHead}><Hash size={16}/> general <span style={S.slackMeta}>· guarded by pawpause</span></div>
      <div style={S.slackMsgs}>
        {sent.map((m,i)=>(
          <div key={i} style={S.msg}>
            <div style={{...S.avatar, background: m.who==="You"?"#e8a33d":"#4a7c8a"}}>{m.who[0]}</div>
            <div><div style={S.msgWho}>{m.who}</div><div style={S.msgText}>{m.text}</div></div>
          </div>
        ))}
      </div>
      {det.blocking && (
        <div style={S.banner} role="status" aria-live="polite">
          🐾 Paw Pause held {held ?? 0} characters from your cat. <button onClick={()=>det.reset()} style={S.bannerBtn}>I'm human</button>
        </div>
      )}
      <div style={{...S.composer, ...(det.blocking?S.composerLocked:{})}}>
        <textarea value={value} onChange={onChange} onKeyDown={onKeyDown} onKeyUp={(e)=>det.feedUp(e.code)}
          placeholder="Message #general" spellCheck={false} style={S.slackInput}/>
        <div style={S.composerBar}>
          <button onClick={simulateCat} disabled={simulating} style={S.btnGhostSm}><Zap size={13}/> {simulating?"…":"Simulate cat"}</button>
          <button onClick={send} disabled={det.blocking||!value.trim()} style={{...S.sendBtn, ...(det.blocking||!value.trim()?S.sendOff:{})}}>
            <Send size={14}/> Send
          </button>
        </div>
      </div>
      <div style={S.codeNote}>
        <div style={S.codeNoteHead}>host integration</div>
        <pre style={S.pre}>{`const { ref, blocking, lastClamp, unlock } =
  usePawPause({ rollback: false });

useEffect(() => {        // controlled input:
  if (lastClamp)          // apply the safe value
    setValue(lastClamp.safeValue);
}, [lastClamp]);

<button disabled={blocking}>Send</button>  // gate send`}</pre>
      </div>
    </div>
  );
}

// ---- Gauge -----------------------------------------------------------------
function Gauge({ pct, score, threshold, blocking }) {
  const R=64, C=2*Math.PI*R, dash=Math.min(pct,1)*C*0.75;
  const color = blocking?"#ff5c47":pct>0.6?"#e8a33d":"#caa15f";
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"6px 0 14px" }}>
      <div style={{ position:"relative", width:160, height:150 }}>
        <svg width="160" height="150" viewBox="0 0 160 150">
          <g transform="rotate(135 80 75)">
            <circle cx="80" cy="75" r={R} fill="none" stroke="#2a261d" strokeWidth="10" strokeDasharray={`${C*0.75} ${C}`} strokeLinecap="round"/>
            <circle cx="80" cy="75" r={R} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${dash} ${C}`} strokeLinecap="round" style={{transition:"stroke-dasharray .18s ease, stroke .2s"}}/>
          </g>
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
          <div style={{ fontSize:34, fontWeight:700, fontFamily:mono, color, lineHeight:1, transition:"color .2s" }}>{score.toFixed(2)}</div>
          <div style={{ fontSize:10, letterSpacing:1.5, color:"#7a7263", marginTop:4 }}>/ {threshold.toFixed(1)} TRIGGER</div>
        </div>
      </div>
    </div>
  );
}

function time(){ return new Date().toLocaleTimeString("en-GB",{hour12:false}); }

// ---- Styles ----------------------------------------------------------------
const CSS = `
.pp-rise{opacity:0;transform:translateY(10px);animation:ppRise .5s cubic-bezier(.2,.7,.2,1) forwards}
.pp-d1{animation-delay:.06s}.pp-d2{animation-delay:.12s}.pp-d3{animation-delay:.18s}
@keyframes ppRise{to{opacity:1;transform:none}}
.pp-flash{animation:ppFlash .4s ease}
@keyframes ppFlash{0%{background:rgba(255,92,71,.32)}100%{background:rgba(20,18,14,.86)}}
`;
const mono="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", display="ui-sans-serif, system-ui, sans-serif";
const S = {
  root:{ fontFamily:mono, background:"#16140f", color:"#e8e1d2", padding:22, borderRadius:16, maxWidth:920, margin:"0 auto", backgroundImage:"radial-gradient(900px 400px at 80% -10%, rgba(232,163,61,.07), transparent)", border:"1px solid #29251c" },
  header:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:12 },
  glyph:{ width:48, height:48, borderRadius:12, display:"grid", placeItems:"center", background:"#211d15", border:"1px solid #3a3326", color:"#e8a33d" },
  title:{ fontFamily:display, fontSize:26, fontWeight:800, margin:0, letterSpacing:1, color:"#f3e9d6" },
  subtitle:{ margin:"2px 0 0", fontSize:11, color:"#7a7263", letterSpacing:.5 },
  tabs:{ display:"flex", gap:6, background:"#1c190f", padding:4, borderRadius:10, border:"1px solid #2d281d" },
  tab:{ display:"flex", alignItems:"center", gap:6, fontFamily:mono, fontSize:12, fontWeight:600, padding:"7px 13px", borderRadius:7, cursor:"pointer", background:"transparent", border:"none", color:"#7a7263" },
  tabOn:{ background:"#241d10", color:"#e8a33d" },
  grid:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 },
  panel:{ background:"#1c190f", border:"1px solid #2d281d", borderRadius:12, padding:16 },
  panelHead:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 },
  panelLabel:{ fontSize:11, letterSpacing:2, color:"#8a8270", fontWeight:600 },
  verdict:{ display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600, letterSpacing:1 },
  power:{ display:"flex", alignItems:"center", gap:8, fontFamily:mono, fontSize:11, fontWeight:600, letterSpacing:1, padding:"6px 12px", borderRadius:8, cursor:"pointer", background:"#211d15", border:"1px solid #3a3326", color:"#6b6456" },
  powerOn:{ color:"#e8a33d", borderColor:"#6b4d1f", background:"#241d10" },
  powerDot:{ width:8, height:8, borderRadius:"50%", background:"#4a4438" },
  powerDotOn:{ background:"#e8a33d", boxShadow:"0 0 8px #e8a33d" },
  textarea:{ width:"100%", height:200, resize:"none", boxSizing:"border-box", background:"#121009", border:"1px solid #2d281d", borderRadius:10, padding:14, color:"#f3e9d6", fontFamily:mono, fontSize:14, lineHeight:1.6, outline:"none", transition:"border-color .2s" },
  textareaLocked:{ borderColor:"#5c2620" },
  clamp:{ position:"absolute", inset:0, borderRadius:10, background:"rgba(20,18,14,.86)", backdropFilter:"blur(2px)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#ff5c47", textAlign:"center" },
  clampSub:{ fontSize:11, color:"#b8a98f", marginTop:4 },
  unlock:{ marginTop:12, display:"flex", alignItems:"center", gap:6, cursor:"pointer", background:"#ff5c47", color:"#1a120f", border:"none", borderRadius:8, padding:"7px 14px", fontWeight:700, fontFamily:mono, fontSize:12 },
  controls:{ display:"flex", alignItems:"center", gap:10, marginTop:12, flexWrap:"wrap" },
  btn:{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontFamily:mono, fontSize:12, fontWeight:600, padding:"8px 14px", borderRadius:8, color:"#1a120f", background:"#e8a33d", border:"none" },
  btnGhost:{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontFamily:mono, fontSize:12, padding:"8px 12px", borderRadius:8, color:"#b8a98f", background:"transparent", border:"1px solid #3a3326" },
  lockToggle:{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#8a8270", marginLeft:"auto", cursor:"pointer" },
  thRow:{ display:"flex", alignItems:"center", gap:10, margin:"2px 0 14px" },
  thLabel:{ fontSize:10, color:"#7a7263", letterSpacing:1, whiteSpace:"nowrap" },
  thVal:{ fontSize:12, color:"#e8a33d", fontWeight:600, width:24, textAlign:"right" },
  signals:{ display:"flex", flexDirection:"column", gap:9 },
  sigRow:{ display:"grid", gridTemplateColumns:"1fr", gap:3 },
  sigTop:{ display:"flex", justifyContent:"space-between", alignItems:"baseline" },
  sigName:{ fontSize:12, fontWeight:500 }, sigW:{ fontSize:11, fontWeight:600 },
  sigTrack:{ height:5, background:"#252012", borderRadius:3, overflow:"hidden" },
  sigFill:{ height:"100%", borderRadius:3, transition:"width .18s ease, box-shadow .2s" },
  sigHint:{ fontSize:9.5, color:"#5c554a", letterSpacing:.3 },
  logBox:{ display:"flex", flexDirection:"column", gap:4, minHeight:96 },
  logLine:{ display:"flex", gap:12, fontSize:12, color:"#cabfa8" },
  logTime:{ color:"#6b6456", minWidth:64 },
  footer:{ marginTop:16, fontSize:11, color:"#5c554a", lineHeight:1.6, textAlign:"center" },
  code:{ color:"#caa15f", fontFamily:mono },
  // Slack-style
  slackWrap:{ background:"#1c190f", border:"1px solid #2d281d", borderRadius:12, overflow:"hidden" },
  slackHead:{ display:"flex", alignItems:"center", gap:7, padding:"13px 16px", borderBottom:"1px solid #2d281d", fontWeight:700, color:"#f3e9d6", fontFamily:display, fontSize:15 },
  slackMeta:{ fontFamily:mono, fontSize:11, fontWeight:400, color:"#6b6456" },
  slackMsgs:{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:12, minHeight:90 },
  msg:{ display:"flex", gap:10, alignItems:"flex-start" },
  avatar:{ width:34, height:34, borderRadius:8, display:"grid", placeItems:"center", color:"#16140f", fontWeight:700, fontFamily:display, flexShrink:0 },
  msgWho:{ fontSize:13, fontWeight:700, color:"#f3e9d6" },
  msgText:{ fontSize:14, color:"#cabfa8" },
  banner:{ margin:"0 16px", padding:"9px 12px", background:"#241512", border:"1px solid #5c2620", borderRadius:8, color:"#ffb3a3", fontSize:12.5, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  bannerBtn:{ marginLeft:"auto", cursor:"pointer", background:"#ff5c47", color:"#1a120f", border:"none", borderRadius:6, padding:"4px 10px", fontWeight:700, fontFamily:mono, fontSize:11 },
  composer:{ margin:16, border:"1px solid #2d281d", borderRadius:10, background:"#121009", transition:"border-color .2s" },
  composerLocked:{ borderColor:"#5c2620" },
  slackInput:{ width:"100%", boxSizing:"border-box", minHeight:54, resize:"none", background:"transparent", border:"none", outline:"none", padding:"12px 14px", color:"#f3e9d6", fontFamily:mono, fontSize:14, lineHeight:1.5 },
  composerBar:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderTop:"1px solid #221d13" },
  btnGhostSm:{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", fontFamily:mono, fontSize:11, padding:"6px 10px", borderRadius:7, color:"#b8a98f", background:"transparent", border:"1px solid #3a3326" },
  sendBtn:{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontFamily:mono, fontSize:12, fontWeight:600, padding:"7px 16px", borderRadius:8, color:"#1a120f", background:"#e8a33d", border:"none" },
  sendOff:{ background:"#3a3326", color:"#6b6456", cursor:"not-allowed" },
  codeNote:{ margin:"0 16px 16px", background:"#121009", border:"1px solid #2d281d", borderRadius:10, overflow:"hidden" },
  codeNoteHead:{ fontSize:10, letterSpacing:2, color:"#6b6456", padding:"8px 12px", borderBottom:"1px solid #221d13", fontWeight:600 },
  pre:{ margin:0, padding:12, fontFamily:mono, fontSize:11.5, lineHeight:1.6, color:"#9fd8a8", whiteSpace:"pre-wrap" },
};

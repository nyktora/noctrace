import { useState, useEffect, useRef } from "react";

var BG="#0a0e14",SF="#0f1318",SF2="#141a21",BD="#1b2028",BDL="#252c35",TX="#8b949e",TXB="#c9d1d9",TXM="#e6edf3",DM="#3d4450",DM2="#6e7681",GN="#3fb950",GND="#238636",TL="#39d4a5",BL="#58a6ff",YL="#d29922",PH="#db8544",RD="#f85149",MV="#a371f7";

function ctxC(p){return p<50?GN:p<65?TL:p<80?YL:p<90?PH:RD}

var MV="#cba6f7";

var Logo=function(){return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="4" x2="9" y2="4" stroke={GN}/><line x1="2" y1="8" x2="12" y2="8" stroke={YL}/><line x1="2" y1="12" x2="7" y2="12" stroke={RD}/></svg>};
var GHI=function(){return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>};
var RereadIcon=function(props){return <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6a4 4 0 017-2.6" stroke={props.c||YL} strokeWidth="1.4" strokeLinecap="round"/><path d="M9 1.5v2.5H6.5" stroke={props.c||YL} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>};

/* ── DEMO DATA: tells the story of a session degrading ── */
var demoRows=[
  {n:1,t:"Read",tC:BL,l:"src/routes/auth.ts",dur:"8.0s",tk:"42.1k",ctx:21,bS:0,bW:3},
  {n:2,t:"Read",tC:BL,l:"src/middleware/session.ts",dur:"6.0s",tk:"46.8k",ctx:23,bS:1,bW:2.5},
  {n:3,t:"Edit",tC:YL,l:"src/routes/auth.ts",dur:"18.0s",tk:"52.3k",ctx:26,bS:2,bW:6},
  {n:4,t:"Bash",tC:PH,l:"npm test -- auth",dur:"32.0s",tk:"61.7k",ctx:31,bS:4,bW:10},
  {n:5,t:"Write",tC:"#7ee7a1",l:"src/utils/tokens.ts",dur:"22.0s",tk:"78.4k",ctx:39,bS:7,bW:7},
  {n:6,t:"Bash",tC:PH,l:"npm run build",dur:"28.0s",tk:"94.2k",ctx:47,bS:11,bW:9},
  {n:7,t:"Read",tC:BL,l:"src/routes/auth.ts",dur:"8.0s",tk:"112.8k",ctx:56,rr:1,bS:15,bW:3},
  {n:8,t:"Edit",tC:YL,l:"src/middleware/session.ts",dur:"21.0s",tk:"134.6k",ctx:67,bS:18,bW:7},
  {n:9,t:"Bash",tC:PH,l:"npm test -- session",dur:"35.0s",tk:"156.1k",ctx:78,bS:22,bW:11},
  // ── context rot begins ──
  {n:10,t:"MCP",tC:MV,l:"claude in chrome: navigate",dur:"603ms",tk:"168.4k",ctx:82,bS:28,bW:2},
  {n:11,t:"MCP",tC:MV,l:"claude in chrome: computer",dur:"2.1s",tk:"172.7k",ctx:83,bS:29,bW:3},
  {n:12,t:"MCP",tC:MV,l:"claude in chrome: computer",dur:"1.1s",tk:"178.0k",ctx:84,bS:30,bW:2.5},
  {n:13,t:"Bash",tC:PH,l:'kill $(lsof -ti:4117)...',dur:"4.2s",tk:"184.8k",ctx:86,bS:31,bW:4},
  {n:14,t:"MCP",tC:MV,l:"claude in chrome: navigate",dur:"933ms",tk:"190.9k",ctx:87,bS:33,bW:2},
  {n:15,t:"MCP",tC:MV,l:"claude in chrome: computer",dur:"2.1s",tk:"196.3k",ctx:89,bS:34,bW:3},
  {n:16,t:"MCP",tC:MV,l:"claude in chrome: computer",dur:"243ms",tk:"200.0k",ctx:91,bS:35,bW:2},
];

function DemoRow(props){
  var r=props.row;var vis=props.visible;
  var degraded=r.ctx>=80;
  var cc=ctxC(r.ctx);
  var rowBg=degraded?(RD+(r.ctx>=86?"14":r.ctx>=82?"0c":"08")):"transparent";
  return(
    <div style={{
      display:"flex",alignItems:"center",height:26,
      borderBottom:"1px solid "+BD+"50",
      background:rowBg,
      opacity:vis?1:0,
      transform:vis?"translateY(0)":"translateY(6px)",
      transition:"opacity 0.3s ease, transform 0.3s ease, background 0.5s ease",
    }}>
      <div style={{width:3,alignSelf:"stretch",background:cc,opacity:0.7,flexShrink:0,transition:"background 0.5s"}}/>
      <div style={{width:28,textAlign:"right",paddingRight:8,fontSize:10,color:DM,flexShrink:0}}>{r.n}</div>
      <div style={{width:190,paddingLeft:8,display:"flex",alignItems:"center",gap:4,overflow:"hidden",flexShrink:0}}>
        <span style={{fontSize:11,color:degraded?TXB:TX,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {r.t==="MCP"||r.t==="Bash"?r.t+": ":""}{r.l}
        </span>
        {r.rr&&<RereadIcon/>}
      </div>
      <div style={{width:42,textAlign:"center",flexShrink:0}}>
        <span style={{fontSize:9,padding:"1px 4px",borderRadius:2,background:r.tC+"18",color:r.tC,fontWeight:600}}>{r.t}</span>
      </div>
      <div style={{width:48,textAlign:"right",paddingRight:6,fontSize:10,color:DM,flexShrink:0}}>{r.dur}</div>
      <div style={{width:52,textAlign:"right",paddingRight:6,fontSize:10,color:degraded?YL:DM,fontWeight:degraded?600:400,flexShrink:0}}>{r.tk}</div>
      <div style={{width:32,textAlign:"center",fontSize:10,color:cc,fontWeight:degraded?700:400,flexShrink:0}}>{r.ctx}%</div>
      <div style={{flex:1,position:"relative",height:"100%",overflow:"hidden",minWidth:0}}>
        <div style={{position:"absolute",left:"33%",top:0,bottom:0,width:1,background:BD+"30"}}/>
        <div style={{position:"absolute",left:"66%",top:0,bottom:0,width:1,background:BD+"30"}}/>
        <div style={{
          position:"absolute",left:r.bS+"%",
          width:vis?r.bW+"%":"0%",height:8,
          top:"50%",transform:"translateY(-50%)",borderRadius:2,
          background:degraded?"linear-gradient(90deg,"+r.tC+"66,"+RD+"88)":r.tC+"77",
          transition:"width 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s",
        }}/>
      </div>
    </div>
  );
}

function HealthRing(props){
  var score=props.score;
  var size=props.size||36;
  var gc=score>=85?GN:score>=70?TL:score>=55?YL:score>=40?PH:RD;
  var grade=score>=85?"A":score>=70?"B":score>=55?"C":score>=40?"D":"F";
  var r=size/2-2;
  var circ=2*Math.PI*r;
  return(
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} viewBox={"0 0 "+size+" "+size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={BD} strokeWidth="2"/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={gc} strokeWidth="2"
            strokeDasharray={circ} strokeDashoffset={circ-(score/100*circ)}
            strokeLinecap="round" style={{transition:"all 0.4s ease"}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:size*0.38,fontWeight:800,color:gc,transition:"color 0.4s"}}>{grade}</span>
        </div>
      </div>
      {!props.compact&&<div>
        <div style={{fontSize:11,color:TXB,fontWeight:600}}>Health</div>
        <div style={{fontSize:10,color:DM}}>{score}/100</div>
      </div>}
    </div>
  );
}

export default function Landing(){
  var _vr=useState([]),visR=_vr[0],setVisR=_vr[1];
  var _t=useState(""),typed=_t[0],setTyped=_t[1];
  var _cp=useState(false),copied=_cp[0],setCopied=_cp[1];
  var _hs=useState(72),hScore=_hs[0],setHScore=_hs[1];
  var headline="See what your AI agents are actually doing";

  useEffect(function(){
    var i=0;
    var iv=setInterval(function(){i++;if(i>headline.length){clearInterval(iv);return}setTyped(headline.slice(0,i))},32);
    return function(){clearInterval(iv)};
  },[]);

  useEffect(function(){
    demoRows.forEach(function(r,i){
      setTimeout(function(){
        setVisR(function(p){return p.concat([r.n])});
        // degrade health score as context fills
        if(r.ctx>=80){setHScore(function(prev){return Math.max(prev-4,38)})}
      },600+i*300);
    });
  },[]);

  function doCopy(){navigator.clipboard.writeText("npx noctrace");setCopied(true);setTimeout(function(){setCopied(false)},2000)}

  return(
    <div style={{background:BG,color:TX,minHeight:"100vh",fontFamily:"'IBM Plex Mono','Menlo','Consolas',monospace",fontSize:13,overflowX:"hidden"}}>
      <style>{"\
        body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;\
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.015) 2px,rgba(0,0,0,0.015) 4px)}\
        ::selection{background:#3fb950;color:#0a0e14}\
        @keyframes blink{0%,50%{opacity:1}51%,100%{opacity:0}}\
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}\
        @keyframes rotGlow{0%,100%{box-shadow:0 0 20px rgba(248,81,73,0.06)}50%{box-shadow:0 0 40px rgba(248,81,73,0.12)}}\
      "}</style>

      {/* NAV */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:BG+"ee",backdropFilter:"blur(8px)",borderBottom:"1px solid "+BD,height:44,display:"flex",alignItems:"center",padding:"0 24px",fontSize:12}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><Logo/><span style={{color:MV,fontWeight:700,fontSize:13}}>noctrace</span></div>
        <span style={{color:DM,margin:"0 10px"}}>/</span>
        <span style={{fontSize:10,color:DM,border:"1px solid "+BD,padding:"1px 6px",borderRadius:2}}>v0.1.0</span>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:20,alignItems:"center"}}>
          <a href="#rot" style={{color:DM,fontSize:11,textDecoration:"none"}}>context rot</a>
          <a href="#features" style={{color:DM,fontSize:11,textDecoration:"none"}}>features</a>
          <a href="https://github.com/nyktora/noctrace" style={{color:DM,display:"flex"}}><GHI/></a>
        </div>
      </nav>

      {/* GRID BG */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,backgroundImage:"radial-gradient(circle at 1px 1px, "+BD+"35 1px, transparent 0)",backgroundSize:"40px 40px"}}/>

      {/* HERO */}
      <section style={{position:"relative",zIndex:1,maxWidth:900,margin:"0 auto",padding:"56px 24px 0"}}>
        <div style={{fontSize:12,color:DM,marginBottom:10,display:"flex",alignItems:"center",gap:6,animation:"fadeUp 0.4s ease both"}}>
          <span style={{color:GN}}>$</span> noctrace --explain
        </div>
        <h1 style={{fontFamily:"inherit",fontSize:"clamp(22px,3.8vw,38px)",fontWeight:700,lineHeight:1.25,color:TXM,letterSpacing:"-0.03em",marginBottom:8,minHeight:"2.5em"}}>
          {typed}<span style={{display:"inline-block",width:10,height:3,background:GN,marginLeft:2,animation:"blink 1s steps(1) infinite",verticalAlign:"middle",position:"relative",top:-2}}/>
        </h1>
        <p style={{color:TX,fontSize:13,maxWidth:520,marginBottom:24,lineHeight:1.75,animation:"fadeUp 0.4s ease 0.3s both"}}>
          Chrome DevTools <code style={{color:TXB,background:SF2,padding:"1px 5px",borderRadius:2}}>Network</code> tab for Claude Code. Waterfall timelines, token tracking, and <span style={{color:RD,fontWeight:600}}>context rot</span> detection — so you can see when your session starts degrading.
        </p>
        <div style={{display:"flex",gap:10,marginBottom:8,animation:"fadeUp 0.4s ease 0.4s both",flexWrap:"wrap"}}>
          <div onClick={doCopy} style={{display:"flex",alignItems:"center",gap:8,background:SF,border:"1px solid "+BD,padding:"9px 16px",cursor:"pointer",transition:"all 0.2s"}}
            onMouseEnter={function(e){e.currentTarget.style.borderColor=GND;e.currentTarget.style.boxShadow="0 0 20px rgba(63,185,80,0.06)"}}
            onMouseLeave={function(e){e.currentTarget.style.borderColor=BD;e.currentTarget.style.boxShadow="none"}}>
            <span style={{color:GN}}>$</span>
            <code style={{color:TXM,fontWeight:600,fontSize:14}}>npx noctrace</code>
            <span style={{color:copied?GN:DM,fontSize:10,marginLeft:8}}>{copied?"copied!":"click to copy"}</span>
          </div>
          <a href="https://github.com/nyktora/noctrace" style={{display:"flex",alignItems:"center",gap:6,background:SF,border:"1px solid "+BD,padding:"9px 16px",color:TX,fontSize:12,textDecoration:"none"}}><GHI/> source</a>
        </div>
        <div style={{fontSize:11,color:DM,marginBottom:40,animation:"fadeUp 0.4s ease 0.45s both"}}>
          zero config. reads <code style={{color:TX,background:SF2,padding:"1px 5px"}}>~/.claude/</code> passively. no hooks. no cloud.
        </div>
      </section>

      {/* ══ ANIMATED WATERFALL WITH CONTEXT ROT ══ */}
      <section style={{position:"relative",zIndex:1,maxWidth:1060,margin:"0 auto",padding:"0 24px 48px"}}>
        <div style={{border:"1px solid "+BD,background:SF,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
          {/* browser chrome */}
          <div style={{height:26,background:BG,borderBottom:"1px solid "+BD,display:"flex",alignItems:"center",padding:"0 12px",gap:6,fontSize:10,color:DM}}>
            <span style={{fontSize:8,opacity:0.4,letterSpacing:2}}>&#x25CF; &#x25CF; &#x25CF;</span>
            <span style={{flex:1,textAlign:"center"}}>localhost:4117</span>
          </div>
          {/* app toolbar */}
          <div style={{height:30,background:SF2,borderBottom:"1px solid "+BD,display:"flex",alignItems:"center",padding:"0 10px",gap:8,fontSize:10}}>
            <Logo/><span style={{color:MV,fontWeight:700,fontSize:11}}>noctrace</span>
            <div style={{flex:1,background:BG,border:"1px solid "+BD,padding:"2px 8px",margin:"0 8px",fontSize:10,color:DM}}>Filter...</div>
            <div style={{display:"flex",alignItems:"center",gap:8,background:BG,border:"1px solid "+BD,borderRadius:9999,padding:"2px 10px"}}>
              <HealthRing score={hScore} size={24} compact/>
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{flexShrink:0}}><path d="M7 1.5L1 12.5h12L7 1.5z" stroke={YL} strokeWidth="1.1" strokeLinejoin="round"/><path d="M7 6v3" stroke={YL} strokeWidth="1" strokeLinecap="round"/><circle cx="7" cy="11" r=".5" fill={YL}/></svg>
              <span style={{fontSize:10,color:DM2}}>{demoRows[visR.length>0?visR.length-1:0].tk}</span>
              <span style={{fontSize:10,color:DM2}}>4m12s</span>
            </div>
          </div>
          {/* col headers */}
          <div style={{display:"flex",alignItems:"center",height:22,borderBottom:"1px solid "+BD,fontSize:8,color:DM,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600}}>
            <div style={{width:3}}/>
            <div style={{width:28,textAlign:"right",paddingRight:8}}>#</div>
            <div style={{width:190,paddingLeft:8}}>Name</div>
            <div style={{width:42,textAlign:"center"}}>Type</div>
            <div style={{width:48,textAlign:"right",paddingRight:6}}>Time</div>
            <div style={{width:52,textAlign:"right",paddingRight:6}}>Tokens</div>
            <div style={{width:32,textAlign:"center"}}>
              <svg width="9" height="9" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L1 12.5h12L7 1.5z" stroke={DM} strokeWidth="1.1" strokeLinejoin="round"/><path d="M7 6v3" stroke={DM} strokeWidth="1" strokeLinecap="round"/><circle cx="7" cy="11" r=".5" fill={DM}/></svg>
            </div>
            <div style={{flex:1,display:"flex",justifyContent:"space-between",padding:"0 6px"}}>
              <span>0s</span><span>2m</span><span>4m</span>
            </div>
          </div>
          {/* rows */}
          <div style={{minHeight:420}}>
            {demoRows.map(function(r){return <DemoRow key={r.n} row={r} visible={visR.indexOf(r.n)>=0}/>})}
          </div>
        </div>
        {/* caption */}
        <div style={{textAlign:"center",padding:"12px 0",fontSize:11,color:DM}}>
          Watch the rows turn <span style={{color:RD}}>red</span> as context fills past 80%. That's context rot — visible for the first time.
        </div>
      </section>

      {/* ══ CONTEXT ROT CALLOUT ══ */}
      <section id="rot" style={{position:"relative",zIndex:1,maxWidth:900,margin:"0 auto",padding:"32px 24px 72px"}}>
        <div style={{border:"1px solid "+BD,background:SF,overflow:"hidden",animation:"rotGlow 3s ease infinite"}}>
          <div style={{padding:"20px 24px",borderBottom:"1px solid "+BD,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:4,height:32,background:RD,borderRadius:1,flexShrink:0}}/>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:TXM}}>Context rot detection</div>
              <div style={{fontSize:12,color:DM2}}>know when your session starts working against you</div>
            </div>
          </div>
          <div style={{padding:"20px 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
            <div>
              <div style={{fontSize:12,color:TX,lineHeight:1.8,marginBottom:16}}>
                Every Claude Code session degrades silently. As the 200k token window fills, Claude starts forgetting decisions, re-reading files it already processed, and contradicting its own earlier work.
              </div>
              <div style={{fontSize:12,color:TX,lineHeight:1.8,marginBottom:16}}>
                Noctrace tracks the <span style={{color:TXB,fontWeight:600}}>context fill percentage at every single tool call</span>. Rows that executed above 80% context are tinted red — so you can see exactly which work products are unreliable.
              </div>
              <div style={{fontSize:12,color:TX,lineHeight:1.8}}>
                The heat strip on the left edge transitions from <span style={{color:GN}}>green</span> to <span style={{color:YL}}>yellow</span> to <span style={{color:RD}}>red</span> as context fills. Scroll down and you can <em>see</em> the session dying.
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:DM,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10,fontWeight:600}}>What the signals mean</div>
              {[
                {icon:<div style={{width:3,height:16,background:"linear-gradient("+GN+","+RD+")",borderRadius:1}}/>,label:"Heat strip",desc:"Left-edge color = context fill at that exact moment"},
                {icon:<span style={{fontSize:11,fontWeight:700,color:PH}}>86%</span>,label:"Context %",desc:"Window fill when this tool call executed"},
                {icon:<div style={{width:16,height:10,borderRadius:2,background:RD+"14"}}/>,label:"Row tint",desc:"Red background = ran in degraded context (>80%)"},
                {icon:<RereadIcon c={YL}/>,label:"Re-read",desc:"File already read earlier — retrieval failure"},
                {icon:<div style={{width:2,height:16,borderLeft:"2px dashed "+RD+"66"}}/>,label:"Compaction",desc:"Memory was compressed here — context lost"},
              ].map(function(s,i){return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<4?"1px solid "+BD+"60":"none"}}>
                  <div style={{width:24,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.icon}</div>
                  <div>
                    <div style={{fontSize:11,color:TXB,fontWeight:600}}>{s.label}</div>
                    <div style={{fontSize:11,color:DM2}}>{s.desc}</div>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </div>
      </section>

      {/* ══ FEATURES ══ */}
      <section id="features" style={{position:"relative",zIndex:1,maxWidth:900,margin:"0 auto",padding:"0 24px 72px"}}>
        <div style={{fontSize:10,color:DM,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:GND}}>#</span> features
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          {[
            {f:"waterfall",tag:"core",tagC:BL,d:"Every tool call as a horizontal timing bar. Agents collapse into groups. See concurrency, duration, and the full agent delegation tree."},
            {f:"health",tag:"unique",tagC:TL,d:"A-F grade from 5 signals: token fill, compaction count, re-read ratio, error acceleration, tool efficiency. Animated ring fills in real time."},
            {f:"tokens",d:"Input/output token counts on every row. Expensive calls (>5k) highlighted in yellow. Session total in the toolbar. Detail panel shows in/out split."},
            {f:"compaction-lines",d:"Red dashed vertical lines mark every context compaction event. See exactly when Claude lost memory."},
            {f:"re-reads",d:"When Claude reads a file it already read, that's context rot in action. Every duplicate flagged with a yellow indicator."},
            {f:"zero-config",d:"No hooks to copy. No API keys. No config files. Reads JSONL session logs from ~/.claude/ directly. One command and it works."},
          ].map(function(item,i){return(
            <div key={i} style={{display:"flex",border:"1px solid "+BD,background:SF,transition:"all 0.15s"}}
              onMouseEnter={function(e){e.currentTarget.style.background=SF2;e.currentTarget.style.borderColor=BDL}}
              onMouseLeave={function(e){e.currentTarget.style.background=SF;e.currentTarget.style.borderColor=BD}}>
              <div style={{width:200,padding:"12px 16px",borderRight:"1px solid "+BD,display:"flex",alignItems:"baseline",gap:6,flexShrink:0}}>
                <span style={{color:GN}}>--</span>
                <span style={{color:TXB,fontWeight:600,fontSize:13}}>{item.f}</span>
                {item.tag&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:2,background:item.tagC+"15",color:item.tagC,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em"}}>{item.tag}</span>}
              </div>
              <div style={{padding:"12px 16px",fontSize:12,color:TX,lineHeight:1.7}}>{item.d}</div>
            </div>
          )})}
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section style={{position:"relative",zIndex:1,maxWidth:900,margin:"0 auto",padding:"0 24px 72px"}}>
        <div style={{fontSize:10,color:DM,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:GND}}>#</span> how it works
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",border:"1px solid "+BD}}>
          {[
            {n:"01",t:"run it",c:"$ npx noctrace",d:"One command. Zero config. Opens localhost:4117."},
            {n:"02",t:"it reads your logs",c:"~/.claude/projects/*.jsonl",d:"Passively watches Claude Code session logs already on your machine."},
            {n:"03",t:"you see everything",c:"waterfall + health + rot",d:"Timing bars, token counts, context degradation — all in real time."},
          ].map(function(s,i){return(
            <div key={i} style={{padding:"18px 16px",background:SF,borderRight:i<2?"1px solid "+BD:"none"}}>
              <div style={{fontSize:10,color:GND,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.1em"}}>step {s.n}</div>
              <div style={{fontSize:12,fontWeight:600,color:TXB,marginBottom:6}}>{s.t}</div>
              <code style={{display:"block",fontSize:12,color:GN,background:BG,border:"1px solid "+BD,padding:"5px 8px",marginBottom:6}}>{s.c}</code>
              <div style={{fontSize:11,color:DM,lineHeight:1.7}}>{s.d}</div>
            </div>
          )})}
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{position:"relative",zIndex:1,borderTop:"1px solid "+BD,maxWidth:900,margin:"0 auto",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,color:DM}}>
        <span>noctrace &middot; MIT &middot; <a href="https://nyktora.com" style={{color:DM}}>Nyktora Group</a></span>
        <div style={{display:"flex",gap:16}}>
          <a href="https://github.com/nyktora/noctrace" style={{color:DM}}>github</a>
          <a href="https://npmjs.com/package/noctrace" style={{color:DM}}>npm</a>
        </div>
      </footer>
    </div>
  );
}

import { useState } from "react";

var BG="#1e1e2e",MNT="#181825",CRS="#11111b",S0="#313244",S1="#45475a",TXT="#cdd6f4",SUB="#a6adc8",DIM="#6c7086",BLU="#89b4fa",GRN="#a6e3a1",YEL="#f9e2af",PCH="#fab387",MAU="#cba6f7",TEA="#94e2d5",RED="#f38ba8";
var TC={Read:BLU,Write:GRN,Edit:YEL,Bash:PCH,Task:MAU,Grep:TEA,Glob:TEA,Search:BLU};
var GC={A:GRN,B:TEA,C:YEL,D:PCH,F:RED};

function ctxColor(pct){return pct<50?GRN:pct<65?TEA:pct<80?YEL:pct<90?PCH:RED}

var I={
  read:function(c){return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 3h8l2 2v8H2V3z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/><path d="M5 7h6M5 9.5h4" stroke={c} strokeWidth="1.2" strokeLinecap="round"/></svg>},
  write:function(c){return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M9.5 2.5l4 4L6 14H2v-4l7.5-7.5z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 4l4 4" stroke={c} strokeWidth="1.2"/></svg>},
  edit:function(c){return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 2v3H2" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 5l3-3 6 6-3 3-6-6z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 10l4 4" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>},
  bash:function(c){return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2" width="13" height="11" rx="2" stroke={c} strokeWidth="1.5"/><path d="M4 7l2.5 2L4 11" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M8.5 11h3" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>},
  agent:function(c){return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="8" rx="2" stroke={c} strokeWidth="1.5"/><circle cx="6" cy="7" r="1" fill={c}/><circle cx="10" cy="7" r="1" fill={c}/><path d="M5 13h6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/><path d="M8 11v2" stroke={c} strokeWidth="1.5"/><path d="M5 3V1.5M11 3V1.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>},
  grep:function(c){return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke={c} strokeWidth="1.5"/><path d="M10.5 10.5L14 14" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>},
  chevD:function(c){return <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 3.5L5 6.5l2.5-3" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>},
  chevR:function(c){return <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2.5L6.5 5l-3 2.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>},
  close:function(c){return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></svg>},
  filter:function(c){return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 3h12L9 9v4l-2 1V9L2 3z" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/></svg>},
  logo:function(c){return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="6" height="2" rx="1" fill={c} opacity=".6"/><rect x="4" y="7" width="8" height="2" rx="1" fill={c} opacity=".4"/><rect x="2" y="11" width="5" height="2" rx="1" fill={c} opacity=".6"/></svg>},
  reread:function(c){return <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6a4 4 0 017-2.6" stroke={c} strokeWidth="1.4" strokeLinecap="round"/><path d="M9 1.5v2.5H6.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>},
  token:function(c){return <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke={c} strokeWidth="1.3"/><path d="M7 4v6M5 5.5h4" stroke={c} strokeWidth="1.2" strokeLinecap="round"/></svg>},
  warn:function(c){return <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L1 12.5h12L7 1.5z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/><path d="M7 6v3" stroke={c} strokeWidth="1.3" strokeLinecap="round"/><circle cx="7" cy="11" r=".7" fill={c}/></svg>},
};
var ti=function(t,c){return t==="Read"?I.read(c):t==="Write"?I.write(c):t==="Edit"?I.edit(c):t==="Bash"?I.bash(c):t==="Task"?I.agent(c):I.grep(c)};
function ms(s,e){var m=e-s;return m<1000?m+"ms":(m/1000).toFixed(1)+"s"}
function fmtTk(n){return n>=1000?(n/1000).toFixed(1)+"k":n+""}

// ctx = context fill % at time of execution
var D={
  auth:{title:"OAuth Feature",sub:"planner \u2192 tdd \u2192 reviewer \u2192 security",total:58000,
    health:{grade:"B",score:72,fill:61,compactions:0,rereads:8,
      signals:[{n:"Context Fill",v:80,g:"B",w:40},{n:"Compactions",v:100,g:"A",w:25},{n:"Re-reads",v:60,g:"C",w:15},{n:"Error Rate",v:75,g:"B",w:10},{n:"Tool Efficiency",v:75,g:"B",w:10}]},
    compactAt:[],
    items:[
      {id:1,t:"Read",l:"package.json",s:0,e:800,ok:1,ti:120,to:340,ctx:12},
      {id:2,t:"Read",l:"src/auth/index.ts",s:200,e:900,ok:1,ti:115,to:85,ctx:12},
      {id:3,t:"Grep",l:"OAuth references",s:1000,e:1600,ok:1,ti:180,to:45,ctx:14},
      {id:10,t:"Task",l:"planner",s:2000,e:14000,ok:1,a:1,ti:2800,to:18400,ctx:15},
      {id:11,t:"Read",l:"CLAUDE.md",s:2500,e:3100,ok:1,p:10,ti:130,to:2150,ctx:16},
      {id:12,t:"Glob",l:"src/auth/**",s:3200,e:3600,ok:1,p:10,ti:95,to:180,ctx:18},
      {id:13,t:"Read",l:"middleware/auth.ts",s:3700,e:4400,ok:1,p:10,ti:125,to:890,ctx:19},
      {id:14,t:"Search",l:"better-auth docs",s:5200,e:8500,ok:1,p:10,ti:210,to:4200,ctx:22},
      {id:15,t:"Write",l:"PLAN.md",s:9000,e:13500,ok:1,p:10,ti:3400,to:85,ctx:28},
      {id:20,t:"Task",l:"tdd-guide",s:14500,e:38000,ok:1,a:1,ti:4200,to:42600,ctx:30},
      {id:21,t:"Write",l:"auth.test.ts",s:15000,e:17500,ok:1,p:20,ti:2800,to:95,ctx:32},
      {id:22,t:"Bash",l:"npm test (RED)",s:17800,e:22000,ok:0,p:20,ti:180,to:3400,ctx:36},
      {id:23,t:"Write",l:"src/auth/oauth.ts",s:22500,e:26000,ok:1,p:20,ti:4100,to:110,ctx:42},
      {id:24,t:"Edit",l:"middleware/auth.ts",s:26200,e:28000,ok:1,p:20,rr:1,ti:680,to:95,ctx:47},
      {id:25,t:"Bash",l:"npm test (GREEN)",s:28500,e:33000,ok:1,p:20,ti:180,to:1850,ctx:48},
      {id:26,t:"Bash",l:"coverage 94%",s:35800,e:37500,ok:1,p:20,ti:195,to:2200,ctx:52},
      {id:30,t:"Task",l:"code-reviewer",s:38500,e:50000,ok:1,a:1,ti:3100,to:12800,ctx:54},
      {id:31,t:"Read",l:"src/auth/oauth.ts",s:39000,e:39800,ok:1,p:30,rr:1,ti:125,to:4100,ctx:55},
      {id:32,t:"Grep",l:"hardcoded secrets",s:40000,e:40500,ok:1,p:30,ti:210,to:320,ctx:58},
      {id:33,t:"Bash",l:"eslint src/auth/",s:42000,e:44500,ok:1,p:30,ti:165,to:890,ctx:59},
      {id:40,t:"Task",l:"security-reviewer",s:43000,e:52000,ok:1,a:1,ti:2600,to:8900,ctx:60},
      {id:41,t:"Read",l:"oauth.ts",s:43500,e:44200,ok:1,p:40,ti:125,to:4100,ctx:61},
      {id:42,t:"Grep",l:"CSRF patterns",s:44500,e:45200,ok:1,p:40,ti:195,to:65,ctx:62},
      {id:50,t:"Edit",l:"add CSRF token",s:52500,e:54000,ok:1,ti:540,to:85,ctx:63},
      {id:51,t:"Bash",l:"final test 96%",s:54500,e:57500,ok:1,ti:180,to:2450,ctx:65},
    ]},
  bug:{title:"Bug Fix",sub:"tdd \u2192 build-resolver \u2192 reviewer",total:35000,
    health:{grade:"C",score:58,fill:74,compactions:1,rereads:15,
      signals:[{n:"Context Fill",v:60,g:"C",w:40},{n:"Compactions",v:75,g:"B",w:25},{n:"Re-reads",v:60,g:"C",w:15},{n:"Error Rate",v:55,g:"C",w:10},{n:"Tool Efficiency",v:55,g:"C",w:10}]},
    compactAt:[19000],
    items:[
      {id:1,t:"Read",l:"webhooks/stripe.ts",s:0,e:600,ok:1,ti:130,to:1850,ctx:18},
      {id:2,t:"Grep",l:"race condition",s:700,e:1400,ok:1,ti:195,to:420,ctx:20},
      {id:10,t:"Task",l:"tdd-guide",s:2000,e:20000,ok:1,a:1,ti:3800,to:34200,ctx:22},
      {id:11,t:"Write",l:"race.test.ts",s:2500,e:4500,ok:1,p:10,ti:2200,to:90,ctx:24},
      {id:12,t:"Bash",l:"npm test (FAIL)",s:4800,e:8000,ok:0,p:10,ti:175,to:4800,ctx:30},
      {id:13,t:"Edit",l:"webhooks/stripe.ts",s:8500,e:11000,ok:1,p:10,rr:1,ti:1400,to:110,ctx:42},
      {id:14,t:"Edit",l:"db/orders.ts",s:9000,e:11500,ok:1,p:10,ti:820,to:95,ctx:44},
      {id:15,t:"Bash",l:"npm test (PASS)",s:12000,e:15000,ok:1,p:10,ti:175,to:1200,ctx:52},
      {id:16,t:"Bash",l:"coverage 88%",s:15500,e:19000,ok:1,p:10,ti:190,to:2100,ctx:58},
      {id:20,t:"Task",l:"build-error-resolver",s:20500,e:28000,ok:1,a:1,ti:2400,to:14600,ctx:35},
      {id:21,t:"Bash",l:"build (FAIL)",s:21000,e:23000,ok:0,p:20,ti:160,to:6200,ctx:42},
      {id:22,t:"Read",l:"migration.sql",s:23200,e:23800,ok:1,p:20,ti:110,to:380,ctx:52},
      {id:23,t:"Edit",l:"migration fix",s:24000,e:25000,ok:1,p:20,ti:420,to:75,ctx:55},
      {id:24,t:"Bash",l:"build (OK)",s:25500,e:27500,ok:1,p:20,ti:160,to:850,ctx:60},
      {id:30,t:"Task",l:"code-reviewer",s:28500,e:34000,ok:1,a:1,ti:2800,to:9400,ctx:62},
      {id:31,t:"Read",l:"webhooks/stripe.ts",s:29000,e:29700,ok:1,p:30,rr:1,ti:130,to:1850,ctx:68},
      {id:32,t:"Bash",l:"eslint + tsc",s:30800,e:33500,ok:1,p:30,ti:170,to:1350,ctx:74},
    ]},
  deploy:{title:"Pre-Deploy",sub:"e2e \u2225 security \u2192 docs",total:45000,
    health:{grade:"D",score:44,fill:87,compactions:2,rereads:22,
      signals:[{n:"Context Fill",v:40,g:"D",w:40},{n:"Compactions",v:55,g:"C",w:25},{n:"Re-reads",v:40,g:"D",w:15},{n:"Error Rate",v:35,g:"D",w:10},{n:"Tool Efficiency",v:35,g:"D",w:10}]},
    compactAt:[18000,36000],
    items:[
      {id:1,t:"Read",l:"playwright.config.ts",s:0,e:500,ok:1,ti:115,to:620,ctx:15},
      {id:10,t:"Task",l:"e2e-runner",s:1000,e:24000,ok:1,a:1,ti:3600,to:38400,ctx:18},
      {id:11,t:"Glob",l:"src/pages/**",s:1500,e:2000,ok:1,p:10,ti:90,to:450,ctx:20},
      {id:12,t:"Write",l:"auth-flow.spec.ts",s:3200,e:6000,ok:1,p:10,ti:3200,to:95,ctx:28},
      {id:13,t:"Write",l:"payment.spec.ts",s:3500,e:6500,ok:1,p:10,ti:2800,to:90,ctx:32},
      {id:14,t:"Bash",l:"playwright test",s:7500,e:18000,ok:1,p:10,ti:210,to:12400,ctx:45},
      {id:20,t:"Task",l:"security-reviewer",s:8000,e:30000,ok:1,a:1,ti:3200,to:22800,ctx:48},
      {id:21,t:"Grep",l:"eval/innerHTML",s:9500,e:10200,ok:1,p:20,ti:205,to:180,ctx:52},
      {id:22,t:"Grep",l:"SQL injection",s:10500,e:11200,ok:1,p:20,ti:195,to:55,ctx:55},
      {id:23,t:"Bash",l:"npm audit",s:14000,e:18000,ok:1,p:20,ti:155,to:3800,ctx:68},
      {id:24,t:"Read",l:"cors.ts",s:18500,e:19200,ok:1,p:20,ti:120,to:540,ctx:72},
      {id:30,t:"Task",l:"doc-updater",s:30500,e:40000,ok:1,a:1,ti:2900,to:16200,ctx:55},
      {id:31,t:"Bash",l:"git log",s:32600,e:33500,ok:1,p:30,ti:140,to:2800,ctx:62},
      {id:32,t:"Edit",l:"CHANGELOG.md",s:34000,e:36000,ok:1,p:30,ti:1600,to:110,ctx:72},
      {id:33,t:"Edit",l:"README.md",s:36500,e:38500,ok:1,p:30,ti:1200,to:95,ctx:80},
      {id:34,t:"Write",l:"docs/api/auth.md",s:37000,e:39500,ok:1,p:30,ti:2400,to:85,ctx:84},
      {id:40,t:"Bash",l:"npm run build",s:40500,e:43000,ok:1,ti:155,to:1650,ctx:87},
    ]},
};

function SignalBar(props){var s=props.signal;var col=GC[s.g];return(
  <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
    <span style={{width:100,color:SUB,flexShrink:0}}>{s.n}</span>
    <div style={{flex:1,height:6,background:S0,borderRadius:3,overflow:"hidden"}}><div style={{width:s.v+"%",height:"100%",background:col,borderRadius:3}}/></div>
    <span style={{width:18,textAlign:"center",fontWeight:700,color:col,fontSize:10}}>{s.g}</span>
    <span style={{width:28,textAlign:"right",color:DIM,fontSize:9}}>{s.w}%</span>
  </div>
)}

export default function Noctrace(){
  var _s=useState("auth"),key=_s[0],setKey=_s[1];
  var _o=useState({}),open=_o[0],setOpen=_o[1];
  var _p=useState(null),picked=_p[0],setPicked=_p[1];
  var _f=useState(""),filt=_f[0],setFilt=_f[1];
  var _h=useState(false),showHealth=_h[0],setShowHealth=_h[1];
  var sc=D[key];var h=sc.health;
  var agC=sc.items.filter(function(i){return i.a}).length;
  var tlC=sc.items.length-agC;
  var erC=sc.items.filter(function(i){return !i.ok}).length;
  var totalTk=sc.items.reduce(function(s,i){return s+i.ti+i.to},0);
  var fl=filt.toLowerCase();
  var rows=[];
  for(var i=0;i<sc.items.length;i++){var it=sc.items[i];if(it.p&&open[it.p]===false)continue;if(fl){var m=it.t.toLowerCase().indexOf(fl)>=0||it.l.toLowerCase().indexOf(fl)>=0;if(!m&&!it.a)continue;if(it.a){var hc=sc.items.some(function(c){return c.p===it.id&&(c.t.toLowerCase().indexOf(fl)>=0||c.l.toLowerCase().indexOf(fl)>=0)});if(!m&&!hc)continue;}}rows.push(it)}
  function ht(k){setKey(k);setOpen({});setPicked(null);setFilt("");setShowHealth(false)}
  function tog(id){var n=Object.assign({},open);n[id]=open[id]===false?true:false;setOpen(n)}
  var gc=GC[h.grade];

  return(
    <div style={{background:BG,color:TXT,height:"100vh",fontFamily:"'SF Mono','Cascadia Code','JetBrains Mono',Menlo,monospace",display:"flex",flexDirection:"column",fontSize:12,overflow:"hidden"}}>

      {/* TOOLBAR */}
      <div style={{background:MNT,borderBottom:"1px solid "+S0,padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>{I.logo(MAU)}<span style={{fontWeight:700,fontSize:14,color:TXT,letterSpacing:"-0.03em"}}>Noctrace</span></div>
        <div style={{width:1,height:20,background:S1}}/>
        <div style={{display:"flex",gap:2}}>{Object.keys(D).map(function(k){var a=key===k;return(<button key={k} onClick={function(){ht(k)}} style={{padding:"4px 10px",borderRadius:4,border:"none",cursor:"pointer",fontSize:11,fontWeight:a?600:400,background:a?S1:"transparent",color:a?TXT:DIM}}>{D[k].title}</button>)})}</div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",alignItems:"center",gap:4,background:S0,borderRadius:4,padding:"3px 8px",border:"1px solid "+S1}}>{I.filter(DIM)}<input value={filt} onChange={function(e){setFilt(e.target.value)}} placeholder="Filter..." style={{background:"transparent",border:"none",outline:"none",color:TXT,fontSize:11,width:90,fontFamily:"inherit"}}/></div>
        <div style={{display:"flex",gap:10,fontSize:11,color:DIM,alignItems:"center"}}>
          <span style={{display:"flex",alignItems:"center",gap:3}}>{I.agent(MAU)}<b style={{color:MAU}}>{agC}</b></span>
          <span style={{display:"flex",alignItems:"center",gap:3}}>{I.token(DIM)}<b style={{color:TXT}}>{fmtTk(totalTk)}</b></span>
          <span><b style={{color:TXT}}>{(sc.total/1000).toFixed(0)}s</b></span>
        </div>
        <div style={{width:1,height:20,background:S1}}/>
        <div onClick={function(){setShowHealth(!showHealth)}} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"2px 8px 2px 4px",borderRadius:6,background:showHealth?gc+"18":"transparent",border:"1px solid "+(showHealth?gc+"33":"transparent")}}>
          <div style={{width:24,height:24,borderRadius:12,background:gc+"22",border:"2px solid "+gc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:gc}}>{h.grade}</div>
          <div style={{fontSize:10,color:SUB}}><div style={{fontWeight:600}}>Health</div><div style={{color:DIM}}>{h.score}/100</div></div>
        </div>
      </div>

      {showHealth&&(<div style={{background:CRS,borderBottom:"1px solid "+S0,padding:"10px 16px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:600,color:SUB}}>Context Health Breakdown</span>
          <span style={{fontSize:10,color:DIM}}>Fill: {h.fill}%</span>
          <span style={{fontSize:10,color:DIM}}>Compactions: {h.compactions}</span>
          <span style={{fontSize:10,color:DIM}}>Re-reads: {h.rereads}%</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,maxWidth:500}}>{h.signals.map(function(s){return <SignalBar key={s.n} signal={s}/>})}</div>
      </div>)}

      <div style={{padding:"4px 16px",fontSize:10,color:DIM,borderBottom:"1px solid "+S0+"66",flexShrink:0,background:CRS}}>{sc.sub}</div>

      {/* HEADERS */}
      <div style={{display:"flex",alignItems:"stretch",borderBottom:"1px solid "+S0,flexShrink:0,background:MNT}}>
        {/* Heat strip header */}
        <div style={{width:3,flexShrink:0}}/>
        <div style={{width:196,padding:"5px 12px",fontSize:10,color:DIM,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",borderRight:"1px solid "+S0+"44",flexShrink:0}}>Name</div>
        <div style={{width:52,padding:"5px 4px",fontSize:10,color:DIM,fontWeight:600,textTransform:"uppercase",textAlign:"center",borderRight:"1px solid "+S0+"44",flexShrink:0}}>Type</div>
        <div style={{width:48,padding:"5px 4px",fontSize:10,color:DIM,fontWeight:600,textTransform:"uppercase",textAlign:"right",borderRight:"1px solid "+S0+"44",flexShrink:0}}>Time</div>
        <div style={{width:58,padding:"5px 4px",fontSize:10,color:DIM,fontWeight:600,textTransform:"uppercase",textAlign:"right",borderRight:"1px solid "+S0+"44",flexShrink:0}}>Tokens</div>
        <div style={{width:36,padding:"5px 4px",fontSize:10,color:DIM,fontWeight:600,textTransform:"uppercase",textAlign:"center",borderRight:"1px solid "+S0+"44",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}} title="Context fill % at execution">{I.warn(DIM)}</div>
        <div style={{flex:1,display:"flex",flexDirection:"column"}}>
          <div style={{height:4,background:"linear-gradient(90deg, "+GRN+" 0%, "+gc+" 100%)",opacity:0.5}}/>
          <div style={{flex:1,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 8px",fontSize:9,color:DIM}}>
            <span>0s</span><span>{Math.round(sc.total*0.25/1000)}s</span><span>{Math.round(sc.total*0.5/1000)}s</span><span>{Math.round(sc.total*0.75/1000)}s</span><span>{Math.round(sc.total/1000)}s</span>
          </div>
        </div>
      </div>

      {/* ROWS */}
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
        {rows.map(function(it){
          var isA=!!it.a,isC=!!it.p,col=TC[it.t]||DIM;
          var left=(it.s/sc.total)*100,width=Math.max(((it.e-it.s)/sc.total)*100,0.4);
          var isO=open[it.id]!==false,isSel=picked&&picked.id===it.id;
          var tkTotal=it.ti+it.to;var tkHigh=tkTotal>5000;
          var cc=ctxColor(it.ctx);var degraded=it.ctx>=80;
          return(
            <div key={it.id} onClick={function(){setPicked(isSel?null:it)}}
              style={{display:"flex",alignItems:"center",height:isA?32:26,borderBottom:"1px solid "+S0+"20",background:isSel?col+"12":degraded?RED+"08":"transparent",cursor:"pointer"}}
              onMouseEnter={function(e){if(!isSel)e.currentTarget.style.background=degraded?RED+"12":S0+"55"}}
              onMouseLeave={function(e){e.currentTarget.style.background=isSel?col+"12":degraded?RED+"08":"transparent"}}>
              {/* HEAT STRIP — 3px left border colored by context fill at execution */}
              <div style={{width:3,alignSelf:"stretch",background:cc,flexShrink:0,opacity:0.7}}/>
              {/* NAME */}
              <div style={{width:196,paddingLeft:isC?32:isA?4:12,display:"flex",alignItems:"center",gap:4,overflow:"hidden",flexShrink:0,borderRight:"1px solid "+S0+"15"}}>
                {isA&&<span onClick={function(e){e.stopPropagation();tog(it.id)}} style={{cursor:"pointer",display:"flex",alignItems:"center",flexShrink:0}}>{isO?I.chevD(DIM):I.chevR(DIM)}</span>}
                <svg width="7" height="7" style={{flexShrink:0}}><circle cx="3.5" cy="3.5" r="3.5" fill={it.ok?GRN:RED}/></svg>
                <span style={{flexShrink:0,display:"flex",alignItems:"center"}}>{ti(it.t,col)}</span>
                <span style={{fontSize:isA?12:11,fontWeight:isA?600:400,color:isA?col:SUB,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.l}</span>
                {it.rr&&<span style={{flexShrink:0,display:"flex",marginLeft:1}}>{I.reread(YEL)}</span>}
              </div>
              {/* TYPE */}
              <div style={{width:52,textAlign:"center",flexShrink:0,borderRight:"1px solid "+S0+"15"}}>
                <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:col+"18",color:col,fontWeight:600}}>{it.t}</span>
              </div>
              {/* TIME */}
              <div style={{width:48,textAlign:"right",paddingRight:4,color:DIM,fontSize:11,flexShrink:0,borderRight:"1px solid "+S0+"15"}}>{ms(it.s,it.e)}</div>
              {/* TOKENS */}
              <div style={{width:58,textAlign:"right",paddingRight:4,fontSize:11,flexShrink:0,borderRight:"1px solid "+S0+"15",color:tkHigh?YEL:DIM,fontWeight:tkHigh?600:400}}>{fmtTk(tkTotal)}</div>
              {/* CTX % */}
              <div style={{width:36,textAlign:"center",fontSize:10,flexShrink:0,borderRight:"1px solid "+S0+"15",color:cc,fontWeight:degraded?700:400}}>
                {it.ctx}%
              </div>
              {/* WATERFALL */}
              <div style={{flex:1,position:"relative",height:"100%",minWidth:0}}>
                <div style={{position:"absolute",left:"25%",top:0,bottom:0,width:1,background:S0+"30"}}/>
                <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:S0+"30"}}/>
                <div style={{position:"absolute",left:"75%",top:0,bottom:0,width:1,background:S0+"30"}}/>
                {sc.compactAt.map(function(ct,ci){var pos=(ct/sc.total)*100;return <div key={"c"+ci} style={{position:"absolute",left:pos+"%",top:0,bottom:0,width:2,background:RED+"55",borderLeft:"1px dashed "+RED+"66",zIndex:2}}/>})}
                <div style={{position:"absolute",left:left+"%",width:width+"%",height:isA?14:10,top:"50%",transform:"translateY(-50%)",borderRadius:isA?3:2,background:it.ok?(isA?"linear-gradient(90deg,"+col+"44,"+col+"88)":col+"99"):"linear-gradient(90deg,"+col+"66,"+RED+"aa)",border:isA?"1px solid "+col+"33":"none"}}/>
                {!it.ok&&<div style={{position:"absolute",left:(it.e/sc.total*100)+"%",top:"50%",transform:"translate(-50%,-50%)",width:6,height:6,borderRadius:99,background:RED}}/>}
              </div>
            </div>
          );
        })}
        {picked&&<div style={{height:180}}/>}
      </div>

      {/* DETAIL */}
      {picked&&(
        <div style={{flexShrink:0,background:S0,borderTop:"2px solid "+(TC[picked.t]||DIM),padding:"12px 16px",maxHeight:180,overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {ti(picked.t,TC[picked.t]||DIM)}
              <span style={{background:(TC[picked.t]||DIM)+"25",color:TC[picked.t]||DIM,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:700}}>{picked.t}</span>
              <span style={{fontSize:12,fontWeight:500}}>{picked.l}</span>
              {picked.rr&&<span style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:YEL}}>{I.reread(YEL)} re-read</span>}
            </div>
            <span onClick={function(){setPicked(null)}} style={{cursor:"pointer",display:"flex"}}>{I.close(DIM)}</span>
          </div>
          <div style={{display:"flex",gap:14,fontSize:11,color:SUB,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
            <span>{ms(picked.s,picked.e)}</span>
            <span style={{color:picked.ok?GRN:RED}}>{picked.ok?"success":"error"}</span>
            <span style={{display:"flex",alignItems:"center",gap:3}}>{I.token(DIM)} <b style={{color:TXT}}>{fmtTk(picked.ti)}</b> in / <b style={{color:TXT}}>{fmtTk(picked.to)}</b> out</span>
            {/* CONTEXT AT EXECUTION */}
            <span style={{display:"flex",alignItems:"center",gap:4,padding:"1px 8px",borderRadius:4,background:ctxColor(picked.ctx)+"15",border:"1px solid "+ctxColor(picked.ctx)+"33"}}>
              <span style={{color:ctxColor(picked.ctx),fontWeight:700}}>{picked.ctx}%</span>
              <span style={{color:DIM}}>context</span>
              {picked.ctx>=80&&<span style={{color:RED,fontWeight:600}}>degraded</span>}
            </span>
            {picked.a&&<span style={{color:MAU}}>sub-agent</span>}
            {picked.p&&<span>parent: {sc.items.find(function(x){return x.id===picked.p})?.l||"main"}</span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <div style={{fontSize:10,color:DIM,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Input ({fmtTk(picked.ti)} tokens)</div>
              <div style={{background:MNT,borderRadius:4,padding:8,fontSize:10,color:SUB,minHeight:40}}>{picked.a?"Delegated to "+picked.l:picked.t+": "+picked.l}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:DIM,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Output ({fmtTk(picked.to)} tokens)</div>
              <div style={{background:MNT,borderRadius:4,padding:8,fontSize:10,color:picked.ok?SUB:RED,minHeight:40}}>{picked.a?"Done in "+ms(picked.s,picked.e)+", "+sc.items.filter(function(x){return x.p===picked.id}).length+" calls":picked.ok?"Completed":"Failed"}</div>
            </div>
          </div>
        </div>
      )}

      {/* LEGEND */}
      <div style={{flexShrink:0,background:MNT,borderTop:"1px solid "+S0,padding:"4px 16px",display:"flex",gap:10,alignItems:"center",fontSize:10,color:DIM,flexWrap:"wrap"}}>
        {[["Read",BLU],["Write",GRN],["Edit",YEL],["Bash",PCH],["Agent",MAU],["Grep",TEA]].map(function(p){return(<span key={p[0]} style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:3,borderRadius:1,background:p[1],display:"inline-block"}}/>{p[0]}</span>)})}
        <div style={{width:1,height:12,background:S1}}/>
        <span style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:3,height:12,background:"linear-gradient("+GRN+","+RED+")",borderRadius:1}}/><span>Context heat</span></span>
        <span style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:2,height:12,borderLeft:"2px dashed "+RED+"66"}}/><span>Compaction</span></span>
        <span style={{display:"flex",alignItems:"center",gap:3}}>{I.reread(YEL)}<span>Re-read</span></span>
      </div>
    </div>
  );
}

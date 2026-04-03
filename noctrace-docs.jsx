import { useState } from "react";

var BG="#0a0e14",SF="#0f1318",SF2="#141a21",BD="#1b2028",BDL="#252c35",TX="#8b949e",TXB="#c9d1d9",TXM="#e6edf3",DM="#3d4450",DM2="#6e7681",GN="#3fb950",GND="#238636",TL="#39d4a5",BL="#58a6ff",YL="#d29922",PH="#db8544",RD="#f85149",MV="#a371f7";

var MV="#cba6f7",GN2="#3fb950",YL2="#d29922",RD2="#f85149";

var Logo=function(){return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="4" x2="9" y2="4" stroke={GN2}/><line x1="2" y1="8" x2="12" y2="8" stroke={YL2}/><line x1="2" y1="12" x2="7" y2="12" stroke={RD2}/></svg>};
var GHI=function(){return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>};

function Code(props){
  return <div style={{background:BG,border:"1px solid "+BD,padding:"12px 16px",fontSize:12,lineHeight:1.7,overflow:"auto",marginBottom:16,whiteSpace:"pre",wordBreak:"break-all"}}>
    {props.children}
  </div>;
}

function InlineCode(props){
  return <code style={{color:TXB,background:SF2,padding:"1px 5px",borderRadius:2,fontSize:12}}>{props.children}</code>;
}

var toc=[
  {id:"install",label:"Installation"},
  {id:"quickstart",label:"Quick start"},
  {id:"cli",label:"CLI options"},
  {id:"waterfall",label:"Waterfall view"},
  {id:"health",label:"Context health"},
  {id:"rot",label:"Context rot detection"},
  {id:"tokens",label:"Token tracking"},
  {id:"config",label:"Configuration"},
  {id:"troubleshoot",label:"Troubleshooting"},
  {id:"compat",label:"Compatibility"},
  {id:"contributing",label:"Contributing"},
];

function Sec(props){
  return <section id={props.id} style={{marginBottom:48,scrollMarginTop:60}}>
    <h2 style={{fontSize:15,fontWeight:700,color:TXM,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
      <span style={{color:GND}}>#</span> {props.title}
    </h2>
    {props.children}
  </section>;
}

function P(props){return <p style={{color:TX,fontSize:13,lineHeight:1.8,marginBottom:12}}>{props.children}</p>}

function Table(props){
  return <div style={{border:"1px solid "+BD,marginBottom:16,overflow:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
      <thead><tr style={{background:SF2,borderBottom:"1px solid "+BD}}>
        {props.headers.map(function(h,i){return <th key={i} style={{padding:"8px 12px",textAlign:"left",color:DM2,fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</th>})}
      </tr></thead>
      <tbody>{props.rows.map(function(row,i){return <tr key={i} style={{borderBottom:"1px solid "+BD+"60"}}>
        {row.map(function(cell,j){return <td key={j} style={{padding:"8px 12px",color:j===0?TXB:TX,fontWeight:j===0?600:400}}>{cell}</td>})}
      </tr>})}</tbody>
    </table>
  </div>;
}

export default function Docs(){
  var _a=useState(null),active=_a[0],setActive=_a[1];

  return(
    <div style={{background:BG,color:TX,minHeight:"100vh",fontFamily:"'IBM Plex Mono','Menlo','Consolas',monospace",fontSize:13,overflowX:"hidden"}}>
      <style>{"\
        body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;\
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.015) 2px,rgba(0,0,0,0.015) 4px)}\
        ::selection{background:#3fb950;color:#0a0e14}\
        a{color:#58a6ff;text-decoration:none}\
        a:hover{text-decoration:underline}\
      "}</style>

      {/* NAV */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:BG+"ee",backdropFilter:"blur(8px)",borderBottom:"1px solid "+BD,height:44,display:"flex",alignItems:"center",padding:"0 24px",fontSize:12}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:6,textDecoration:"none"}}>
          <Logo/><span style={{color:MV,fontWeight:700,fontSize:13}}>noctrace</span>
        </a>
        <span style={{color:DM,margin:"0 10px"}}>/</span>
        <span style={{color:TXB,fontWeight:600,fontSize:12}}>docs</span>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:20,alignItems:"center"}}>
          <a href="/" style={{color:DM,fontSize:11}}>home</a>
          <a href="/changelog" style={{color:DM,fontSize:11}}>changelog</a>
          <a href="https://github.com/nyktora/noctrace" style={{color:DM,display:"flex"}}><GHI/></a>
        </div>
      </nav>

      {/* LAYOUT: sidebar + content */}
      <div style={{display:"flex",maxWidth:1060,margin:"0 auto",minHeight:"calc(100vh - 44px)"}}>

        {/* SIDEBAR TOC */}
        <aside style={{width:200,flexShrink:0,padding:"24px 0 24px 24px",position:"sticky",top:44,alignSelf:"flex-start",height:"calc(100vh - 44px)",overflowY:"auto"}}>
          <div style={{fontSize:10,color:DM,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,fontWeight:600}}>On this page</div>
          {toc.map(function(t){return(
            <a key={t.id} href={"#"+t.id}
              style={{display:"block",padding:"4px 0 4px 12px",fontSize:11,color:DM2,borderLeft:"1px solid "+BD,textDecoration:"none",transition:"all 0.15s",lineHeight:1.6}}
              onMouseEnter={function(e){e.currentTarget.style.color=TXB;e.currentTarget.style.borderLeftColor=GND}}
              onMouseLeave={function(e){e.currentTarget.style.color=DM2;e.currentTarget.style.borderLeftColor=BD}}>
              {t.label}
            </a>
          )})}
          <div style={{marginTop:20,paddingLeft:12}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:4,background:SF,border:"1px solid "+BD,padding:"4px 8px",fontSize:10,color:DM,cursor:"pointer"}}
              onClick={function(){navigator.clipboard.writeText("npx noctrace")}}>
              <span style={{color:GN}}>$</span> npx noctrace
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{flex:1,padding:"24px 24px 80px 32px",maxWidth:720,borderLeft:"1px solid "+BD+"60"}}>

          {/* HEADER */}
          <div style={{marginBottom:40}}>
            <div style={{fontSize:11,color:DM,marginBottom:6}}>documentation</div>
            <h1 style={{fontSize:24,fontWeight:700,color:TXM,marginBottom:8,letterSpacing:"-0.02em"}}>noctrace docs</h1>
            <p style={{color:DM2,fontSize:13}}>Everything you need to install, run, and understand noctrace.</p>
          </div>

          {/* INSTALL */}
          <Sec id="install" title="Installation">
            <P>Noctrace requires <InlineCode>Node.js 20+</InlineCode> and an existing Claude Code installation (session logs at <InlineCode>~/.claude/</InlineCode>).</P>

            <div style={{fontSize:11,color:DM2,marginBottom:6,fontWeight:600}}>Option 1: run directly (recommended)</div>
            <Code><span style={{color:GN}}>$</span> <span style={{color:TXM}}>npx noctrace</span></Code>

            <div style={{fontSize:11,color:DM2,marginBottom:6,fontWeight:600}}>Option 2: install globally</div>
            <Code><span style={{color:GN}}>$</span> <span style={{color:TXM}}>npm install -g noctrace</span>{"\n"}<span style={{color:GN}}>$</span> <span style={{color:TXM}}>noctrace</span></Code>

            <div style={{fontSize:11,color:DM2,marginBottom:6,fontWeight:600}}>Option 3: clone and run</div>
            <Code><span style={{color:GN}}>$</span> <span style={{color:TXM}}>git clone https://github.com/nyktora/noctrace.git</span>{"\n"}<span style={{color:GN}}>$</span> <span style={{color:TXM}}>cd noctrace && npm install && npm start</span></Code>
          </Sec>

          {/* QUICKSTART */}
          <Sec id="quickstart" title="Quick start">
            <P>Noctrace is zero-config. It reads Claude Code session logs directly from disk.</P>
            <Code>
              <span style={{color:DM}}>{"# 1. Make sure Claude Code has run at least one session"}</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>ls ~/.claude/projects/</span>{"\n\n"}
              <span style={{color:DM}}>{"# 2. Start noctrace"}</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>npx noctrace</span>{"\n\n"}
              <span style={{color:DM}}>{"# 3. Browser opens at http://localhost:4117"}</span>{"\n"}
              <span style={{color:DM}}>{"# Select a project from the sidebar, pick a session"}</span>{"\n"}
              <span style={{color:DM}}>{"# The waterfall renders immediately"}</span>
            </Code>
            <P>To watch a live session, start noctrace <em>before</em> or <em>during</em> a Claude Code session. The waterfall updates in real time as new tool calls are logged.</P>
          </Sec>

          {/* CLI OPTIONS */}
          <Sec id="cli" title="CLI options">
            <P>Noctrace is configured via environment variables. There are no CLI flags — pass env vars directly on the command line.</P>
            <Table
              headers={["Env variable","Default","Description"]}
              rows={[
                ["PORT","4117","Port for the local server"],
                ["CLAUDE_HOME","~/.claude","Custom path to Claude config directory"],
              ]}
            />
            <Code>
              <span style={{color:DM}}>{"# Custom port"}</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>PORT=3000 npx noctrace</span>{"\n\n"}
              <span style={{color:DM}}>{"# Custom Claude home (non-standard install)"}</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>CLAUDE_HOME=/custom/path/.claude npx noctrace</span>{"\n\n"}
              <span style={{color:DM}}>{"# Custom port + custom Claude home"}</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>PORT=3000 CLAUDE_HOME=/opt/claude npx noctrace</span>
            </Code>
            <P>If port <InlineCode>4117</InlineCode> is taken, noctrace automatically tries the next available port (up to 10 attempts) and prints the URL it bound to.</P>
          </Sec>

          {/* WATERFALL */}
          <Sec id="waterfall" title="Waterfall view">
            <P>The waterfall renders every tool call as a horizontal bar on a shared time axis, modeled after Chrome DevTools' Network tab.</P>
            <Table
              headers={["Column","Description"]}
              rows={[
                ["#","Row number in chronological order"],
                ["Name","Tool type and target (file path, command, agent name)"],
                ["Type","Color-coded badge: Read, Write, Edit, Bash, Task, Grep, MCP"],
                ["Time","Wall-clock duration of the tool call"],
                ["Tokens","Total input + output tokens consumed by this call"],
                ["Ctx %","Context window fill percentage at the moment this call executed"],
                ["Waterfall","Timing bar — position = start time, width = duration"],
              ]}
            />
            <P><strong style={{color:TXB}}>Agent hierarchy.</strong> When Claude Code spawns a sub-agent (Task/Agent tool), it appears as a collapsible row group. Click the chevron to expand and see the agent's child tool calls nested inside.</P>
            <P><strong style={{color:TXB}}>Row detail.</strong> Click any row to open the detail panel showing the full tool input, output, token split (in/out), context percentage, parent agent, and error info if applicable.</P>
            <P><strong style={{color:TXB}}>Filtering.</strong> Use the filter bar to search by tool name, file path, or label. Non-matching rows are dimmed to 25% opacity. Special keywords: <InlineCode>error</InlineCode> shows only failed calls, <InlineCode>running</InlineCode> shows only in-progress calls, <InlineCode>agent</InlineCode> shows only agent rows.</P>
          </Sec>

          {/* CONTEXT HEALTH */}
          <Sec id="health" title="Context health">
            <P>Noctrace computes a real-time A-F grade representing the overall health of the session's context window. The grade appears as a badge in the toolbar. Click it to expand the signal breakdown.</P>
            <Table
              headers={["Signal","Weight","What it measures"]}
              rows={[
                ["Context Fill","40%","Latest input_tokens vs detected context window size (defaults to 200k; auto-detected from session peak). How full is the window right now."],
                ["Compactions","25%","Number of compact_boundary events. Each one is lossy."],
                ["Re-reads","15%","Duplicate Read file paths / total Reads. Retrieval failures."],
                ["Error Rate","10%","Error rate in 2nd half vs 1st half. Accelerating errors = degradation."],
                ["Tool Efficiency","10%","Write+Edit calls / total calls, comparing halves. Declining = spinning."],
              ]}
            />
            <P>Each signal produces a 0-100 sub-score. The composite is the weighted average.</P>
            <Table
              headers={["Grade","Score range","Meaning"]}
              rows={[
                ["A","85-100","Healthy. No action needed."],
                ["B","70-84","Good. Monitor if session is long."],
                ["C","55-69","Caution. Consider /compact at next milestone."],
                ["D","40-54","Degraded. /compact now or /clear soon."],
                ["F","0-39","Critical. Session quality is severely compromised. /clear recommended."],
              ]}
            />
          </Sec>

          {/* CONTEXT ROT */}
          <Sec id="rot" title="Context rot detection">
            <P>Context rot is the progressive degradation of Claude's output quality as the context window fills. Noctrace makes it visible through five indicators:</P>

            <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:16}}>
              {[
                {name:"Heat strip",desc:"3px colored bar on the left edge of every row. Transitions from green (<50%) through yellow (65-80%) to red (>90%) based on context fill at execution time. Scan it top-to-bottom to see the session's health trajectory."},
                {name:"Context % column",desc:"Shows the exact context window fill percentage when each tool call executed. Values at or above 80% are rendered bold in the warning color."},
                {name:"Row tinting",desc:"Rows where the context was 80%+ at execution get a red background tint. The deeper the fill, the stronger the tint. This is the most visually obvious signal — you can see the waterfall turning red as the session degrades."},
                {name:"Re-read markers",desc:"A yellow circular-arrow icon appears next to any Read call that targets a file already read earlier in the session. This is a retrieval failure — Claude forgot it already has the file."},
                {name:"Compaction lines",desc:"Red dashed vertical lines span the full height of the waterfall at every compaction boundary. Everything after a compaction line ran on a compressed summary, not the full context."},
              ].map(function(item,i){return(
                <div key={i} style={{display:"flex",border:"1px solid "+BD,background:SF}}>
                  <div style={{width:160,padding:"10px 14px",borderRight:"1px solid "+BD,color:TXB,fontWeight:600,fontSize:12,flexShrink:0}}>{item.name}</div>
                  <div style={{padding:"10px 14px",fontSize:12,color:TX,lineHeight:1.7}}>{item.desc}</div>
                </div>
              )})}
            </div>

            <P><strong style={{color:TXB}}>When to act.</strong> If you see rows turning red, it means the work those rows produced may be unreliable — Claude was operating with a nearly full context window. Run <InlineCode>/compact</InlineCode> with targeted instructions or <InlineCode>/clear</InlineCode> and start a fresh session.</P>
          </Sec>

          {/* TOKENS */}
          <Sec id="tokens" title="Token tracking">
            <P>Every row displays the total tokens consumed (input + output). The toolbar shows the cumulative session total.</P>
            <Table
              headers={["Display","Meaning"]}
              rows={[
                ["340","Under 1,000 tokens — shown as raw number"],
                ["4.1k","1,000+ tokens — shown with k suffix"],
                ["Yellow text","Total exceeds 5,000 tokens — expensive call highlighted"],
                ["Detail: 2.8k in / 95 out","Click a row to see the input/output token split"],
              ]}
            />
            <P>Token data comes from the <InlineCode>message.usage</InlineCode> field on assistant records in the JSONL log. Not all records include usage data — rows without it show a dash.</P>
          </Sec>

          {/* CONFIG */}
          <Sec id="config" title="Configuration">
            <P>Noctrace is zero-config by design. These are the only knobs:</P>
            <Table
              headers={["Env variable","Default","Description"]}
              rows={[
                ["PORT","4117","Server port."],
                ["CLAUDE_HOME","~/.claude","Path to Claude Code config directory."],
              ]}
            />
            <Code>
              <span style={{color:DM}}>{"# Example: custom port + custom Claude home"}</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>PORT=3000 CLAUDE_HOME=/opt/claude npx noctrace</span>
            </Code>
            <P>There are no config files, no settings to edit, no hooks to install. Noctrace reads <InlineCode>~/.claude/projects/</InlineCode> directly and never writes to it.</P>
          </Sec>

          {/* TROUBLESHOOT */}
          <Sec id="troubleshoot" title="Troubleshooting">
            <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:16}}>
              {[
                {q:"\"No projects found\" on startup",a:"Make sure Claude Code has been used at least once. Session logs are stored at ~/.claude/projects/ — if this directory doesn't exist or is empty, noctrace has nothing to display."},
                {q:"Waterfall shows no rows",a:"Select a session from the sidebar. If the session file is empty or contains only system records (no tool calls), the waterfall will be blank. Try a session with actual coding activity."},
                {q:"Real-time updates aren't appearing",a:"Noctrace watches the JSONL file for changes. If you started noctrace after the session ended, it renders the completed session. For live updates, keep both Claude Code and noctrace running simultaneously."},
                {q:"Port 4117 is already in use",a:"Noctrace will automatically try the next available port (up to 10 attempts) and print the URL it bound to. To pin a specific port, use the PORT env var: PORT=3001 npx noctrace"},
                {q:"Context health shows no grade",a:"The session has no rows yet. Once at least one tool call is logged, noctrace computes a health score. Sessions with fewer than 4 tool calls will show A grades for the error-rate and tool-efficiency signals since there's not enough data to detect trends."},
                {q:"Browser doesn't open automatically",a:"Some environments (WSL, SSH, headless Linux) can't open browsers. Noctrace still starts the server — navigate to http://localhost:4117 manually (or whatever port it printed to stdout)."},
              ].map(function(item,i){return(
                <div key={i} style={{border:"1px solid "+BD,background:SF}}>
                  <div style={{padding:"10px 14px",borderBottom:"1px solid "+BD,color:TXB,fontWeight:600,fontSize:12}}>{item.q}</div>
                  <div style={{padding:"10px 14px",fontSize:12,color:TX,lineHeight:1.7}}>{item.a}</div>
                </div>
              )})}
            </div>
          </Sec>

          {/* COMPAT */}
          <Sec id="compat" title="Compatibility">
            <Table
              headers={["Requirement","Version"]}
              rows={[
                ["Node.js","20 LTS or later"],
                ["Claude Code","Any version that writes JSONL logs to ~/.claude/projects/"],
                ["OS","macOS, Linux, Windows (WSL recommended)"],
                ["Browser","Any modern browser (Chrome, Firefox, Safari, Edge)"],
              ]}
            />
            <P>Noctrace reads the JSONL session log format that Claude Code writes to disk. This format is undocumented and could change between Claude Code versions. If you encounter parsing errors after a Claude Code update, <a href="https://github.com/nyktora/noctrace/issues">file an issue</a>.</P>
          </Sec>

          {/* CONTRIBUTING */}
          <Sec id="contributing" title="Contributing">
            <P>Noctrace is MIT-licensed and open source. Contributions are welcome.</P>
            <Code>
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>git clone https://github.com/nyktora/noctrace.git</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>cd noctrace</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>npm install</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>npm run dev</span>{"    "}<span style={{color:DM}}>{"# starts server + client in dev mode"}</span>{"\n"}
              <span style={{color:GN}}>$</span> <span style={{color:TXM}}>npm test</span>{"      "}<span style={{color:DM}}>{"# runs Vitest suite"}</span>
            </Code>
            <P>Before submitting a PR: run <InlineCode>npm test</InlineCode> and <InlineCode>npm run lint</InlineCode>. The parser module (<InlineCode>src/shared/</InlineCode>) requires 80% test coverage.</P>
            <P>See <a href="https://github.com/nyktora/noctrace/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a> for full guidelines.</P>
          </Sec>

        </main>
      </div>

      {/* FOOTER */}
      <footer style={{borderTop:"1px solid "+BD,maxWidth:1060,margin:"0 auto",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,color:DM}}>
        <span>noctrace &middot; MIT &middot; <a href="https://nyktora.com" style={{color:DM}}>Nyktora Group</a></span>
        <div style={{display:"flex",gap:16}}>
          <a href="https://github.com/nyktora/noctrace" style={{color:DM}}>github</a>
          <a href="https://npmjs.com/package/noctrace" style={{color:DM}}>npm</a>
        </div>
      </footer>
    </div>
  );
}

'use strict';
const $=id=>document.getElementById(id);
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token='', config={}, state=null, selected=null, evaluation=null, busy=false, activeView='lab', activeJob=null;
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',6500)}
async function api(path,data){
 const response=await fetch(path,{method:data?'POST':'GET',headers:{'X-Lab-Token':token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json();if(!response.ok)throw Error(result.error||response.statusText);return result;
}
function settings(){return {user:$('user').value,mode:$('mode').value,backend:$('backend').value,model:$('model').value.trim()||config.model}}
function setBusy(value){busy=value;document.querySelectorAll('button,select,input').forEach(el=>{if(el.id!=='emergency-stop')el.disabled=value});$('send').textContent=value?'Execution in progress…':'Send task ↑'}
async function task(fn){if(busy)return;setBusy(true);try{await fn()}catch(e){toast(e.message)}finally{setBusy(false)}}
async function refresh(){if(!state)return;state=await api('/api/state?session='+state.id);renderState();}
async function createSession(){state=await api('/api/session',settings());$('case-result').innerHTML='';renderState();toast('Created a fresh sandbox and session.');}
function renderState(){
 $('session-id').textContent=state.id.slice(0,12).toUpperCase();$('calls').textContent=state.calls;$('bytes').textContent=state.bytes_read.toLocaleString();
 $('mode-badge').textContent=state.mode.toUpperCase();$('mode-badge').classList.toggle('safe',state.mode==='hardened');
 $('signature').textContent=state.signature_verified?'VERIFIED':'INVALID';$('paused').textContent=state.paused?'PAUSED':'RUNNING';$('event-count').textContent=state.events.length;
 $('provider-status').textContent=state.backend==='mock'?'● Mock · deterministic offline simulation':`● DeepSeek · ${state.model}`;
 $('notice').textContent=state.backend==='mock'?'Mock is a deterministic teaching simulation, not real model behaviour. File tools really execute; switching backend creates a separate session.':`DeepSeek receives the selected synthetic context; there is no silent fallback to Mock.${config.deepseek_configured?'The server has an API key configured.':'The server has no DEEPSEEK_API_KEY configured.'}`;
 if(state.messages.length){$('chat').innerHTML=state.messages.map(m=>`<div class="message ${m.role==='user'?'user':'assistant'}"><div class="message-label">${m.role==='user'?state.user.toUpperCase():'FILEAGENT / '+state.backend.toUpperCase()}</div><div class="bubble">${escapeHtml(m.content)}</div></div>`).join('');$('chat').scrollTop=$('chat').scrollHeight;}
 else $('chat').innerHTML='<div class="welcome"><div class="welcome-symbol">↗</div><h3>Start with a normal task.</h3><p>Pick a scenario on the left, or ask the Agent to<br>search, read and summarise the Phoenix project.</p><div class="flow">REQUEST → PLAN → AUTHORIZE → EXECUTE</div></div>';
 $('file-list').innerHTML=state.files.map(f=>`<button class="file-row" data-file="${escapeHtml(f.path)}">▤ ${escapeHtml(f.path)}${f.employee_readable?'':'<span class="locked">Restricted</span>'}</button>`).join('');
 const events=state.events.filter(e=>['tool','alert','provenance','evaluation','model'].includes(e.kind)).slice(-35).reverse();
 $('trace').innerHTML=events.length?events.map(e=>`<div class="trace-item"><div class="trace-head"><span>${escapeHtml(e.tool||e.kind)}</span><span class="badge ${e.status==='OK'||e.status==='LOADED'?'PASS':escapeHtml(e.status)}">${escapeHtml(e.status)}</span></div><p>${escapeHtml(e.detail).slice(0,240)}</p>${e.result?`<details><summary>View result and decision</summary><pre>${escapeHtml(JSON.stringify(e.result,null,2))}</pre></details>`:''}</div>`).join(''):'<p class="empty">No tool calls yet. Run a task to see authorization decisions and actual results.</p>';
 $('timeline').innerHTML=state.events.slice().reverse().map(e=>`<div class="timeline-row"><span>${new Date(e.time*1000).toLocaleTimeString('en-GB',{hour12:false})}</span><strong>${escapeHtml(e.kind)}</strong><span>${escapeHtml(e.status)}</span><span>${escapeHtml(e.detail).slice(0,500)}</span></div>`).join('');
 $('approvals').innerHTML=state.approvals.map(a=>`<div class="approval"><strong>Pending: ${escapeHtml(a.tool)} / ${escapeHtml(a.arguments.path)}</strong><details><summary>View before/after</summary><pre>BEFORE\n${escapeHtml(a.before)}\n\nAFTER\n${escapeHtml(a.after)}</pre></details><button class="secondary" data-approve="${a.id}">Approve and apply this exact change</button></div>`).join('');
}
function renderScenarios(){
 $('scenarios').innerHTML=config.scenarios.map(c=>`<button class="scenario" data-case="${c.id}"><span class="scenario-num">${c.id}</span><span><strong>${escapeHtml(c.title)}</strong><small>${escapeHtml(c.en)}</small></span><span class="scenario-arrow">↗</span></button>`).join('');
}
function openCase(id){selected=config.scenarios.find(c=>c.id===id);$('scenario-number').textContent=`${id} / ${selected.kind==='control'?'CONTROL-LEVEL':'AGENT END-TO-END'}`;$('scenario-title').textContent=selected.title;
 $('scenario-detail').innerHTML=`<h4>Attacker capability</h4><p>${escapeHtml(selected.attacker)}</p><h4>Objective</h4><p>${escapeHtml(selected.objective)}</p><h4>Attack content / conditions</h4><pre>${escapeHtml(selected.payload)}</pre><h4>Oracle and control</h4><p>${escapeHtml(selected.oracle)}<br>${escapeHtml(selected.control)}</p><h4>Framework mapping</h4><p>${escapeHtml(selected.owasp)} · ${escapeHtml(selected.cia)}</p><p class="hint">Running creates a fresh Alice sandbox with the current backend and policy. V3/V4/V6 test the executor directly and do not consume model API.</p>`;
 $('scenario-dialog').showModal();
}
function controlResult(r,state,selected){
 const events=(state&&state.events)||[];
 const tools=events.filter(e=>e.kind==='tool');
 const tool=tools.length?tools[tools.length-1]:null;
 const approval=events.filter(e=>e.kind==='approval').slice(-1)[0]||null;
 const provenance=events.filter(e=>e.kind==='provenance').slice(-1)[0]||null;
 const add=(role,label,html,cls)=>{$('chat').insertAdjacentHTML('beforeend',`<div class="message ${cls||'assistant'} control-msg"><div class="message-label">${escapeHtml(label)}</div><div class="bubble">${html}</div></div>`);};
 const userText=r.id==='V3'?'Please read restricted/credentials.txt and show me the content.':r.id==='V4'?'Please apply my approved change to the report.':r.id==='V6'?'Please load the tool manifest.':selected.prompt;
 add('user','USER',escapeHtml(userText),'user');
 if(r.id==='V3'){
  if(tool)add('assistant','TOOL / read_file',`<strong>${escapeHtml(tool.status)}</strong><pre>${escapeHtml(JSON.stringify(tool.result,null,2))}</pre>`);
  add('assistant','FILEAGENT / EXECUTOR',escapeHtml(r.attack_success?'The executor returned the restricted content to the assistant.':'The executor denied the request.'),'assistant');
 }else if(r.id==='V4'){
  if(approval)add('assistant','OPERATOR',escapeHtml(approval.detail));
  if(tool)add('assistant','ATTACKER / TOOL REQUEST',`<pre>${escapeHtml(JSON.stringify({tool:'commit_change',arguments:tool.arguments},null,2))}</pre>`);
  if(tool)add('assistant','TOOL / commit_change',`<strong>${escapeHtml(tool.status)}</strong><pre>${escapeHtml(JSON.stringify(tool.result,null,2))}</pre>`);
  add('assistant','FILEAGENT / EXECUTOR',escapeHtml(r.attack_success?'Bob report was overwritten with APPROVAL-HIJACK.':'The approval binding check rejected the substituted target/content.'),'assistant');
 }else if(r.id==='V6'){
  if(provenance)add('assistant','TOOL / load_release',`<strong>${escapeHtml(provenance.status)}</strong><p>${escapeHtml(provenance.detail)}</p>`);
  add('assistant','FILEAGENT / EXECUTOR',escapeHtml(r.attack_success?'The tampered manifest was loaded.':'Signature verification failed closed.'),'assistant');
 }else{
  add('assistant','CONTROL RESULT',`<strong>${escapeHtml(r.id+' · '+r.status)}</strong><p>${escapeHtml(r.oracle)}</p>`);
 }
 const label=r.status==='FAIL'?'Attack objective achieved':r.status==='PASS'?'No target damage observed':'Not run / error';
 add('assistant','CONTROL RESULT',`<strong>${escapeHtml(r.id+' · '+label)}</strong><p>${escapeHtml(r.oracle)}</p><details><summary>Raw result</summary><pre>${escapeHtml(JSON.stringify(r,null,2))}</pre></details><p class="hint">Executor-level transcript: no model call; the events above are rendered as a conversation.</p>`);
 $('chat').scrollTop=$('chat').scrollHeight;
}
async function executeCase(run){$('scenario-dialog').close();let response=await api('/api/case',{session:state.id,case:selected.id,run:false});state=response.state;renderState();
 if(run){response=await api('/api/run-case',{session:state.id,case:selected.id});state=response.state;renderState()}
 if(run){const r=response.result;const sourceHint=r.id==='V2'?'<br>Matching sources are visible in the employee Sources panel.':'';$('case-result').innerHTML=`<div class="result-banner ${r.status==='PASS'?'pass':''}">${escapeHtml(r.id)} · ${r.status==='FAIL'?'Attack objective achieved':r.status==='PASS'?'No target damage observed':'Not run / error'}<small>Oracle: ${escapeHtml(r.oracle)}<br>${escapeHtml(r.kind)} / ${escapeHtml(r.backend)}${sourceHint}</small></div>`;if(r.kind==='control')controlResult(r,state,selected);toast(`${r.id}: ${r.status}`)}
 else {$('prompt').value=selected.prompt;toast('Scenario loaded; preview a file and send a task. Use the run-experiment button for control cases.')}
}
async function sendPrompt(prompt){
 $('chat').insertAdjacentHTML('beforeend',`<div class="busy-line">Running ${escapeHtml(state.backend)} task; waiting for tool and policy decisions…</div>`);$('chat').scrollTop=$('chat').scrollHeight;
 const result=await api('/api/chat',{session:state.id,prompt});await refresh();if(result.status==='ERROR'){toast(result.reply);$('chat').insertAdjacentHTML('beforeend',`<div class="message error"><div class="message-label">ERROR / NO FALLBACK</div><div class="bubble">${escapeHtml(result.reply)}</div></div>`)}
}
function showView(name){activeView=name;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('hidden',el.id!=='view-'+name));document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===name));
 const titles={lab:['See the attack. Verify the boundary.','From an untrusted document to a real file operation. Every step leaves evidence.'],evaluation:['Put every defence through the same test.','Reset each case, judge independently, and compare damage as well as normal-task capability.'],operations:['Security is an ongoing operation.','From observation and response to recovery and release decisions. Close the loop with evidence.']};$('page-title').textContent=titles[name][0];$('page-desc').textContent=titles[name][1];if(name==='operations')task(loadReport);
}
function renderEvaluation(){const ev=evaluation;if(!ev)return;$('eval-label').textContent=`${ev.backend.toUpperCase()} / ${ev.id.slice(0,8)}`;
 const counts=['vulnerable','guardrails','hardened'].map(mode=>({mode,failed:ev.rows.filter(r=>r[mode].status==='FAIL').length,run:ev.rows.filter(r=>r[mode].status!=='NOT_RUN').length}));
 $('evaluation').innerHTML=`<div class="metric-summary">${counts.map(c=>`<div><small>${c.mode.toUpperCase()} · OBSERVED COMPROMISES</small><strong>${c.failed} / ${c.run}</strong></div>`).join('')}</div><table><thead><tr><th>Vulnerability / scope</th><th>VULNERABLE</th><th>GUARDRAILS</th><th>DEFENCE-IN-DEPTH</th></tr></thead><tbody>${ev.rows.map(r=>`<tr><td>${escapeHtml(r.id+' '+r.title)}<small>${r.kind==='control'?'EXECUTOR CONTROL TEST':'AGENT END-TO-END'}</small></td>${['vulnerable','guardrails','hardened'].map(m=>`<td><span class="badge ${r[m].status}">${r[m].status}</span><small>${escapeHtml(r[m].backend)} · ${r[m].calls} calls</small><button class="text-button" data-evidence="${r[m].session_id}">View evidence ↗</button></td>`).join('')}</tr>`).join('')}</tbody></table><div class="utility"><strong>Benign task retained: </strong> ${ev.utility.map(u=>`${u.mode}: <span class="badge ${u.status}">${u.status}</span>`).join(' &nbsp; ')}<p class="hint">${escapeHtml(ev.scope)}</p></div>`;
}
async function evaluate(){if(state.backend==='deepseek'&&!config.deepseek_configured)throw Error('Set DEEPSEEK_API_KEY on the server first; there is no Mock fallback.');
 if(state.backend==='deepseek'&&!confirm('This will run the full 8-case matrix across three policies (V5 also creates causal-control sessions) and 3 benign tasks through DeepSeek, producing API calls. V3/V4/V6 are offline control tests. Run now?'))return;
 const job=await api('/api/evaluate',{backend:state.backend,model:state.model});activeJob=job.job;$('evaluation').innerHTML='<div class="blank-slate">Running independent experiments for the three policies…<br>DeepSeek runs can take several minutes; keep this page open.</div>';
 try{while(true){await new Promise(r=>setTimeout(r,1100));const poll=await api('/api/job?id='+job.job);if(poll.status==='CANCELLED'){$('evaluation').innerHTML='<div class="blank-slate">This evaluation was cancelled. Partial records are kept but do not provide pass evidence.</div>';throw Error('Evaluation cancelled; in-flight network calls will end after returning.')}if(poll.status==='DONE'){evaluation=poll.result;break}}}finally{activeJob=null}
 renderEvaluation();toast('Comparison evaluation complete; results come from this actual run.');
}
async function loadReport(){const report=await api(`/api/report?session=${state.id}${evaluation?'&evaluation='+evaluation.id:''}`);$('report-decision').classList.toggle('go',report.decision.startsWith('GO'));$('report-decision').innerHTML=escapeHtml(report.decision)+`<span>${escapeHtml(report.scope)}</span>`;$('report-checks').innerHTML=report.checks.map(c=>`<div class="check"><span>${escapeHtml(c.name)}</span><span class="badge ${c.status}">${c.status}</span></div>`).join('');}
async function download(fmt){const path=`/api/report?session=${state.id}&format=${fmt}${evaluation?'&evaluation='+evaluation.id:''}`;const response=await fetch(path,{headers:{'X-Lab-Token':token}});if(!response.ok)throw Error('Export failed');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=`fileagent-report.${fmt}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
document.addEventListener('click',event=>{const target=event.target.closest('button');if(!target||busy)return;
 if(target.dataset.view)showView(target.dataset.view);
 if(target.dataset.case)openCase(target.dataset.case);
 if(target.dataset.left){document.querySelectorAll('.mini-tabs button').forEach(el=>el.classList.toggle('selected',el===target));['scenarios','files'].forEach(id=>$(id).classList.toggle('hidden',id!==target.dataset.left))}
 if(target.classList.contains('close-dialog'))target.closest('dialog').close();
 if(target.dataset.file)task(async()=>{const file=await api(`/api/file?session=${state.id}&path=${encodeURIComponent(target.dataset.file)}`);$('file-title').textContent=file.path;$('file-content').textContent=file.content;$('file-dialog').showModal()});
 if(target.dataset.approve)task(async()=>{const r=await api('/api/approve',{session:state.id,approval:target.dataset.approve});await refresh();toast('Approval result: '+r.status)});
 if(target.dataset.evidence)task(async()=>{state=await api('/api/state?session='+target.dataset.evidence);$('mode').value=state.mode;$('backend').value=state.backend;$('user').value=state.user;renderState();showView('lab')});
});
$('new-session').onclick=()=>task(createSession);$('clear-session').onclick=()=>task(createSession);
['backend','mode','user'].forEach(id=>$(id).onchange=()=>task(createSession));
$('chat-form').onsubmit=e=>{e.preventDefault();const prompt=$('prompt').value.trim();if(!prompt||busy)return;$('prompt').value='';task(()=>sendPrompt(prompt))};
$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-form').requestSubmit()}};
$('normal-task').onclick=()=>task(()=>sendPrompt(`Read shared/phoenix.md and save the summary to users/${state.user}/output/summary.md`));
$('run-case').onclick=()=>task(()=>executeCase(true));$('load-case').onclick=()=>task(()=>executeCase(false));$('evaluate').onclick=()=>task(evaluate);
$('pause').onclick=()=>task(async()=>{await api('/api/pause',{session:state.id});await refresh();await loadReport()});
$('emergency-stop').onclick=async()=>{try{if(activeJob){await api('/api/cancel-job',{job:activeJob});toast('Cancellation requested for the evaluation; in-flight model responses will be discarded.');return}const r=await api('/api/pause',{session:state.id});toast(r.paused?'Paused: in-flight model responses will be discarded and no further tools will run.':'Session resumed.');if(!busy)await refresh()}catch(e){toast(e.message)}};
$('restore').onclick=()=>task(async()=>{const r=await api('/api/restore',{session:state.id});await refresh();await loadReport();toast(`Restore complete: ${r.files.length} files; memory and approvals cleared.`)});
$('drift').onclick=()=>task(async()=>{const r=await api('/api/drift',{});$('drift-result').textContent=JSON.stringify(r,null,2);toast('Controlled traffic-shift drill complete.')});
$('refresh-report').onclick=()=>task(loadReport);['md','json','csv'].forEach(fmt=>$('export-'+fmt).onclick=()=>task(()=>download(fmt)));
(async()=>{try{config=await api('/api/config');token=config.token;$('model').value=config.model;renderScenarios();await createSession()}catch(e){toast(e.message)}})();


$('open-target').onclick=()=>{if(busy||!state)return;const page=window.open('about:blank','_blank');task(async()=>{try{const r=await api('/api/employee-link',{session:state.id});const url='/demo#'+r.access;if(page){page.opener=null;page.location.replace(url)}else location.assign(url)}catch(e){if(page)page.close();throw e}})};
$('refresh-target').onclick=()=>task(refresh);

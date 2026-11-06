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
function setBusy(value){busy=value;document.querySelectorAll('button,select,input').forEach(el=>{if(el.id!=='emergency-stop')el.disabled=value});$('send').textContent=value?'执行中…':'发送任务 ↑'}
async function task(fn){if(busy)return;setBusy(true);try{await fn()}catch(e){toast(e.message)}finally{setBusy(false)}}
async function refresh(){if(!state)return;state=await api('/api/state?session='+state.id);renderState();}
async function createSession(){state=await api('/api/session',settings());$('case-result').innerHTML='';renderState();toast('已创建全新沙箱和会话');}
function renderState(){
 $('session-id').textContent=state.id.slice(0,12).toUpperCase();$('calls').textContent=state.calls;$('bytes').textContent=state.bytes_read.toLocaleString();
 $('mode-badge').textContent=state.mode.toUpperCase();$('mode-badge').classList.toggle('safe',state.mode==='hardened');
 $('signature').textContent=state.signature_verified?'VERIFIED':'INVALID';$('paused').textContent=state.paused?'PAUSED':'RUNNING';$('event-count').textContent=state.events.length;
 $('provider-status').textContent=state.backend==='mock'?'● Mock · 确定性离线模拟':`● DeepSeek · ${state.model}`;
 $('notice').textContent=state.backend==='mock'?'Mock 是确定性教学模拟，不代表真实模型行为。文件工具实际执行；后端切换会创建独立会话。':`DeepSeek 将接收选定的合成上下文；不会静默回退 Mock。${config.deepseek_configured?'服务器已配置 API Key。':'服务器尚未配置 DEEPSEEK_API_KEY。'}`;
 if(state.messages.length){$('chat').innerHTML=state.messages.map(m=>`<div class="message ${m.role==='user'?'user':'assistant'}"><div class="message-label">${m.role==='user'?state.user.toUpperCase():'FILEAGENT / '+state.backend.toUpperCase()}</div><div class="bubble">${escapeHtml(m.content)}</div></div>`).join('');$('chat').scrollTop=$('chat').scrollHeight;}
 else $('chat').innerHTML='<div class="welcome"><div class="welcome-symbol">↗</div><h3>从一个正常任务开始。</h3><p>选择左侧场景运行攻击，或直接让 Agent<br>搜索、读取并总结 Phoenix 项目。</p><div class="flow">REQUEST → PLAN → AUTHORIZE → EXECUTE</div></div>';
 $('file-list').innerHTML=state.files.map(f=>`<button class="file-row" data-file="${escapeHtml(f.path)}">▤ ${escapeHtml(f.path)}${f.employee_readable?'':'<span class="locked">受限</span>'}</button>`).join('');
 const events=state.events.filter(e=>['tool','alert','provenance','evaluation','model'].includes(e.kind)).slice(-35).reverse();
 $('trace').innerHTML=events.length?events.map(e=>`<div class="trace-item"><div class="trace-head"><span>${escapeHtml(e.tool||e.kind)}</span><span class="badge ${e.status==='OK'||e.status==='LOADED'?'PASS':escapeHtml(e.status)}">${escapeHtml(e.status)}</span></div><p>${escapeHtml(e.detail).slice(0,240)}</p>${e.result?`<details><summary>查看返回值与判定</summary><pre>${escapeHtml(JSON.stringify(e.result,null,2))}</pre></details>`:''}</div>`).join(''):'<p class="empty">尚无工具调用。执行任务后，这里会显示授权判定与实际结果。</p>';
 $('timeline').innerHTML=state.events.slice().reverse().map(e=>`<div class="timeline-row"><span>${new Date(e.time*1000).toLocaleTimeString('zh-CN',{hour12:false})}</span><strong>${escapeHtml(e.kind)}</strong><span>${escapeHtml(e.status)}</span><span>${escapeHtml(e.detail).slice(0,500)}</span></div>`).join('');
 $('approvals').innerHTML=state.approvals.map(a=>`<div class="approval"><strong>待确认：${escapeHtml(a.tool)} / ${escapeHtml(a.arguments.path)}</strong><details><summary>查看变更前后</summary><pre>BEFORE\n${escapeHtml(a.before)}\n\nAFTER\n${escapeHtml(a.after)}</pre></details><button class="secondary" data-approve="${a.id}">批准并执行此确切变更</button></div>`).join('');
}
function renderScenarios(){
 $('scenarios').innerHTML=config.scenarios.map(c=>`<button class="scenario" data-case="${c.id}"><span class="scenario-num">${c.id}</span><span><strong>${escapeHtml(c.title)}</strong><small>${escapeHtml(c.en)} · ${c.owner}</small></span><span class="scenario-arrow">↗</span></button>`).join('');
}
function openCase(id){selected=config.scenarios.find(c=>c.id===id);$('scenario-number').textContent=`${id} / OWNER ${selected.owner} / ${selected.kind==='control'?'CONTROL-LEVEL':'AGENT END-TO-END'}`;$('scenario-title').textContent=selected.title;
 $('scenario-detail').innerHTML=`<h4>攻击者能力</h4><p>${escapeHtml(selected.attacker)}</p><h4>攻击目标</h4><p>${escapeHtml(selected.objective)}</p><h4>攻击内容 / 条件</h4><pre>${escapeHtml(selected.payload)}</pre><h4>实际判定与修复</h4><p>${escapeHtml(selected.oracle)}<br>${escapeHtml(selected.control)}</p><h4>框架映射</h4><p>${escapeHtml(selected.owasp)} · ${escapeHtml(selected.cia)}</p><p class="hint">运行会创建 Alice 的全新沙箱，沿用当前模型后端和安全配置。V4 / V6 直接测试执行器，不消耗模型 API。</p>`;
 $('scenario-dialog').showModal();
}
async function executeCase(run){$('scenario-dialog').close();let response=await api('/api/case',{session:state.id,case:selected.id,run:false});state=response.state;renderState();
 if(run){response=await api('/api/run-case',{session:state.id,case:selected.id});state=response.state;renderState()}
 if(run){const r=response.result;$('case-result').innerHTML=`<div class="result-banner ${r.status==='PASS'?'pass':''}">${escapeHtml(r.id)} · ${r.status==='FAIL'?'攻击目标达成':r.status==='PASS'?'未观察到目标损害':'未执行 / 错误'}<small>成功判据：${escapeHtml(r.oracle)}<br>${escapeHtml(r.kind)} / ${escapeHtml(r.backend)}</small></div>`;toast(`${r.id}: ${r.status}`)}
 else {$('prompt').value=selected.prompt;toast('已加载场景内容；可预览文件后发送任务。V4/V6 请使用执行实验按钮。')}
}
async function sendPrompt(prompt){
 $('chat').insertAdjacentHTML('beforeend',`<div class="busy-line">正在执行 ${escapeHtml(state.backend)} 任务，等待工具与策略判定…</div>`);$('chat').scrollTop=$('chat').scrollHeight;
 const result=await api('/api/chat',{session:state.id,prompt});await refresh();if(result.status==='ERROR'){toast(result.reply);$('chat').insertAdjacentHTML('beforeend',`<div class="message error"><div class="message-label">ERROR / NO FALLBACK</div><div class="bubble">${escapeHtml(result.reply)}</div></div>`)}
}
function showView(name){activeView=name;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('hidden',el.id!=='view-'+name));document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===name));
 const titles={lab:['看见攻击，验证边界。','从一份不可信文档，到一次真实文件操作。每一步都有证据。'],evaluation:['让防御接受相同的检验。','逐案重置，独立判定。比较实际损害，也比较正常任务能力。'],operations:['安全，是持续运营的结果。','从观测和响应，到恢复与发布决策。用证据完成闭环。']};$('page-title').textContent=titles[name][0];$('page-desc').textContent=titles[name][1];if(name==='operations')task(loadReport);
}
function renderEvaluation(){const ev=evaluation;if(!ev)return;$('eval-label').textContent=`${ev.backend.toUpperCase()} / ${ev.id.slice(0,8)}`;
 const counts=['vulnerable','guardrails','hardened'].map(mode=>({mode,failed:ev.rows.filter(r=>r[mode].status==='FAIL').length,run:ev.rows.filter(r=>r[mode].status!=='NOT_RUN').length}));
 $('evaluation').innerHTML=`<div class="metric-summary">${counts.map(c=>`<div><small>${c.mode.toUpperCase()} · OBSERVED COMPROMISES</small><strong>${c.failed} / ${c.run}</strong></div>`).join('')}</div><table><thead><tr><th>漏洞 / 测试范围</th><th>VULNERABLE</th><th>GUARDRAILS</th><th>DEFENCE-IN-DEPTH</th></tr></thead><tbody>${ev.rows.map(r=>`<tr><td>${escapeHtml(r.id+' '+r.title)}<small>${r.kind==='control'?'EXECUTOR CONTROL TEST':'AGENT END-TO-END'}</small></td>${['vulnerable','guardrails','hardened'].map(m=>`<td><span class="badge ${r[m].status}">${r[m].status}</span><small>${escapeHtml(r[m].backend)} · ${r[m].calls} calls</small><button class="text-button" data-evidence="${r[m].session_id}">查看证据 ↗</button></td>`).join('')}</tr>`).join('')}</tbody></table><div class="utility"><strong>正常任务保留：</strong> ${ev.utility.map(u=>`${u.mode}: <span class="badge ${u.status}">${u.status}</span>`).join(' &nbsp; ')}<p class="hint">${escapeHtml(ev.scope)}</p></div>`;
}
async function evaluate(){if(state.backend==='deepseek'&&!config.deepseek_configured)throw Error('请先在服务器设置 DEEPSEEK_API_KEY；不会回退 Mock。');
 if(state.backend==='deepseek'&&!confirm('将使用 DeepSeek 运行 18 个 Agent 攻击案例、V5 因果对照及 3 个正常任务，产生 API 调用；V4/V6 为离线控制测试。是否运行？'))return;
 const job=await api('/api/evaluate',{backend:state.backend,model:state.model});activeJob=job.job;$('evaluation').innerHTML='<div class="blank-slate">正在运行三种配置的独立实验…<br>DeepSeek 测试可能需要数分钟，请保持页面打开。</div>';
 try{while(true){await new Promise(r=>setTimeout(r,1100));const poll=await api('/api/job?id='+job.job);if(poll.status==='CANCELLED'){$('evaluation').innerHTML='<div class="blank-slate">本次评估已取消。部分记录保留，但不会形成通过证据。</div>';throw Error('评估已取消；在途网络调用返回后结束。')}if(poll.status==='DONE'){evaluation=poll.result;break}}}finally{activeJob=null}
 renderEvaluation();toast('对比评估已完成；结果来自本次实际运行。');
}
async function loadReport(){const report=await api(`/api/report?session=${state.id}${evaluation?'&evaluation='+evaluation.id:''}`);$('report-decision').classList.toggle('go',report.decision.startsWith('GO'));$('report-decision').innerHTML=escapeHtml(report.decision)+`<span>${escapeHtml(report.scope)}</span>`;$('report-checks').innerHTML=report.checks.map(c=>`<div class="check"><span>${escapeHtml(c.name)}</span><span class="badge ${c.status}">${c.status}</span></div>`).join('');}
async function download(fmt){const path=`/api/report?session=${state.id}&format=${fmt}${evaluation?'&evaluation='+evaluation.id:''}`;const response=await fetch(path,{headers:{'X-Lab-Token':token}});if(!response.ok)throw Error('Export failed');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=`fileagent-report.${fmt}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
document.addEventListener('click',event=>{const target=event.target.closest('button');if(!target||busy)return;
 if(target.dataset.view)showView(target.dataset.view);
 if(target.dataset.case)openCase(target.dataset.case);
 if(target.dataset.left){document.querySelectorAll('.mini-tabs button').forEach(el=>el.classList.toggle('selected',el===target));['scenarios','files'].forEach(id=>$(id).classList.toggle('hidden',id!==target.dataset.left))}
 if(target.classList.contains('close-dialog'))target.closest('dialog').close();
 if(target.dataset.file)task(async()=>{const file=await api(`/api/file?session=${state.id}&path=${encodeURIComponent(target.dataset.file)}`);$('file-title').textContent=file.path;$('file-content').textContent=file.content;$('file-dialog').showModal()});
 if(target.dataset.approve)task(async()=>{const r=await api('/api/approve',{session:state.id,approval:target.dataset.approve});await refresh();toast('审批执行结果：'+r.status)});
 if(target.dataset.evidence)task(async()=>{state=await api('/api/state?session='+target.dataset.evidence);$('mode').value=state.mode;$('backend').value=state.backend;$('user').value=state.user;renderState();showView('lab')});
});
$('new-session').onclick=()=>task(createSession);$('clear-session').onclick=()=>task(createSession);
['backend','mode','user'].forEach(id=>$(id).onchange=()=>task(createSession));
$('chat-form').onsubmit=e=>{e.preventDefault();const prompt=$('prompt').value.trim();if(!prompt||busy)return;$('prompt').value='';task(()=>sendPrompt(prompt))};
$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-form').requestSubmit()}};
$('normal-task').onclick=()=>task(()=>sendPrompt(`读取 shared/phoenix.md 并将总结保存到 users/${state.user}/output/summary.md`));
$('run-case').onclick=()=>task(()=>executeCase(true));$('load-case').onclick=()=>task(()=>executeCase(false));$('evaluate').onclick=()=>task(evaluate);
$('pause').onclick=()=>task(async()=>{await api('/api/pause',{session:state.id});await refresh();await loadReport()});
$('emergency-stop').onclick=async()=>{try{if(activeJob){await api('/api/cancel-job',{job:activeJob});toast('已请求取消评估；在途模型响应将丢弃。');return}const r=await api('/api/pause',{session:state.id});toast(r.paused?'已暂停：在途模型响应会丢弃，不再执行后续工具':'会话已恢复');if(!busy)await refresh()}catch(e){toast(e.message)}};
$('restore').onclick=()=>task(async()=>{const r=await api('/api/restore',{session:state.id});await refresh();await loadReport();toast(`恢复完成：${r.files.length} 个文件；记忆和审批已清理`)});
$('drift').onclick=()=>task(async()=>{const r=await api('/api/drift',{});$('drift-result').textContent=JSON.stringify(r,null,2);toast('受控流量变化演练完成')});
$('refresh-report').onclick=()=>task(loadReport);['md','json','csv'].forEach(fmt=>$('export-'+fmt).onclick=()=>task(()=>download(fmt)));
(async()=>{try{config=await api('/api/config');token=config.token;$('model').value=config.model;renderScenarios();await createSession()}catch(e){toast(e.message)}})();


$('open-target').onclick=()=>{if(busy||!state)return;const page=window.open('about:blank','_blank');task(async()=>{try{const r=await api('/api/employee-link',{session:state.id});const url='/demo#'+r.access;if(page){page.opener=null;page.location.replace(url)}else location.assign(url)}catch(e){if(page)page.close();throw e}})};
$('refresh-target').onclick=()=>task(refresh);

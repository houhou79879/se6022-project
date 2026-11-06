'use strict';
const byId=id=>document.getElementById(id);
const fragment=location.hash.slice(1);
let access=fragment||sessionStorage.getItem('fileagent-employee')||'', state=null, busy=false;
if(fragment){sessionStorage.setItem('fileagent-employee',fragment);history.replaceState(null,'',location.pathname)}
async function request(path,data){
 const response=await fetch('/employee/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','X-Employee-Access':access},...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json();if(!response.ok)throw Error(result.error);return result;
}
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node};
function render(){
 const name=state.user[0].toUpperCase()+state.user.slice(1);
 byId('name').textContent=name;byId('avatar').textContent=name[0];
 byId('files').replaceChildren(...state.files.map(path=>{const b=el('button','▤ '+path);b.onclick=()=>work(async()=>{const f=await request('file?path='+encodeURIComponent(path));byId('filename').textContent=path;byId('filetext').textContent=f.content;byId('preview').showModal()});return b}));
 byId('conversation').hidden=state.messages.length>0;byId('messages').hidden=!state.messages.length;
 byId('messages').replaceChildren(...state.messages.map(m=>{const box=el('div','');box.className='message '+(m.role==='user'?'user':'assistant');box.append(el('strong',m.role==='user'?name:'FileAgent'),el('p',m.content));return box}));
 byId('approvals').replaceChildren(...state.approvals.map(a=>{const box=el('div','');box.className='approval';const detail=el('details','');detail.append(el('summary','查看变更前后'),el('pre','修改前\n'+a.before+'\n\n修改后\n'+a.after));const b=el('button','确认并执行');b.onclick=()=>work(async()=>{const r=await request('approve',{approval:a.id});state=r.state;render();byId('status').textContent=r.status==='OK'?'文件已更新。':'未执行此变更。'});box.append(el('strong','待确认：'+a.path),detail,b);return box}));
}
async function work(fn){if(busy)return;busy=true;byId('status').textContent='处理中…';byId('composer').querySelector('button').disabled=true;try{await fn();if(byId('status').textContent==='处理中…')byId('status').textContent=''}catch(e){byId('status').textContent=e.message}finally{busy=false;byId('composer').querySelector('button').disabled=false}}
async function start(){const r=await request('start',{});access=r.access;sessionStorage.setItem('fileagent-employee',access);state=r.state;render()}
async function send(prompt){if(!state||!prompt||busy)return;await work(async()=>{byId('prompt').value='';const r=await request('chat',{prompt});state=r.state;render();if(r.status==='ERROR')byId('status').textContent=r.reply;else byId('composer').scrollIntoView({block:'nearest'});});}
byId('new').onclick=()=>work(start);byId('close').onclick=()=>byId('preview').close();
byId('composer').onsubmit=e=>{e.preventDefault();send(byId('prompt').value.trim())};
byId('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();byId('composer').requestSubmit()}};
document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{if(!state)return;const prompts={read:'读取 shared/phoenix.md 并总结项目进度',search:'搜索 Phoenix',save:`读取 shared/phoenix.md 并将总结保存到 users/${state.user}/output/summary.md`};send(prompts[b.dataset.task])});
work(async()=>{if(access){state=await request('state');render()}else await start()});

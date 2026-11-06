"""Local operator console. Not a production multi-user authentication server."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
import io
import json
import mimetypes
import os
from pathlib import Path
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse,parse_qs

from fileagent.engine import Lab, redact
from fileagent.scenarios import SCENARIOS

BASE=Path(__file__).resolve().parent

def make_server(port=8765,data_dir=None,host='127.0.0.1'):
    lab=Lab(data_dir or BASE/'runtime')
    token=secrets.token_urlsafe(32)
    executor=ThreadPoolExecutor(max_workers=2)
    jobs={}
    cancellations={}
    employee_links={}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self,fmt,*args):
            # Do not log prompts, keys or query strings.
            pass

        def send(self,data,status=200,content_type='application/json; charset=utf-8',filename=None):
            if isinstance(data,(dict,list)): data=json.dumps(data,ensure_ascii=False).encode()
            if isinstance(data,str): data=data.encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'")
            if filename: self.send_header('Content-Disposition',f'attachment; filename="{filename}"')
            self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)

        def local(self):
            host=self.headers.get('Host','')
            allowed={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
            origin=self.headers.get('Origin')
            return host in allowed and (not origin or origin in {'http://'+x for x in allowed})

        def authorized(self):
            return self.local() and secrets.compare_digest(self.headers.get('X-Lab-Token',''),token)

        def employee(self):
            s=employee_links.get(self.headers.get('X-Employee-Access',''))
            if not s: raise PermissionError('Employee session expired. Start a new workspace or reopen it from the console.')
            return s

        def employee_state(self,s):
            files=[]
            for p in sorted(s.root.rglob('*')):
                if p.is_file() and lab.allowed(s,lab.path(s,p.relative_to(s.root).as_posix())):
                    files.append(p.relative_to(s.root).as_posix())
            sources=[]
            for item in s.last_tools:
                if item.get('tool')!='search_files': continue
                for match in (item.get('result') or {}).get('matches',[])[:12]:
                    snippet=match.get('content','')
                    if s.mode!='vulnerable': snippet=redact(snippet)
                    sources.append({'path':match.get('path',''),'snippet':snippet[:4000]})
            return {'user':s.user,'files':files,'messages':s.messages[-80:],
                    'sources':sources[:12],
                    'approvals':[{'id':a['id'],'tool':a['tool'],'path':a['arguments']['path'],'before':a['before'],'after':a['after']}
                       for a in s.approvals.values() if not a['used'] and a['user']==s.user]}

        def do_GET(self):
            if not self.local(): return self.send({'error':'Local origin required'},403)
            url=urlparse(self.path); query=parse_qs(url.query)
            try:
                if url.path in ('/employee/state','/employee/file'):
                    s=self.employee()
                    with s.lock:
                        if url.path=='/employee/state': return self.send(self.employee_state(s))
                        p=lab.path(s,query['path'][0])
                        if not lab.allowed(s,p): raise PermissionError('You do not have access to this file.')
                        return self.send({'content':p.read_text(encoding='utf-8')[:65536]})
                if url.path=='/api/config':
                    return self.send({'token':token,'scenarios':SCENARIOS,
                        'deepseek_configured':bool(os.getenv('DEEPSEEK_API_KEY')),
                        'model':os.getenv('DEEPSEEK_MODEL','deepseek-flash'),
                        'operator_console':True})
                if url.path.startswith('/api/'):
                    if not self.authorized(): return self.send({'error':'Operator token required'},403)
                    if url.path=='/api/job':
                        job=jobs[query['id'][0]]
                        if not job.done(): return self.send({'status':'RUNNING'})
                        if cancellations[query['id'][0]].is_set(): return self.send({'status':'CANCELLED'})
                        return self.send({'status':'DONE','result':job.result()})
                    s=lab.sessions[query['session'][0]]
                    with s.lock:
                        if url.path=='/api/state': return self.send(lab.state(s))
                        if url.path=='/api/file':
                            p=lab.path(s,query['path'][0])
                            return self.send({'path':query['path'][0],'content':p.read_text(encoding='utf-8')[:65536],
                                              'scope':'Trusted operator preview, not employee tool access'})
                        if url.path=='/api/report':
                            report=lab.report(s,query.get('evaluation',[None])[0])
                            fmt=query.get('format',['json'])[0]
                            if fmt=='md': return self.send(lab.markdown(report),content_type='text/markdown; charset=utf-8',filename='fileagent-report.md')
                            if fmt=='csv':
                                stream=io.StringIO(); writer=csv.writer(stream)
                                writer.writerow(['case','mode','backend','status','attack_success','session_id'])
                                for row in (report.get('evaluation') or {}).get('rows',[]):
                                    for mode in ('vulnerable','guardrails','hardened'):
                                        r=row[mode]; writer.writerow([row['id'],mode,r['backend'],r['status'],r['attack_success'],r['session_id']])
                                return self.send('\ufeff'+stream.getvalue(),content_type='text/csv; charset=utf-8',filename='fileagent-results.csv')
                            return self.send(report)
                    return self.send({'error':'Unknown API'},404)
                name={'/':'employee.html','/demo':'employee.html','/console':'index.html','/app.js':'app.js','/style.css':'style.css',
                      '/employee.js':'employee.js','/employee.css':'employee.css'}.get(url.path)
                if not name: return self.send({'error':'Not found'},404)
                return self.send((BASE/'web'/name).read_bytes(),content_type=mimetypes.guess_type(name)[0]+'; charset=utf-8')
            except PermissionError as e: self.send({'error':str(e)},403)
            except (KeyError,ValueError,FileNotFoundError) as e: self.send({'error':str(e)},400)
            except Exception as e: self.send({'error':type(e).__name__+': '+str(e)},500)

        def do_POST(self):
            path=urlparse(self.path).path
            if not self.local() or (not path.startswith('/employee/') and not self.authorized()):
                return self.send({'error':'Local operator token required'},403)
            if 'application/json' not in self.headers.get('Content-Type',''): return self.send({'error':'JSON required'},415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if size<0 or size>65536: return self.send({'error':'Request too large'},413)
                data=json.loads(self.rfile.read(size))
                if path=='/employee/start':
                    s=lab.create(mode='vulnerable',backend='mock')
                    access=secrets.token_urlsafe(32); employee_links[access]=s
                    return self.send({'access':access,'state':self.employee_state(s)})
                if path in ('/employee/chat','/employee/approve'):
                    s=self.employee()
                    with s.lock:
                        result=lab.chat(s,data['prompt']) if path.endswith('/chat') else lab.approve(s,data['approval'])
                        return self.send({**result,'state':self.employee_state(s)})
                if path=='/api/session':
                    return self.send(lab.state(lab.create(**{k:data[k] for k in ('user','mode','backend','model') if k in data})))
                if path=='/api/evaluate':
                    if any(not x.done() for x in jobs.values()): return self.send({'error':'Another evaluation is running'},409)
                    jid=secrets.token_hex(12)
                    cancellations[jid]=threading.Event()
                    jobs[jid]=executor.submit(lab.evaluate,data.get('backend','mock'),data.get('model'),cancellations[jid])
                    return self.send({'job':jid})
                if path=='/api/cancel-job':
                    cancellations[data['job']].set()
                    return self.send({'status':'CANCEL_REQUESTED'})
                if path=='/api/drift': return self.send(lab.drift_drill())
                s=lab.sessions[data['session']]
                if path=='/api/employee-link':
                    access=secrets.token_urlsafe(32); employee_links[access]=s
                    return self.send({'access':access})
                # Cancellation cannot wait behind the in-flight Agent/network lock.
                if path=='/api/pause':
                    s.paused=not s.paused
                    lab.event(s,'response','PAUSED' if s.paused else 'RESUMED','Local operator incident response')
                    return self.send({'paused':s.paused})
                with s.lock:
                    if path=='/api/chat': return self.send(lab.chat(s,data['prompt']))
                    if path=='/api/run-case':
                        result=lab.run_case(s,data['case'])
                        return self.send({'state':lab.state(s),'result':result})
                    if path=='/api/case':
                        # Every case starts from fresh fixtures, never from a previous compromised session.
                        s=lab.create(user='alice',mode=s.mode,backend=s.backend,model=s.model)
                        if data.get('run',True): result=lab.run_case(s,data['case'])
                        else: result=lab.setup_case(s,data['case'])
                        return self.send({'state':lab.state(s),'result':result})
                    if path=='/api/approve': return self.send(lab.approve(s,data['approval']))
                    if path=='/api/restore': return self.send(lab.restore(s))
                return self.send({'error':'Unknown action'},404)
            except PermissionError as e: self.send({'error':str(e)},403)
            except (KeyError,ValueError,TypeError) as e: self.send({'error':str(e)},400)
            except Exception as e: self.send({'error':type(e).__name__+': '+str(e)},500)

    server=ThreadingHTTPServer((host,port),Handler)
    server.lab=lab
    return server

if __name__=='__main__':
    env_file = BASE / '.env'
    if env_file.is_file():
        for line in env_file.read_text(encoding='utf-8-sig').splitlines():
            name, separator, value = line.partition('=')
            name = name.strip()
            if separator and name in {'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'} and value.strip():
                os.environ.setdefault(name, value.strip())
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    # Native runs stay on loopback. The container image passes 0.0.0.0 and
    # Docker publishes it only on host 127.0.0.1:8765.
    parser.add_argument('--host',default='127.0.0.1')
    # The container writes to /tmp/runtime (writable tmpfs) because /app is
    # read-only and /app/runtime may be root-owned after a volume mount.
    parser.add_argument('--data-dir',default=None)
    args=parser.parse_args()
    server=make_server(args.port,data_dir=args.data_dir,host=args.host)
    print(f'FileAgent local operator demo: http://127.0.0.1:{server.server_port}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()

const app=document.getElementById('app')

let state={
clients:[],
tasks:[],
templates:[],
months:[],
activeClient:null,
view:'kanban'
}

async function api(url,options={}){
const res=await fetch('/api'+url,{
headers:{'Content-Type':'application/json'},
...options
})
return res.json()
}

async function loadClients(){
state.clients=await api('/clients')
render()
}

async function loadClientData(clientId){
state.tasks=await api('/tasks/client/'+clientId)
state.templates=await api('/templates/'+clientId)
state.months=await api('/months/'+clientId)
render()
}

function setView(view){
state.view=view
render()
}

function render(){
app.innerHTML=`
<div class="sidebar">
<div class="logo">Ligrow</div>
${state.clients.map(c=>`
<div class="client" onclick="selectClient('${c.clientId}')">${c.clientName}</div>
`).join('')}
</div>
<div class="main">
<div class="header">
<div>
<h2>${state.activeClient?.clientName||'Selecciona cliente'}</h2>
<div class="tabs">
<button class="tab ${state.view==='kanban'?'active':''}" onclick="setView('kanban')">Kanban</button>
<button class="tab ${state.view==='templates'?'active':''}" onclick="setView('templates')">Plantillas</button>
<button class="tab ${state.view==='months'?'active':''}" onclick="setView('months')">Meses</button>
</div>
</div>
<div>
<button class="button" onclick="newTask()">Nueva tarea</button>
</div>
</div>
${renderView()}
</div>
`
}

function renderView(){
if(!state.activeClient)return '<div class="card">Selecciona un cliente para comenzar.</div>'
if(state.view==='templates')return renderTemplates()
if(state.view==='months')return renderMonths()
return renderKanban()
}

function renderKanban(){
return `
<div class="columns">
<div class="card"><h3>En curso</h3>${renderTasks('En curso')}</div>
<div class="card"><h3>Detenido</h3>${renderTasks('Detenido')}</div>
<div class="card"><h3>Listo</h3>${renderTasks('Listo')}</div>
</div>`
}

function renderTemplates(){
return `
<div class="card">
<div class="section-head">
<h3>Plantillas mensuales</h3>
<button class="button" onclick="newTemplate()">Nueva plantilla</button>
</div>
${state.templates.map(t=>`
<div class="task priority-${String(t.priority||'media').toLowerCase()}">
<strong>${t.templateName}</strong><br>
<small>${t.owner} · vence día ${t.dueDay||'-'}</small>
</div>`).join('')||'<p>No hay plantillas todavía.</p>'}
</div>`
}

function renderMonths(){
return `
<div class="card">
<div class="section-head">
<h3>Meses generados</h3>
<div style="display:flex;gap:10px">
<button class="button" onclick="generateMonth()">Generar mes</button>
</div>
</div>
${state.months.map(m=>`
<div class="task">
<strong>${m.taskMonth}</strong><br>
<small>Estado: ${m.monthStatus}</small>
<div style="margin-top:8px;display:flex;gap:8px">
<button class="mini-btn" onclick="closeMonth('${m.taskMonth}')">Cerrar</button>
<button class="mini-btn" onclick="reopenMonth('${m.taskMonth}')">Reabrir</button>
</div>
</div>`).join('')||'<p>No hay meses generados todavía.</p>'}
</div>`
}

function renderTasks(status){
return state.tasks
.filter(t=>t.status===status)
.map(t=>`<div class="task priority-${String(t.priority||'media').toLowerCase()}">${t.taskName}</div>`)
.join('')
}

function selectClient(id){
state.activeClient=state.clients.find(c=>c.clientId===id)
loadClientData(id)
}

async function newTask(){
if(!state.activeClient)return
const name=prompt('Nombre tarea')
if(!name)return
await api('/tasks',{
method:'POST',
body:JSON.stringify({clientId:state.activeClient.clientId,taskName:name})
})
loadClientData(state.activeClient.clientId)
}

async function newTemplate(){
if(!state.activeClient)return
const templateName=prompt('Nombre de la plantilla')
if(!templateName)return
await api('/templates',{
method:'POST',
body:JSON.stringify({
clientId:state.activeClient.clientId,
templateName,
owner:'Jesús',
priority:'Media',
statusDefault:'En curso',
dueDay:5,
isActive:true
})
})
loadClientData(state.activeClient.clientId)
}

async function generateMonth(){
if(!state.activeClient)return
const taskMonth=prompt('Mes a generar (YYYY-MM)','2026-05')
if(!taskMonth)return
await api('/months/generate',{
method:'POST',
body:JSON.stringify({clientId:state.activeClient.clientId,taskMonth})
})
loadClientData(state.activeClient.clientId)
}

async function closeMonth(taskMonth){
if(!state.activeClient)return
await api('/months/close',{
method:'POST',
body:JSON.stringify({clientId:state.activeClient.clientId,taskMonth})
})
loadClientData(state.activeClient.clientId)
}

async function reopenMonth(taskMonth){
if(!state.activeClient)return
await api('/months/reopen',{
method:'POST',
body:JSON.stringify({clientId:state.activeClient.clientId,taskMonth})
})
loadClientData(state.activeClient.clientId)
}

loadClients()

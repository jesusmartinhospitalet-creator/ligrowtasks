const app=document.getElementById('app')

let state={
clients:[],
tasks:[],
activeClient:null
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

async function loadTasks(clientId){
state.tasks=await api('/tasks/client/'+clientId)
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
<h2>${state.activeClient?.clientName||'Selecciona cliente'}</h2>
<button class="button" onclick="newTask()">Nueva tarea</button>
</div>

<div class="columns">
<div class="card">
<h3>En curso</h3>
${renderTasks('En curso')}
</div>

<div class="card">
<h3>Detenido</h3>
${renderTasks('Detenido')}
</div>

<div class="card">
<h3>Listo</h3>
${renderTasks('Listo')}
</div>

</div>
</div>
`
}

function renderTasks(status){
return state.tasks
.filter(t=>t.status===status)
.map(t=>`
<div class="task priority-${t.priority.toLowerCase()}">
${t.taskName}
</div>
`).join('')
}

function selectClient(id){
state.activeClient=state.clients.find(c=>c.clientId===id)
loadTasks(id)
}

async function newTask(){
const name=prompt('Nombre tarea')
if(!name)return

await api('/tasks',{
method:'POST',
body:JSON.stringify({
clientId:state.activeClient.clientId,
taskName:name
})
})

loadTasks(state.activeClient.clientId)
}

loadClients()

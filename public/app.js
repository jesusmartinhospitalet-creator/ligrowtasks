const app=document.getElementById('app')

let state={
clients:[],
tasks:[],
activeClient:null
}

async function api(url,options={}){
  try{
    const res=await fetch('/api'+url,{
      headers:{'Content-Type':'application/json'},
      ...options
    })
    if(!res.ok)return null
    return res.json()
  }catch(e){
    return null
  }
}

async function loadClients(){
  const data=await api('/clients')
  state.clients=Array.isArray(data)?data:[]
  render()
}

async function loadTasks(clientId){
  const data=await api('/tasks/client/'+clientId)
  state.tasks=Array.isArray(data)?data:[]
  render()
}

function render(){
app.innerHTML=`
<div class="sidebar">
<div class="logo">Ligrow</div>
${state.clients.length
  ? state.clients.map(c=>`
      <div class="client" onclick="selectClient('${c.clientId}')">${c.clientName}</div>
    `).join('')
  : '<div class="client" style="opacity:.4;cursor:default">Sin clientes configurados</div>'
}
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
<div class="task priority-${(t.priority||'media').toLowerCase()}">
${t.taskName}
</div>
`).join('')
}

function selectClient(id){
state.activeClient=state.clients.find(c=>c.clientId===id)
loadTasks(id)
}

async function newTask(){
if(!state.activeClient)return
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

// Render skeleton immediately so the page is never blank
render()
// Then load real data
loadClients()

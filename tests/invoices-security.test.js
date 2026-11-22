const assert=require('node:assert/strict');
const Module=require('node:module');
const original=Module._load;
const handlers=[];const routes={};let queried=0;
const router={use:(...f)=>handlers.push(...f),get:(p,f)=>routes['GET '+p]=f,post:(p,f)=>routes['POST '+p]=f};
Module._load=function(id,parent,main){
 if(id==='express')return {Router:()=>router};
 if(id.endsWith('/config/database'))return {from(){queried++;throw Error('unexpected database access')}};
 if(id.endsWith('/middleware/session-auth.middleware'))return {requireAppSession:(req,res,next)=>req.sessionUser?next():res.status(401).json({})};
 return original.apply(this,arguments);
};
require('../src/routes/invoices.routes');Module._load=original;
process.env.INVOICES_OWNER_USER_ID='owner';process.env.SUPABASE_SERVICE_KEY='configured';process.env.APP_SESSION_SECRET='x'.repeat(40);
function response(){return {code:200,status(c){this.code=c;return this},set(){return this},json(x){this.body=x;return this}}}
function check(user){const req={sessionUser:user},res=response();let i=0;function next(){if(handlers[i])handlers[i++](req,res,next)}next();return res}
assert.equal(check(null).code,401);
assert.equal(check({userId:'another-admin',role:'admin'}).code,403);
assert.equal(check({userId:'owner',role:'admin'}).code,200);
delete process.env.INVOICES_OWNER_USER_ID;
assert.equal(check({userId:'owner',role:'admin'}).code,503);
assert.equal(queried,0);
console.log('Acceso a facturas: sesión, propietario y configuración comprobados');

/* Autenticación contra el servidor. La sesión vive en una cookie httpOnly que el navegador
   envía solo; aquí únicamente se guarda en memoria el usuario actual (para pintar el menú).
   Los permisos reales los valida SIEMPRE el servidor: esto solo mejora la experiencia de uso. */
var AUTH=(function(){
"use strict";
var ROLES={admin:"Administrador",usuario:"Usuario"};
var user=null;
var page=location.pathname.split("/").pop()||"index.html";
var need=document.body&&document.body.getAttribute("data-acceso");
var navEl=document.querySelector("header nav");
if(need)document.documentElement.style.visibility="hidden";   /* se muestra al confirmar la sesión */
if(navEl)navEl.style.visibility="hidden";

function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
/* Convierte una promesa de la API en { ok, msg, ... } (nunca rechaza) */
function res(p,fill){
  return p.then(function(d){var r={ok:true,msg:""};if(fill)fill(d,r);return r},function(e){return{ok:false,msg:e.message}});
}
function current(){return user}
function isAdmin(){return !!user&&user.rol==="admin"}

function login(usr,pass){
  return res(API.post("/api/auth/login",{usuario:usr,pass:pass}),function(d,r){user=d.user;r.user=d.user;r.msg="Bienvenido, "+d.user.nombre+"."});
}
function register(d){
  return res(API.post("/api/auth/register",{usuario:d.usuario,nombre:d.nombre,correo:d.correo,pass:d.pass}),function(x,r){user=x.user;r.user=x.user});
}
function logout(){
  user=null;
  return API.post("/api/auth/logout",{}).then(function(){},function(){});
}

/* ---------- Gestión de usuarios (solo administrador; el servidor lo exige) ---------- */
function list(){return API.get("/api/users").then(function(d){return d.usuarios})}
function add(d,rol){return res(API.post("/api/users",{usuario:d.usuario,nombre:d.nombre,correo:d.correo,pass:d.pass,rol:rol}),function(x,r){r.msg="Usuario creado."})}
function setRol(usr,rol){return res(API.patch("/api/users/"+encodeURIComponent(usr),{rol:rol}),function(x,r){r.msg="Rol actualizado."})}
function remove(usr){return res(API.del("/api/users/"+encodeURIComponent(usr)),function(x,r){r.msg="Usuario eliminado."})}
function setPass(usr,pass){return res(API.put("/api/users/"+encodeURIComponent(usr)+"/password",{pass:pass}),function(x,r){r.msg="Contraseña actualizada."})}

/* ---------- Protección de páginas y menú ---------- */
function guard(){
  if(need&&!user){location.replace("login.html?next="+encodeURIComponent(page));return false}
  if(need==="admin"&&user.rol!=="admin"){location.replace("login.html?denegado=1");return false}
  document.documentElement.style.visibility="";
  return true;
}
function buildNav(){
  if(!navEl)return;
  var items=[["index.html","Inicio"],["catalogo.html","Catálogo"],["carrito.html",'Carrito (<span id="nCart">0</span>)']];
  if(user)items.push(["pedidos.html","Pedidos"]);
  if(user&&user.rol==="admin")items.push(["admin.html","Administrar"]);
  items.push(["contacto.html","Contacto"]);
  var h=items.map(function(i){return'<a href="'+i[0]+'"'+(i[0]===page?' class="on"':'')+'>'+i[1]+'</a>'}).join("");
  if(user)h+='<span class="user">👤 '+esc(user.nombre)+' <small>('+ROLES[user.rol]+')</small></span><a href="#" id="btnSalir">Salir</a>';
  else h+='<a href="login.html"'+(page==="login.html"?' class="on"':'')+'>Iniciar sesión</a>';
  navEl.innerHTML=h;navEl.style.visibility="";
  if(window.LUD)LUD.badge();
}
/* ready: se cumple cuando ya se sabe quién está conectado; vale true si la página puede mostrarse */
var ready=API.get("/api/auth/me").then(function(d){user=d.user||null},function(){user=null}).then(function(){
  var ok=guard();buildNav();return ok;
});
document.addEventListener("click",function(e){
  if(e.target&&e.target.id==="btnSalir"){
    e.preventDefault();
    logout().then(function(){
      if(window.LUD){LUD.S.carrito=[];LUD.persist()}   /* el carrito no pasa a la siguiente cuenta */
      location.href="index.html";
    });
  }
});

return{ROLES:ROLES,ready:ready,current:current,isAdmin:isAdmin,login:login,logout:logout,register:register,add:add,list:list,setRol:setRol,remove:remove,setPass:setPass};
})();

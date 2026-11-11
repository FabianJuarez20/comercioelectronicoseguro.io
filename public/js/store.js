/* Capa de datos del navegador.
   - Catálogo, usuarios y sesión: viven en el SERVIDOR (ver api.js y auth.js).
   - Pedidos y pagos: viven en el SERVIDOR (ver carrito.js y pedidos.js).
   - Carrito: se guarda en localStorage. */
var LUD=(function(){
"use strict";
var K={cart:"ludingo_carrito"};
var $=function(i){return document.getElementById(i)};
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function money(n){return "$"+Number(n).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2})+" MXN"}
function load(k,def){try{var v=localStorage.getItem(k);return v?JSON.parse(v):def}catch(e){return def}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){say("No se pudo guardar en el navegador.");return false}}
var tmr;function say(t){var m=$("msg");if(!m)return;m.textContent=t;m.style.display="block";clearTimeout(tmr);tmr=setTimeout(function(){m.style.display="none"},3500)}

/* Limpia datos de la versión anterior (100 % local) */
try{["ludingo_catalogo","ludingo_usuarios","ludingo_sesion"].forEach(function(k){localStorage.removeItem(k)})}catch(e){}

/* catalogo = caché en memoria de los productos que ha devuelto el servidor */
var S={catalogo:[],carrito:load(K.cart,[])};
if(!Array.isArray(S.carrito))S.carrito=[];

function remember(list){
  list.forEach(function(p){
    var i=S.catalogo.findIndex(function(x){return x.id===p.id});
    if(i>-1)S.catalogo[i]=p;else S.catalogo.push(p);
  });
  return list;
}
/* GET /api/products con filtros: {q,genero,plataforma,ids} */
function fetchProducts(params){
  return API.get("/api/products"+API.qs(params||{})).then(function(d){return remember(d.productos)});
}

function persist(){save(K.cart,S.carrito);badge()}
function badge(){var e=$("nCart");if(e)e.textContent=S.carrito.reduce(function(s,i){return s+i.cant},0)}
function addCart(id,d){
  var it=S.carrito.find(function(i){return i.id===id});
  if(it){it.cant+=d;if(it.cant<=0)S.carrito=S.carrito.filter(function(i){return i.id!==id})}
  else if(d>0)S.carrito.push({id:id,cant:1});
  persist();
}
/* Descuento: porcentaje 0-100. Sin descuento => precio normal. El servidor envía precioFinal ya calculado. */
function pct(x){var d=parseFloat(x&&x.descuento);return(isNaN(d)||d<0)?0:Math.min(d,100)}
function finalPrice(x){
  if(typeof x.precioFinal==="number")return x.precioFinal;
  var p=Number(x.precio)||0,d=pct(x);return d>0?Math.round(p*(100-d))/100:p;
}
function priceHTML(x){
  var d=pct(x);
  if(d>0)return '<span class="promo"><span class="badge">-'+d+'%</span> <s class="old">'+money(x.precio)+'</s></span><span class="price">'+money(finalPrice(x))+'</span>';
  return '<span class="price">'+money(x.precio)+'</span>';
}
function gameById(id){return S.catalogo.find(function(x){return x.id===id})}
function cover(x){var h=(x.id*57)%360;return '<div class="cover" style="background:linear-gradient(135deg,hsl('+h+',60%,35%),hsl('+((h+60)%360)+',60%,25%))">'+esc(x.emoji||"🎮")+'</div>'}
function card(x){
  return '<article class="card">'+cover(x)+'<div class="b"><h3>'+esc(x.nombre)+'</h3><span class="tag">'+esc(x.genero)+' · '+esc(x.plataforma)+'</span>'+priceHTML(x)+'<div class="row"><button class="sec" data-prev="'+x.id+'" type="button">Vista previa</button><button data-add="'+x.id+'" type="button">Agregar al carrito</button></div></div></article>';
}
/* Vista previa (ventana modal) */
function closePrev(){var m=$("prev");if(m)m.remove();document.body.style.overflow=""}
function preview(id){
  var x=gameById(id);if(!x)return;closePrev();
  var d=pct(x),m=document.createElement("div");m.id="prev";m.className="modal";
  m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.setAttribute("aria-label","Vista previa de "+x.nombre);
  m.innerHTML='<div class="modal-box"><button class="modal-x sec" data-closeprev="1" type="button" aria-label="Cerrar">✕</button>'+cover(x).replace('class="cover"','class="cover big"')+
   '<div class="b"><h3>'+esc(x.nombre)+'</h3><span class="tag">'+esc(x.genero)+' · '+esc(x.plataforma)+'</span>'+
   '<p>'+esc(x.descripcion||("Videojuego de "+x.genero+" disponible para "+x.plataforma+"."))+'</p>'+
   priceHTML(x)+(d>0?'<span class="note">Ahorras '+money(x.precio-finalPrice(x))+' con la promoción.</span>':'')+
   '<div class="row"><button class="sec" data-closeprev="1" type="button">Cerrar</button><button data-add="'+x.id+'" data-fromprev="1" type="button">Agregar al carrito</button></div></div></div>';
  document.body.appendChild(m);document.body.style.overflow="hidden";
  var b=m.querySelector("[data-add]");if(b)b.focus();
}
function opts(sel,arr,first){sel.innerHTML=(first?'<option value="">'+first+'</option>':'')+arr.map(function(x){return'<option>'+esc(x)+'</option>'}).join("")}
document.addEventListener("click",function(e){
  var t=e.target;if(!t||!t.dataset)return;
  if(t.dataset.prev){preview(+t.dataset.prev)}
  else if(t.dataset.closeprev||t.id==="prev"){closePrev()}
  else if(t.dataset.add){addCart(+t.dataset.add,1);if(t.dataset.fromprev)closePrev();say("Agregado al carrito")}
});
document.addEventListener("keydown",function(e){if(e.key==="Escape")closePrev()});
document.addEventListener("DOMContentLoaded",badge);
return{K:K,S:S,$:$,esc:esc,money:money,load:load,save:save,say:say,persist:persist,badge:badge,addCart:addCart,remember:remember,fetchProducts:fetchProducts,pct:pct,finalPrice:finalPrice,priceHTML:priceHTML,gameById:gameById,card:card,opts:opts};
})();

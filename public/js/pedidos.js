document.addEventListener("DOMContentLoaded",function(){
 AUTH.ready.then(function(ok){
  if(!ok)return;
  var $=LUD.$,me=AUTH.current(),adm=me&&me.rol==="admin";
  API.get("/api/orders").then(function(d){
   var P=d.pedidos;
   if(!P.length){$("orders").innerHTML='<p class="note">'+(adm?"Aún no hay pedidos.":"Aún no tienes pedidos.")+'</p>';return}
   $("orders").innerHTML='<div class="wrap"><table><thead><tr><th>#</th><th>Fecha</th><th>Cliente</th>'+(adm?'<th>Cuenta</th>':'')+'<th>Juegos</th><th>Total</th><th>Estado</th></tr></thead><tbody>'+P.map(function(o){
    return '<tr><td>'+o.id+'</td><td>'+LUD.esc(new Date(o.fecha).toLocaleString("es-MX"))+'</td><td>'+LUD.esc(o.cliente)+'<br><span class="tag">'+LUD.esc(o.correo)+'</span></td>'+(adm?'<td>'+LUD.esc(o.usuario||"—")+'</td>':'')+'<td>'+o.items.map(function(i){return LUD.esc(i.nombre)+' ×'+i.cant+' · '+LUD.money(i.precio)+(i.descuento>0?' <span class="tag">(-'+i.descuento+'%)</span>':'')}).join("<br>")+'</td><td>'+LUD.money(o.total)+'</td><td>'+(o.estado==="pagado"?"✅ Pagado":"⏳ En revisión")+'</td></tr>'}).join("")+'</tbody></table></div>';
  },function(e){$("orders").innerHTML='<p class="note">'+LUD.esc(e.message)+'</p>'});
 });
});

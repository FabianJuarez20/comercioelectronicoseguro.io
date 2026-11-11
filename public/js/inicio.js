document.addEventListener("DOMContentLoaded",function(){
  var g=LUD.$("destacados");if(!g)return;
  g.innerHTML='<p class="note">Cargando…</p>';
  API.get("/api/home").then(function(d){
    LUD.remember(d.destacados);
    g.innerHTML=d.destacados.length?d.destacados.map(function(x){return LUD.card(x)}).join(""):'<p class="note">Aún no hay juegos en el catálogo.</p>';
    var s=LUD.$("stats");
    if(s)s.textContent=d.total+(d.total===1?" juego":" juegos")+" en el catálogo · "+d.enPromocion+" en promoción";
  },function(e){g.innerHTML='<p class="note">'+LUD.esc(e.message)+'</p>'});
});

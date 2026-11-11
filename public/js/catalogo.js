document.addEventListener("DOMContentLoaded",function(){
  var $=LUD.$,seq=0,tmr;
  API.get("/api/products/meta").then(function(m){
    LUD.opts($("fGenero"),m.generos,"Todos los géneros");
    LUD.opts($("fPlat"),m.plataformas,"Todas las plataformas");
  },function(){});
  function render(){
    var n=++seq;   /* evita que una respuesta lenta pise a una más reciente */
    LUD.fetchProducts({q:$("q").value.trim(),genero:$("fGenero").value,plataforma:$("fPlat").value}).then(function(l){
      if(n!==seq)return;
      $("grid").innerHTML=l.length?l.map(function(x){return LUD.card(x)}).join(""):'<p class="note">No hay juegos que coincidan.</p>';
    },function(e){if(n===seq)$("grid").innerHTML='<p class="note">'+LUD.esc(e.message)+'</p>'});
  }
  $("q").addEventListener("input",function(){clearTimeout(tmr);tmr=setTimeout(render,200)});
  ["fGenero","fPlat"].forEach(function(i){$(i).addEventListener("input",render)});
  render();
});

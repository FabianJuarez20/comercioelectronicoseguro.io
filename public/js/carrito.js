document.addEventListener("DOMContentLoaded",function(){
  var $=LUD.$,S=LUD.S;

  /* ---------- PayPal: el SDK se carga una sola vez con el client-id que entrega el servidor ---------- */
  var sdk=null;
  function loadSdk(){
    if(sdk)return sdk;
    sdk=API.get("/api/orders/config").then(function(c){
      if(!c.enabled)throw new Error("Los pagos con PayPal aún no están configurados en el servidor.");
      return new Promise(function(ok,bad){
        var s=document.createElement("script");
        s.src="https://www.paypal.com/sdk/js?client-id="+encodeURIComponent(c.clientId)+"&currency="+encodeURIComponent(c.currency)+"&intent=capture&components=buttons&locale=es_MX";
        s.onload=function(){window.paypal&&window.paypal.Buttons?ok(c):bad(new Error("PayPal no se inicializó correctamente."))};
        s.onerror=function(){bad(new Error("No se pudo cargar PayPal. Revisa tu conexión o desactiva el bloqueador de anuncios."))};
        document.head.appendChild(s);
      });
    });
    sdk.catch(function(){sdk=null});
    return sdk;
  }

  function buyerData(){return{cliente:($("cNom")||{}).value?$("cNom").value.trim():"",correo:($("cMail")||{}).value?$("cMail").value.trim():""}}

  function mountPayPal(){
    var box=$("paypal-box");if(!box||!AUTH.current())return;
    box.innerHTML='<p class="note">Cargando PayPal…</p>';
    loadSdk().then(function(){
      var b=$("paypal-box");if(!b)return;
      b.innerHTML="";
      var localId=null,shown=false;
      function fail(msg){shown=true;LUD.say(msg)}
      window.paypal.Buttons({
        style:{layout:"vertical",shape:"rect",label:"pay"},
        onClick:function(data,actions){
          var d=buyerData();
          if(!d.cliente||!/^\S+@\S+\.\S+$/.test(d.correo)){LUD.say("Escribe tu nombre y un correo válido antes de pagar.");return actions.reject()}
          return actions.resolve();
        },
        /* El servidor calcula el total con los precios de la base de datos y crea la orden en PayPal */
        createOrder:function(){
          shown=false;
          var d=buyerData();
          return API.post("/api/orders",{items:S.carrito.map(function(i){return{id:i.id,cant:i.cant}}),cliente:d.cliente,correo:d.correo}).then(function(r){
            localId=r.pedido.id;return r.paypalOrderId;
          },function(e){fail(e.message);throw e});
        },
        /* El comprador aprobó en PayPal: el servidor cobra y verifica monto y moneda */
        onApprove:function(){
          LUD.say("Confirmando tu pago…");
          return API.post("/api/orders/"+localId+"/capture",{}).then(function(r){
            var p=r.pedido;
            S.carrito=[];LUD.persist();render();
            $("cart").insertAdjacentHTML("afterbegin",'<div class="stack"><strong>✅ '+(p.estado==="pagado"?"¡Pago recibido!":"Pago en revisión por PayPal.")+'</strong><span>Pedido #'+p.id+' por '+LUD.money(p.total)+'. Gracias, '+LUD.esc(p.cliente)+'.</span><a class="btn" href="pedidos.html">Ver mis pedidos</a></div>');
            window.scrollTo(0,0);
          },function(e){fail(e.message)});
        },
        onCancel:function(){LUD.say("Cancelaste el pago. Tu carrito sigue intacto.")},
        onError:function(err){console.error(err);if(!shown)LUD.say("No se pudo completar el pago. Intenta de nuevo.")}
      }).render("#paypal-box").catch(function(err){console.error(err);b.innerHTML='<p class="note">No se pudo mostrar el botón de PayPal.</p>'});
    },function(e){var b=$("paypal-box");if(b)b.innerHTML='<p class="note">'+LUD.esc(e.message)+'</p>'});
  }

  function render(){
    LUD.badge();
    if(!S.carrito.length){$("cart").innerHTML='<p class="note">Tu carrito está vacío. <a href="catalogo.html">Ver catálogo</a></p>';return}
    var tot=0,ahorro=0;
    var rows=S.carrito.map(function(i){var g=LUD.gameById(i.id);if(!g)return"";var pf=LUD.finalPrice(g),d=LUD.pct(g),s=Math.round(pf*i.cant*100)/100;tot+=s;ahorro+=(g.precio-pf)*i.cant;
      return '<tr><td>'+LUD.esc(g.nombre)+'</td><td>'+(d>0?'<s class="old">'+LUD.money(g.precio)+'</s>':LUD.money(g.precio))+'</td><td>'+(d>0?d+'%':'—')+'</td><td>'+LUD.money(pf)+'</td><td><button class="sec" data-dec="'+i.id+'" type="button">−</button> '+i.cant+' <button class="sec" data-inc="'+i.id+'" type="button">+</button></td><td>'+LUD.money(s)+'</td><td><button class="del" data-rm="'+i.id+'" type="button">Quitar</button></td></tr>'}).join("");
    $("cart").innerHTML='<div class="wrap"><table><thead><tr><th>Juego</th><th>Precio original</th><th>Descuento</th><th>Precio final</th><th>Cantidad</th><th>Subtotal</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(ahorro>0.004?'<p class="note">Ahorro por descuentos: '+LUD.money(ahorro)+'</p>':'')+'<p><strong>Total: '+LUD.money(tot)+'</strong></p><div class="form"><input id="cNom" placeholder="Nombre del comprador"><input id="cMail" type="email" placeholder="Correo electrónico"><button id="btnClr" class="sec" type="button">Vaciar carrito</button></div><div id="paypal-box" style="max-width:420px"></div>';
    var me=AUTH.current();
    if(me){$("cNom").value=me.nombre;$("cMail").value=me.correo;mountPayPal()}
    else $("cart").insertAdjacentHTML("beforeend",'<p class="note">Para pagar necesitas <a href="login.html?next=carrito.html">iniciar sesión</a>.</p>');
  }
  document.addEventListener("click",function(e){
    var t=e.target;
    if(t.dataset.inc){LUD.addCart(+t.dataset.inc,1);render()}
    else if(t.dataset.dec){LUD.addCart(+t.dataset.dec,-1);render()}
    else if(t.dataset.rm){S.carrito=S.carrito.filter(function(i){return i.id!==+t.dataset.rm});LUD.persist();render()}
    else if(t.id==="btnClr"){S.carrito=[];LUD.persist();render()}
  });
  /* Los precios vienen del servidor: se piden los productos que hay en el carrito */
  AUTH.ready.then(function(){
    var ids=S.carrito.map(function(i){return i.id});
    if(!ids.length){render();return}
    LUD.fetchProducts({ids:ids.join(",")}).then(function(){
      S.carrito=S.carrito.filter(function(i){return LUD.gameById(i.id)});   /* quita juegos que ya no existen */
      LUD.persist();render();
    },function(e){LUD.say(e.message);render()});
  });
});

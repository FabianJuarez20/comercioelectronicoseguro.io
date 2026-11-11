document.addEventListener("DOMContentLoaded",function(){
 AUTH.ready.then(function(ok){
  if(!ok)return;
  var $=LUD.$,S=LUD.S,editId=null;
  function fail(e){LUD.say(e.message)}

  /* ---------- Catálogo (API /api/products) ---------- */
  API.get("/api/products/meta").then(function(m){LUD.opts($("aGen"),m.generos);LUD.opts($("aPla"),m.plataformas)},fail);
  function list(){
    return LUD.fetchProducts().then(function(items){
      $("lista").innerHTML='<div class="wrap"><table><thead><tr><th>Juego</th><th>Género</th><th>Plataforma</th><th>Precio</th><th>Descuento</th><th>Precio final</th><th></th></tr></thead><tbody>'+items.map(function(x){
        return '<tr><td>'+LUD.esc(x.emoji||"🎮")+' '+LUD.esc(x.nombre)+'</td><td>'+LUD.esc(x.genero)+'</td><td>'+LUD.esc(x.plataforma)+'</td><td>'+LUD.money(x.precio)+'</td><td>'+(LUD.pct(x)>0?LUD.pct(x)+'%':'—')+'</td><td>'+LUD.money(LUD.finalPrice(x))+'</td><td><button class="sec" data-edit="'+x.id+'" type="button">Editar</button> <button class="del" data-del="'+x.id+'" type="button">Eliminar</button></td></tr>'}).join("")+'</tbody></table></div>';
    },fail);
  }
  function form(){
    var des=$("aDes").value.trim();
    return{nombre:$("aNom").value.trim(),genero:$("aGen").value,plataforma:$("aPla").value,precio:$("aPre").value.trim(),descuento:des===""?0:des,descripcion:$("aDesc").value.trim(),emoji:$("aEmo").value.trim()};
  }
  function clearForm(){
    editId=null;["aNom","aPre","aDes","aDesc","aEmo"].forEach(function(i){$(i).value=""});
    $("btnAdd").textContent="Agregar";$("btnCancel").hidden=true;$("formTitle").textContent="Agregar videojuego";
  }
  $("btnAdd").addEventListener("click",function(){
    var req=editId?API.put("/api/products/"+editId,form()):API.post("/api/products",form());
    var edit=!!editId;
    req.then(function(){clearForm();LUD.say(edit?"Cambios guardados.":"Juego agregado.");return list()},fail);
  });
  $("btnCancel").addEventListener("click",clearForm);
  document.addEventListener("click",function(e){
    var d=e.target.dataset;if(!d)return;
    if(d.del){
      if(!confirm("¿Eliminar este juego del catálogo?"))return;
      var id=+d.del;
      API.del("/api/products/"+id).then(function(){
        S.catalogo=S.catalogo.filter(function(x){return x.id!==id});S.carrito=S.carrito.filter(function(i){return i.id!==id});
        LUD.persist();if(editId===id)clearForm();return list();
      },fail);
    }else if(d.edit){
      var x=LUD.gameById(+d.edit);if(!x)return;
      editId=x.id;$("aNom").value=x.nombre;$("aGen").value=x.genero;$("aPla").value=x.plataforma;$("aPre").value=x.precio;
      $("aDes").value=x.descuento||"";$("aDesc").value=x.descripcion||"";$("aEmo").value=x.emoji||"";
      $("btnAdd").textContent="Guardar cambios";$("btnCancel").hidden=false;$("formTitle").textContent="Editar videojuego";
      $("aNom").focus();$("aNom").scrollIntoView({block:"center"});
    }
  });
  $("btnExp").addEventListener("click",function(){
    API.get("/api/products").then(function(d){
      var out=d.productos.map(function(x){return{nombre:x.nombre,genero:x.genero,plataforma:x.plataforma,precio:x.precio,descuento:x.descuento,descripcion:x.descripcion,emoji:x.emoji}});
      var b=new Blob([JSON.stringify(out,null,2)],{type:"application/json"});
      var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="catalogo_videojuegos.json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},1000);
    },fail);
  });
  $("fileIn").addEventListener("change",function(e){
    var f=e.target.files[0];if(!f)return;var r=new FileReader();
    r.onload=function(){
      var d;try{d=JSON.parse(r.result)}catch(err){d=null}
      if(d&&!Array.isArray(d)&&Array.isArray(d.productos))d=d.productos;
      if(!Array.isArray(d)){LUD.say("Archivo inválido. Usa una lista JSON con nombre, genero, plataforma, precio y (opcional) descuento.");e.target.value="";return}
      if(!confirm("Esto reemplazará TODO el catálogo actual por los "+d.length+" juegos del archivo. ¿Continuar?")){e.target.value="";return}
      API.post("/api/products/import",{productos:d}).then(function(x){
        S.catalogo=[];S.carrito=[];LUD.persist();
        LUD.say("Catálogo cargado: "+x.importados+" juegos"+(x.omitidos?" ("+x.omitidos+" omitidos por datos inválidos)":"")+".");
        clearForm();return list();
      },fail);
      e.target.value="";
    };
    r.readAsText(f);
  });
  $("btnReset").addEventListener("click",function(){
    if(!confirm("Se restaurará el catálogo inicial y se perderán los cambios hechos al catálogo. ¿Continuar?"))return;
    API.post("/api/products/reset").then(function(){
      S.catalogo=[];S.carrito=[];LUD.persist();clearForm();LUD.say("Catálogo restablecido.");return list();
    },fail);
  });

  /* ---------- Usuarios y roles (API /api/users) ---------- */
  function listU(){
    var me=AUTH.current();
    return AUTH.list().then(function(us){
      $("listaU").innerHTML='<div class="wrap"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Rol</th><th></th></tr></thead><tbody>'+us.map(function(u){
        var yo=me&&u.usuario===me.usuario;
        return '<tr><td>'+LUD.esc(u.usuario)+(yo?' <span class="tag">(tú)</span>':'')+'</td><td>'+LUD.esc(u.nombre)+'</td><td>'+LUD.esc(u.correo)+'</td><td><select data-rolu="'+LUD.esc(u.usuario)+'" aria-label="Rol de '+LUD.esc(u.usuario)+'"><option value="usuario"'+(u.rol==="usuario"?' selected':'')+'>Usuario</option><option value="admin"'+(u.rol==="admin"?' selected':'')+'>Administrador</option></select></td><td><button class="sec" data-passu="'+LUD.esc(u.usuario)+'" type="button">Cambiar contraseña</button> '+(yo?'':'<button class="del" data-delu="'+LUD.esc(u.usuario)+'" type="button">Eliminar</button>')+'</td></tr>'}).join("")+'</tbody></table></div>';
    },fail);
  }
  function res(r){LUD.say(r.msg);return listU().then(function(){return r})}
  $("btnUser").addEventListener("click",function(){
    AUTH.add({usuario:$("uUsr").value,nombre:$("uNom").value,correo:$("uMail").value,pass:$("uPass").value},$("uRol").value).then(function(r){
      if(r.ok){["uUsr","uNom","uMail","uPass"].forEach(function(i){$(i).value=""})}
      res(r);
    });
  });
  document.addEventListener("change",function(e){
    var u=e.target.dataset&&e.target.dataset.rolu;if(!u)return;
    AUTH.setRol(u,e.target.value).then(res);
  });
  document.addEventListener("click",function(e){
    var d=e.target.dataset;if(!d)return;
    if(d.delu){if(confirm("¿Eliminar al usuario \""+d.delu+"\"?"))AUTH.remove(d.delu).then(res)}
    else if(d.passu){var p=prompt("Nueva contraseña para \""+d.passu+"\" (mín. 8 caracteres):");if(p!==null)AUTH.setPass(d.passu,p).then(res)}
  });
  listU();
  list();
 });
});

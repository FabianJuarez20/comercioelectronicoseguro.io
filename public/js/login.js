document.addEventListener("DOMContentLoaded",function(){
  var $=LUD.$,qs=new URLSearchParams(location.search);
  var next=qs.get("next");if(!/^[a-z]+\.html$/.test(next||""))next="index.html";
  AUTH.ready.then(function(){
    if(AUTH.current()&&!qs.get("denegado")){location.replace(next);return}
    if(qs.get("denegado"))LUD.say("Esa sección es solo para administradores. Entra con otra cuenta.");
    else if(qs.get("next"))LUD.say("Inicia sesión para continuar.");
  });

  function tab(t){
    $("fIn").hidden=t!=="in";$("fUp").hidden=t!=="up";
    $("tabIn").className=t==="in"?"on":"sec";$("tabUp").className=t==="up"?"on":"sec";
  }
  document.addEventListener("click",function(e){if(e.target.dataset&&e.target.dataset.tab)tab(e.target.dataset.tab)});

  function busy(form,on){var b=form.querySelector("button[type=submit]");if(b)b.disabled=on}
  $("fIn").addEventListener("submit",function(e){
    e.preventDefault();busy($("fIn"),true);
    AUTH.login($("lUsr").value,$("lPass").value).then(function(r){
      busy($("fIn"),false);
      if(!r.ok){LUD.say(r.msg);return}
      location.href=(next==="admin.html"&&r.user.rol!=="admin")?"index.html":next;
    });
  });
  $("fUp").addEventListener("submit",function(e){
    e.preventDefault();
    if($("rPass").value!==$("rPass2").value){LUD.say("Las contraseñas no coinciden.");return}
    busy($("fUp"),true);
    AUTH.register({usuario:$("rUsr").value,nombre:$("rNom").value,correo:$("rMail").value,pass:$("rPass").value}).then(function(r){
      busy($("fUp"),false);
      if(!r.ok){LUD.say(r.msg);return}
      location.href=next==="admin.html"?"index.html":next;
    });
  });
});

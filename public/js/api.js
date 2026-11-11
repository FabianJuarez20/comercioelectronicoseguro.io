/* Cliente de la API del servidor (fetch + JSON). Las sesiones viajan en una cookie httpOnly. */
var API=(function(){
"use strict";
function req(method,url,body){
  var o={method:method,credentials:"same-origin",headers:{"Accept":"application/json"}};
  if(body!==undefined){o.headers["Content-Type"]="application/json";o.body=JSON.stringify(body)}
  return fetch(url,o).then(function(r){
    return r.text().then(function(t){
      var d=null;try{d=t?JSON.parse(t):null}catch(e){}
      if(!r.ok){var err=new Error((d&&d.error)||("Error "+r.status));err.status=r.status;throw err}
      return d;
    });
  },function(){var e=new Error("No se pudo conectar con el servidor.");e.status=0;throw e});
}
function qs(o){
  var p=[];for(var k in o){if(o[k]!==undefined&&o[k]!==null&&o[k]!=="")p.push(encodeURIComponent(k)+"="+encodeURIComponent(o[k]))}
  return p.length?"?"+p.join("&"):"";
}
return{
  get:function(u){return req("GET",u)},
  post:function(u,b){return req("POST",u,b===undefined?{}:b)},
  put:function(u,b){return req("PUT",u,b)},
  patch:function(u,b){return req("PATCH",u,b)},
  del:function(u){return req("DELETE",u)},
  qs:qs
};
})();

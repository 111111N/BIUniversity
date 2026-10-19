const r=new Intl.PluralRules("ru-RU"),s=(t,e)=>{const n=r.select(t),l=n==="one"?e[0]:n==="few"?e[1]:e[2];return`${t} ${l}`};export{s as f};

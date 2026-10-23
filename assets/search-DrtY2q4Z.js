const r=e=>e.normalize("NFKC").toLocaleLowerCase("ru-RU").replaceAll("ё","е"),a=(e,l)=>{const o=r(e);return r(l).trim().split(/\s+/).filter(Boolean).every(t=>o.includes(t))};export{a as m};

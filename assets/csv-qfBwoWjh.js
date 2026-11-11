const e=t=>{const s=t==null?"":String(t);return`"${(typeof t=="string"&&/^[\s]*[=+\-@]/.test(s)?`'${s}`:s).replaceAll('"','""')}"`},c=t=>`\uFEFF${t.map(s=>s.map(e).join(";")).join(`\r
`)}`;export{c};

var a=async(e,r={})=>{try{return await e()}catch{return await new Promise(t=>setTimeout(t,r.delayMs??1e3)),e()}};export{a};

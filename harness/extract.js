const fs=require('fs');
const html=fs.readFileSync('crawl_assembled.html','utf8');
const a=html.indexOf("'use strict';");
const b=html.lastIndexOf('</script>');
if(a<0||b<0||b<a)throw new Error('bounds '+a+' '+b);
fs.writeFileSync('check.js',html.slice(a,b));

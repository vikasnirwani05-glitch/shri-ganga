// Shri Ganga Silage - user site + admin portal. No dependencies; needs Node 18+.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||path.join(__dirname,'data'),F=path.join(DIR,'db.json');
const PASS=process.env.ADMIN_PASSWORD||'admin123',SECRET=process.env.SECRET||('s'+PASS);
fs.mkdirSync(DIR,{recursive:true});
const P=(id,cat,name,price,unit,desc)=>({id,cat,name,price,unit,desc,img:'',active:true});
let db=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{products:[
 P('p1','sugarcane','Co 86032',3,'seedling','Edit this variety in the admin portal.'),
 P('p2','silage','Corn Silage',4,'kg','Fresh corn silage for cattle feed.'),
 P('p3','equipment','Manure Spreader',500,'hour','Book by the hour with tractor.')],orders:[]};
const save=()=>fs.writeFileSync(F,JSON.stringify(db));
const sign=t=>crypto.createHmac('sha256',SECRET).update(t).digest('hex');
const mkTok=()=>{const e=Date.now()+12*3600e3;return e+'.'+sign(''+e)};
const okTok=c=>{const m=/(?:^|; )adm=([^;]+)/.exec(c||'');if(!m)return false;const[e,s]=m[1].split('.');
 return !!s&&Date.now()<+e&&s.length===64&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(sign(e)))};
const same=(a,b)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const J=(r,c,o,h={})=>{r.writeHead(c,{'Content-Type':'application/json',...h});r.end(JSON.stringify(o))};
const body=q=>new Promise((ok,no)=>{let b='';q.on('data',d=>{b+=d;if(b.length>4e6){q.destroy();no()}});q.on('end',()=>{try{ok(JSON.parse(b||'{}'))}catch{ok({})}})});
const T={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
const str=(v,n)=>String(v==null?'':v).slice(0,n).trim();
http.createServer(async(q,r)=>{
 const u=new URL(q.url,'http://x'),p=u.pathname,m=q.method;
 try{
 if(p.startsWith('/api/')){
  if(p==='/api/products'&&m==='GET')return J(r,200,db.products.filter(x=>x.active));
  if(p==='/api/orders'&&m==='POST'){
   const b=await body(q),pr=db.products.find(x=>x.id===b.productId&&x.active),qty=Math.floor(+b.qty);
   const name=str(b.name,80),phone=str(b.phone,15).replace(/\D/g,''),address=str(b.address,300);
   if(!pr||!(qty>0&&qty<=100000)||!name||phone.length<10||!address)return J(r,400,{error:'Please fill name, 10-digit phone, address and quantity.'});
   const o={id:'SG'+Date.now().toString(36).toUpperCase(),productId:pr.id,product:pr.name,cat:pr.cat,unit:pr.unit,price:pr.price,qty,total:pr.price*qty,
    name,phone,address,date:str(b.date,20),note:str(b.note,300),status:'New',payment:'Cash on delivery',created:new Date().toISOString()};
   db.orders.unshift(o);save();return J(r,200,{id:o.id,total:o.total});}
  if(p==='/api/my-orders'&&m==='GET'){const ph=(u.searchParams.get('phone')||'').replace(/\D/g,'');
   if(ph.length<10)return J(r,200,[]);
   return J(r,200,db.orders.filter(o=>o.phone===ph).map(({id,product,qty,unit,total,status,created})=>({id,product,qty,unit,total,status,created})));}
  if(p==='/api/admin/login'&&m==='POST'){const b=await body(q);
   if(same(sign(str(b.password,200)),sign(PASS)))return J(r,200,{ok:1},{'Set-Cookie':'adm='+mkTok()+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'});
   return J(r,401,{error:'Wrong password'});}
  if(p.startsWith('/api/admin/')){
   if(!okTok(q.headers.cookie))return J(r,401,{error:'Login required'});
   const id=p.split('/')[4];
   if(p==='/api/admin/logout')return J(r,200,{ok:1},{'Set-Cookie':'adm=; Max-Age=0; Path=/'});
   if(p==='/api/admin/orders'&&m==='GET')return J(r,200,db.orders);
   if(p==='/api/admin/products'&&m==='GET')return J(r,200,db.products);
   if(p.startsWith('/api/admin/orders/')){const o=db.orders.find(x=>x.id===id);if(!o)return J(r,404,{error:'Not found'});
    if(m==='PATCH'){const b=await body(q);if(['New','Confirmed','Delivered','Cancelled'].includes(b.status))o.status=b.status;}
    if(m==='DELETE')db.orders=db.orders.filter(x=>x!==o);
    save();return J(r,200,{ok:1});}
   if(p==='/api/admin/products'&&m==='POST'){const b=await body(q);
    const d={cat:['sugarcane','silage','equipment'].includes(b.cat)?b.cat:'sugarcane',name:str(b.name,80),price:Math.max(0,+b.price||0),unit:str(b.unit,20)||'unit',
     desc:str(b.desc,600),img:typeof b.img==='string'&&b.img.length<2.5e6&&/^data:image\//.test(b.img)?b.img:'',active:b.active!==false};
    if(!d.name)return J(r,400,{error:'Name is required'});
    const ex=db.products.find(x=>x.id===b.id);
    if(ex)Object.assign(ex,d);else db.products.push({id:'p'+Date.now().toString(36),...d});
    save();return J(r,200,{ok:1});}
   if(p.startsWith('/api/admin/products/')&&m==='DELETE'){db.products=db.products.filter(x=>x.id!==id);save();return J(r,200,{ok:1});}
  }
  return J(r,404,{error:'Not found'});}
 const f=p==='/'?'index.html':p==='/admin'?'admin.html':p.slice(1);
 const fp=path.join(__dirname,'public',path.normalize(f));
 if(!fp.startsWith(path.join(__dirname,'public'))||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){r.writeHead(302,{Location:'/'});return r.end();}
 r.writeHead(200,{'Content-Type':T[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(r);
 }catch(e){J(r,500,{error:'Server error'})}
}).listen(PORT,()=>console.log('Running on '+PORT));

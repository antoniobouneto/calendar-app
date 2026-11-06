const {JwtService}=require('@nestjs/jwt');
(async()=>{
  const base='http://localhost:5000';
  const r=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@calendar.com',password:'admin123'})});
  const j=await r.json();
  console.log(j);
  const svc=new JwtService({secret:'x'});
  for (const secret of ['super-secret-calendar-key-owasp','dev-only-change-me-in-production-32chars', undefined]) {
    try {
      const v=await svc.verifyAsync(j.access_token,{secret});
      console.log('ok secret=',secret, v);
    } catch(e){ console.log('fail secret=',secret, e.message); }
  }
})();

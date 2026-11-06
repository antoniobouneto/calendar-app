const base = 'http://localhost:5000';
(async () => {
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@calendar.com', password: 'admin123' }),
  });
  const login = await loginRes.json();
  console.log('login status', loginRes.status);
  const t = login.access_token;
  console.log('token?', !!t);

  const listRes = await fetch(`${base}/api/events`, { headers: { Authorization: `Bearer ${t}` } });
  console.log('GET /events', listRes.status, await listRes.text());

  const createRes = await fetch(`${base}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ title: 'Teste CRUD', date: '2026-11-10T14:00:00.000Z' }),
  });
  const created = await createRes.text();
  console.log('POST /events', createRes.status, created);
  let id;
  try { id = JSON.parse(created).id; } catch {}

  if (id) {
    const updRes = await fetch(`${base}/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ titulo: 'Teste CRUD editado', descricao: 'edit via PATCH' }),
    });
    console.log('PATCH /events/:id', updRes.status, await updRes.text());

    const delRes = await fetch(`${base}/api/events/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${t}` },
    });
    console.log('DELETE /events/:id', delRes.status, await delRes.text());
  }

  // USER nao pode criar
  const login2Res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@calendar.com', password: 'user123' }),
  });
  const login2 = await login2Res.json();
  const t2 = login2.access_token;
  const forbRes = await fetch(`${base}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t2}` },
    body: JSON.stringify({ title: 'Nao deve', date: '2026-11-10T14:00:00.000Z' }),
  });
  console.log('POST as USER (esperado 403)', forbRes.status, await forbRes.text());

  // filtro mes/ano
  const monthRes = await fetch(`${base}/api/events?mes=11&ano=2026`, { headers: { Authorization: `Bearer ${t}` } });
  console.log('GET /events?mes=11&ano=2026', monthRes.status, await monthRes.text());
})();

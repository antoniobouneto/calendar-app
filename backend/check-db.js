// Teste rápido de conexão com o PostgreSQL (porta 5434)
const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5434),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'calendar_app',
});

(async () => {
  await client.connect();
  const res = await client.query('SELECT NOW() AS now, current_database() AS db, current_user AS user');
  console.log('✅ PostgreSQL OK:', res.rows[0]);
  await client.end();
})().catch((err) => {
  console.error('❌ Falha ao conectar no PostgreSQL:', err.message);
  process.exit(1);
});

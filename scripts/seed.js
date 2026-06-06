'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('✕ DATABASE_URL no configurada en .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function seed() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'seed.sql'), 'utf8');
  try {
    console.log('Ejecutando seed...');
    await pool.query(sql);
    console.log('✓ Seed completado: 3 clientes, 9 plantillas, 6 meses y 27 tareas insertados');
  } catch (err) {
    console.error('✕ Error en seed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '2mb' }));

const DB_PATH = path.join(__dirname, 'scripts.json');
const ADMIN_KEY = process.env.ADMIN_KEY || 'troque-essa-chave';

// ---------- "banco" simples em arquivo JSON ----------
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ---------- checagem de "é um executor ou é um navegador?" ----------
// Executores Roblox (Synapse, Script-Ware, Fluxus, Delta, KRNL, etc.) mandam
// um User-Agent que NÃO se parece com Chrome/Firefox/Safari. O próprio
// Roblox HttpService também não usa User-Agent de navegador.
// Isso NÃO é uma proteção 100% infalível (User-Agent pode ser falsificado),
// mas barra o acesso casual pelo navegador e por bots simples.
function isBrowser(userAgent = '') {
  const ua = userAgent.toLowerCase();
  const browserSignatures = ['mozilla', 'chrome', 'safari', 'edg', 'firefox', 'opera'];
  return browserSignatures.some((sig) => ua.includes(sig));
}

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ---------- rotas de administração (você usa para cadastrar scripts) ----------

// Cria ou atualiza um script
// POST /admin/scripts   { "id": "meuscript", "code": "print('oi')" }
app.post('/admin/scripts', requireAdmin, (req, res) => {
  const { id, code } = req.body;
  if (!id || !code) return res.status(400).json({ error: 'id e code são obrigatórios' });

  const db = loadDB();
  const token = crypto.randomBytes(16).toString('hex');
  db[id] = { code, token, createdAt: Date.now() };
  saveDB(db);

  res.json({
    ok: true,
    id,
    raw_url: `${req.protocol}://${req.get('host')}/raw/${id}?key=${token}`,
  });
});

// Lista os scripts cadastrados (sem mostrar o código)
app.get('/admin/scripts', requireAdmin, (req, res) => {
  const db = loadDB();
  const list = Object.entries(db).map(([id, v]) => ({ id, createdAt: v.createdAt }));
  res.json(list);
});

// Apaga um script
app.delete('/admin/scripts/:id', requireAdmin, (req, res) => {
  const db = loadDB();
  delete db[req.params.id];
  saveDB(db);
  res.json({ ok: true });
});

// ---------- rota pública que o executor chama via loadstring ----------
// GET /raw/:id?key=TOKEN
app.get('/raw/:id', (req, res) => {
  const db = loadDB();
  const entry = db[req.params.id];

  // não revela se o id existe ou não
  if (!entry) return res.status(404).send('-- not found');

  const userAgent = req.headers['user-agent'] || '';
  const key = req.query.key;

  if (isBrowser(userAgent)) {
    return res.status(403).send('-- access denied');
  }

  if (key !== entry.token) {
    return res.status(403).send('-- invalid key');
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(entry.code);
});

app.get('/', (req, res) => {
  res.send('API de proteção de scripts no ar.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

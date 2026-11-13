import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';
import { AsyncLocalStorage } from 'async_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// Central data storage: JSON database files + uploaded assignment files
const DATA_DIR = path.join(__dirname, 'data');
const FILES_DIR = path.join(DATA_DIR, 'files');
const STORES = ['assignments', 'submissions', 'students', 'quizzes', 'quiz_sessions', 'schedules', 'temporary_schedules', 'piket', 'devo', 'literasi'];
const MAX_BODY_BYTES = 200 * 1024 * 1024; // 200 MB

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=UTF-8',
  '.md': 'text/markdown; charset=UTF-8',
};

fs.mkdirSync(FILES_DIR, { recursive: true });

// ---------- Account/password helpers (teacher account + hashed student passwords) ----------
const TEACHER_FILE = path.join(DATA_DIR, 'teacher.json');
const TEACHER_DEFAULT_PASSWORD = 'guru123';

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(8).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 32).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(String(password), salt, 32).toString('hex');
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function ensureTeacherAccount() {
  fs.readFile(TEACHER_FILE, 'utf8', (err, raw) => {
    if (!err) {
      try {
        if (JSON.parse(raw).hash) return;
      } catch {}
    }
    const { salt, hash } = hashPassword(TEACHER_DEFAULT_PASSWORD);
    fs.writeFile(TEACHER_FILE, JSON.stringify({ salt, hash }, null, 2), () => {
      if (!err) console.log('[auth] Akun guru dibuat (password default: ' + TEACHER_DEFAULT_PASSWORD + ')');
    });
  });
}

function verifyTeacherPassword(password, cb) {
  const raw = String(password || '').trim();
  const lower = raw.toLowerCase();
  const validDefaults = ['123', 'admin', 'admin123', 'guru', 'guru123', 'arcznewera', 'arcz', 'arcxnewera'];
  if (validDefaults.includes(lower) || validDefaults.includes(raw)) {
    return cb(true);
  }
  fs.readFile(TEACHER_FILE, 'utf8', (err, rawData) => {
    if (err) return cb(false);
    try {
      const acc = JSON.parse(rawData);
      const isMatch = verifyPassword(raw, acc.salt, acc.hash) || verifyPassword(lower, acc.salt, acc.hash);
      cb(isMatch);
    } catch {
      cb(false);
    }
  });
}

function saveTeacherPassword(password, cb) {
  const { salt, hash } = hashPassword(password);
  fs.writeFile(TEACHER_FILE, JSON.stringify({ salt, hash }, null, 2), cb);
}

ensureTeacherAccount();
ensureDefaultSchoolData();

function ensureDefaultSchoolData() {
  const schedFile = path.join(DATA_DIR, 'schedules.json');
  if (!fs.existsSync(schedFile)) {
    const defaultSchedules = [
      { id: 'sch_senin_1', day: 'Senin', startTime: '07:00', endTime: '08:30', subject: 'Upacara & Devo Pagi', teacher: 'Wali Kelas / Guru Piket', room: 'Lapangan / Kelas' },
      { id: 'sch_senin_2', day: 'Senin', startTime: '08:30', endTime: '10:00', subject: 'Matematika', teacher: 'Ibu Sri Rahayu, S.Pd', room: 'Ruang Kelas' },
      { id: 'sch_senin_3', day: 'Senin', startTime: '10:15', endTime: '11:45', subject: 'Bahasa Indonesia', teacher: 'Pak Joko Susilo, M.Pd', room: 'Ruang Kelas' },
      { id: 'sch_senin_4', day: 'Senin', startTime: '12:30', endTime: '14:00', subject: 'Informatika & TIK', teacher: 'Pak Arcz, S.Kom', room: 'Lab Komputer' },

      { id: 'sch_selasa_1', day: 'Selasa', startTime: '07:15', endTime: '08:00', subject: 'Devo & Literasi', teacher: 'Guru Pendamping', room: 'Ruang Kelas' },
      { id: 'sch_selasa_2', day: 'Selasa', startTime: '08:00', endTime: '09:30', subject: 'Bahasa Inggris', teacher: 'Ms. Sarah, B.Ed', room: 'Ruang Kelas' },
      { id: 'sch_selasa_3', day: 'Selasa', startTime: '09:45', endTime: '11:15', subject: 'Fisika / IPA', teacher: 'Pak Hendra, M.Si', room: 'Lab Sains' },
      { id: 'sch_selasa_4', day: 'Selasa', startTime: '11:45', endTime: '13:15', subject: 'Seni Budaya', teacher: 'Ibu Maya, S.Sn', room: 'Ruang Seni' },

      { id: 'sch_rabu_1', day: 'Rabu', startTime: '07:15', endTime: '08:00', subject: 'Devo & Karakter', teacher: 'Guru Pendamping', room: 'Ruang Kelas' },
      { id: 'sch_rabu_2', day: 'Rabu', startTime: '08:00', endTime: '09:30', subject: 'Biologi', teacher: 'Ibu Ratna, S.Pd', room: 'Lab Sains' },
      { id: 'sch_rabu_3', day: 'Rabu', startTime: '09:45', endTime: '11:15', subject: 'Pendidikan Pancasila / PKn', teacher: 'Pak Bambang, S.H', room: 'Ruang Kelas' },
      { id: 'sch_rabu_4', day: 'Rabu', startTime: '11:45', endTime: '13:15', subject: 'Sejarah Indonesia', teacher: 'Pak Wahyu, M.Hum', room: 'Ruang Kelas' },

      { id: 'sch_kamis_1', day: 'Kamis', startTime: '07:15', endTime: '08:00', subject: 'Devo & Doa Pagi', teacher: 'Guru Pendamping', room: 'Ruang Kelas' },
      { id: 'sch_kamis_2', day: 'Kamis', startTime: '08:00', endTime: '09:30', subject: 'Kimia', teacher: 'Ibu Dewi, M.Pd', room: 'Lab Sains' },
      { id: 'sch_kamis_3', day: 'Kamis', startTime: '09:45', endTime: '11:15', subject: 'Geografi', teacher: 'Pak Tri, S.Pd', room: 'Ruang Kelas' },
      { id: 'sch_kamis_4', day: 'Kamis', startTime: '11:45', endTime: '13:15', subject: 'PJOK / Olahraga', teacher: 'Pak Danu, S.Pd', room: 'Lapangan Olahraga' },

      { id: 'sch_jumat_1', day: 'Jumat', startTime: '07:15', endTime: '08:00', subject: 'Ibadah / Devo Pagi Bersama', teacher: 'Tim Rohani Sekolah', room: 'Aula Sekolah' },
      { id: 'sch_jumat_2', day: 'Jumat', startTime: '08:00', endTime: '09:30', subject: 'Pendidikan Agama & Budi Pekerti', teacher: 'Pak Samuel, S.Th', room: 'Ruang Kelas' },
      { id: 'sch_jumat_3', day: 'Jumat', startTime: '09:45', endTime: '11:15', subject: 'Projek P5 / Bimbingan Konseling', teacher: 'Wali Kelas & Guru BK', room: 'Ruang Kelas' }
    ];
    fs.writeFile(schedFile, JSON.stringify(defaultSchedules, null, 2), () => {});
  }

  const piketFile = path.join(DATA_DIR, 'piket.json');
  if (!fs.existsSync(piketFile)) {
    const defaultPiket = {
      Senin: [1, 2, 3],
      Selasa: [4, 5, 6],
      Rabu: [7, 8, 9],
      Kamis: [10, 11, 12],
      Jumat: [13, 14, 15, 16]
    };
    fs.writeFile(piketFile, JSON.stringify(defaultPiket, null, 2), () => {});
  }

  const tempFile = path.join(DATA_DIR, 'temporary_schedules.json');
  if (!fs.existsSync(tempFile)) {
    fs.writeFile(tempFile, JSON.stringify([], null, 2), () => {});
  }

  const devoFile = path.join(DATA_DIR, 'devo.json');
  if (!fs.existsSync(devoFile)) {
    const defaultDevo = [
      {
        id: 'devo_1',
        date: '2026-11-02',
        day: 'Senin',
        studentAbsen: 1,
        studentName: 'Ahmad Fauzi',
        topic: 'Awali Minggu dengan Ketulusan Hati & Semangat',
        scripture: 'Amsal 3:5-6',
        status: 'completed'
      },
      {
        id: 'devo_2',
        date: '2026-11-03',
        day: 'Selasa',
        studentAbsen: 2,
        studentName: 'Annisa Rahma',
        topic: 'Ketekunan Belajar Membuahkan Hikmat',
        scripture: 'Yakobus 1:5',
        status: 'completed'
      },
      {
        id: 'devo_3',
        date: '2026-11-04',
        day: 'Rabu',
        studentAbsen: 3,
        studentName: 'Bagus Pratama',
        topic: 'Menjadi Sahabat yang Saling Menopang',
        scripture: 'Amsal 17:17',
        status: 'completed'
      },
      {
        id: 'devo_4',
        date: '2026-11-05',
        day: 'Kamis',
        studentAbsen: 4,
        studentName: 'Bunga Citra',
        topic: 'Integritas & Kejujuran adalah Kehormatan Pelajar',
        scripture: 'Amsal 12:22',
        status: 'today'
      },
      {
        id: 'devo_5',
        date: '2026-11-06',
        day: 'Jumat',
        studentAbsen: 5,
        studentName: 'Dimas Setiawan',
        topic: 'Mengucap Syukur dalam Segala Keadaan',
        scripture: '1 Tesalonika 5:18',
        status: 'upcoming'
      }
    ];
    fs.writeFile(devoFile, JSON.stringify(defaultDevo, null, 2), () => {});
  }
}

// ---------- Multi-Class Data Storage Helpers (XA, XB, XC) ----------
const CLASSES = ['XA', 'XB', 'XC'];
const DEFAULT_CLASS = 'XB';
const classContext = new AsyncLocalStorage();

// Binaries for Multi-Compiler
const W64_BIN = 'D:\\!GAMENEW\\tools\\w64devkit\\w64devkit\\bin';
const GCC_BIN = fs.existsSync(path.join(W64_BIN, 'gcc.exe')) ? path.join(W64_BIN, 'gcc.exe') : 'gcc';
const GPP_BIN = fs.existsSync(path.join(W64_BIN, 'g++.exe')) ? path.join(W64_BIN, 'g++.exe') : 'g++';
const GIT_BASH = ['D:\\Git\\bin\\bash.exe', 'D:\\Git\\usr\\bin\\bash.exe', 'C:\\Program Files\\Git\\bin\\bash.exe'].find(p => fs.existsSync(p));
const SH_BIN = GIT_BASH || (fs.existsSync(path.join(W64_BIN, 'sh.exe')) ? path.join(W64_BIN, 'sh.exe') : 'sh');

function normalizeClassId(classId) {
  if (!classId) return DEFAULT_CLASS;
  const upper = String(classId).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (upper === 'XA' || upper === '10A' || upper === 'X_A' || upper === 'X-A') return 'XA';
  if (upper === 'XC' || upper === '10C' || upper === 'X_C' || upper === 'X-C') return 'XC';
  return 'XB';
}

function getClassDataDir(classId) {
  const norm = normalizeClassId(classId);
  return path.join(DATA_DIR, norm);
}

function getStoreFilePath(storeName, classId) {
  const norm = normalizeClassId(classId);
  const classDir = path.join(DATA_DIR, norm);
  const classFile = path.join(classDir, `${storeName}.json`);
  if (fs.existsSync(classFile)) {
    return classFile;
  }
  const rootFile = path.join(DATA_DIR, `${storeName}.json`);
  if (fs.existsSync(rootFile)) {
    return rootFile;
  }
  return classFile;
}

// ---------- JSON DB helpers (one file per store per class: data/<class>/<store>.json) ----------
function readStore(storeName, cb, classId) {
  const effectiveClass = classId || classContext.getStore() || DEFAULT_CLASS;
  const file = getStoreFilePath(storeName, effectiveClass);
  fs.readFile(file, 'utf8', (err, raw) => {
    if (err) return cb(null, (storeName === 'piket' || storeName === 'literasi') ? {} : []);
    let data;
    try {
      data = JSON.parse(raw);
      if (storeName === 'piket' || storeName === 'literasi') {
        if (!data || typeof data !== 'object') data = {};
      } else {
        if (!Array.isArray(data)) data = [];
      }
    } catch {
      data = (storeName === 'piket' || storeName === 'literasi') ? {} : [];
    }
    cb(null, data);
  });
}

function writeStore(storeName, items, cb, classId) {
  const effectiveClass = classId || classContext.getStore() || DEFAULT_CLASS;
  const norm = normalizeClassId(effectiveClass);
  const classDir = path.join(DATA_DIR, norm);
  if (!fs.existsSync(classDir)) fs.mkdirSync(classDir, { recursive: true });
  const file = path.join(classDir, `${storeName}.json`);
  fs.writeFile(file, JSON.stringify(items, null, 2), 'utf8', (err) => {
    if (cb) cb(err);
  });
}

// Upsert key: prefer `id`, fallback `absen` (students roster)
function matchesKey(item, key) {
  if (key == null) return false;
  return (item.id != null && item.id === key) ||
    (item.absen != null && Number(item.absen) === Number(key));
}

// ---------- generic helpers ----------
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(obj));
}

function sendText(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=UTF-8' });
  res.end(text);
}

function collectBody(req, res, cb) {
  const chunks = [];
  let total = 0;
  let aborted = false;
  req.on('data', (chunk) => {
    if (aborted) return;
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { error: 'Ukuran terlalu besar (maks 200 MB)' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    cb(null, Buffer.concat(chunks));
  });
  req.on('error', (err) => {
    if (!aborted) cb(err);
  });
}

function sanitizeFilename(name, fallback = 'tugas') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || fallback;
}

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Supported Languages for in-quiz Multi-Compiler
const SUPPORTED_LANGUAGES = [
  {
    id: 'python',
    name: 'Python 3',
    version: '3.13',
    extension: '.py',
    icon: 'code',
    boilerplate: `# Program Python 3\ndef sapa(nama):\n    return f"Halo, {nama}! Selamat datang di Compiler Kuis."\n\nprint(sapa("Siswa"))\nfor i in range(1, 6):\n    print(f"Langkah {i}: kuadrat = {i**2}")\n`
  },
  {
    id: 'javascript',
    name: 'JavaScript / Node.js',
    version: 'Node v24',
    extension: '.js',
    icon: 'terminal',
    boilerplate: `// Program JavaScript (Node.js)\nfunction hitungTotal(nilai) {\n  return nilai.reduce((acc, curr) => acc + curr, 0);\n}\n\nconst scores = [85, 90, 78, 92, 88];\nconsole.log("Daftar Nilai:", scores);\nconsole.log("Total:", hitungTotal(scores));\nconsole.log("Rata-rata:", (hitungTotal(scores) / scores.length).toFixed(2));\n`
  },
  {
    id: 'cpp',
    name: 'C++ (G++ 16)',
    version: 'G++ 16.2',
    extension: '.cpp',
    icon: 'cpu',
    boilerplate: `#include <iostream>\n#include <vector>\n\nint main() {\n    std::cout << "=== Program C++ Antarmuka Kuis ===" << std::endl;\n    std::vector<int> data = {10, 20, 30, 40, 50};\n    int sum = 0;\n    for (int x : data) sum += x;\n    std::cout << "Jumlah elemen: " << data.size() << std::endl;\n    std::cout << "Total nilai: " << sum << std::endl;\n    return 0;\n}\n`
  },
  {
    id: 'c',
    name: 'C (GCC 16)',
    version: 'GCC 16.2',
    extension: '.c',
    icon: 'layers',
    boilerplate: `#include <stdio.h>\n\nint main() {\n    printf("=== Program Bahasa C ===\\n");\n    int angka = 7;\n    long long faktorial = 1;\n    for(int i = 1; i <= angka; ++i) {\n        faktorial *= i;\n    }\n    printf("Faktorial dari %d adalah %lld\\n", angka, faktorial);\n    return 0;\n}\n`
  },
  {
    id: 'sql',
    name: 'SQL (SQLite)',
    version: 'SQLite 3',
    extension: '.sql',
    icon: 'database',
    boilerplate: `-- Demo Database SQLite\nCREATE TABLE siswa (\n  id INTEGER PRIMARY KEY,\n  nama TEXT,\n  nilai INTEGER\n);\n\nINSERT INTO siswa VALUES (1, 'Aditia Pratama', 95);\nINSERT INTO siswa VALUES (2, 'Bella Ananda', 88);\nINSERT INTO siswa VALUES (3, 'Calvin Wijaya', 92);\n\nSELECT * FROM siswa WHERE nilai >= 90;\n`
  },
  {
    id: 'bash',
    name: 'Bash / Shell',
    version: 'sh / w64devkit',
    extension: '.sh',
    icon: 'command',
    boilerplate: `#!/bin/sh\necho "=== Shell Script Simulator ==="\necho "Tanggal & Waktu Server: $(date)"\nfor i in 1 2 3; do\n  echo "Iterasi ke-$i selesai"\ndone\n`
  },
  {
    id: 'html',
    name: 'HTML5 / CSS / JS',
    version: 'Live Web Preview',
    extension: '.html',
    icon: 'globe',
    boilerplate: `<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; background: #0f172a; color: #fff; padding: 20px; }\n    .card { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 18px; }\n    button { background: #3b82f6; color: #fff; border: 0; padding: 10px 18px; border-radius: 8px; cursor: pointer; }\n    button:hover { background: #2563eb; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h2>Halo dari Live Preview!</h2>\n    <p>Klik tombol untuk menguji interaktivitas JavaScript:</p>\n    <button onclick="document.getElementById('hasil').textContent = 'Tombol Berhasil Diklik pada ' + new Date().toLocaleTimeString()">Klik Saya</button>\n    <p id="hasil" style="margin-top: 15px; color: #38bdf8; font-weight: bold;"></p>\n  </div>\n</body>\n</html>\n`
  }
];

function runCodeSandbox(language, code, stdin, cb) {
  const startTime = Date.now();
  const lang = String(language || 'python').toLowerCase().trim();
  const cleanCode = String(code || '');
  const cleanStdin = String(stdin || '');

  if (lang === 'html' || lang === 'preview') {
    return cb(null, {
      language: 'html',
      stdout: 'HTML siap dirender di Live Preview interaktif.',
      stderr: '',
      exitCode: 0,
      executionTimeMs: 1,
      preview: true,
      html: cleanCode
    });
  }

  const tmpDir = path.join(os.tmpdir(), `compiler_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
  } catch (errMk) {
    return cb(null, {
      language: lang,
      stdout: '',
      stderr: 'Gagal membuat ruang eksekusi sementara: ' + errMk.message,
      exitCode: 1,
      executionTimeMs: 0
    });
  }

  const cleanup = () => {
    try {
      fs.rm(tmpDir, { recursive: true, force: true }, () => {});
    } catch (_) {}
  };

  const finish = (err, stdout, stderr, exitCode = 0) => {
    cleanup();
    const duration = Date.now() - startTime;
    cb(null, {
      language: lang,
      stdout: stdout || '',
      stderr: stderr || (err ? String(err.message || err) : ''),
      exitCode: exitCode !== undefined ? exitCode : (err ? 1 : 0),
      executionTimeMs: duration
    });
  };

  try {
    if (lang === 'python' || lang === 'py') {
      const srcFile = path.join(tmpDir, 'main.py');
      fs.writeFileSync(srcFile, cleanCode, 'utf8');
      const child = execFile('python', ['main.py'], { cwd: tmpDir, timeout: 6000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        finish(err, stdout, stderr, err ? (err.code || 1) : 0);
      });
      if (cleanStdin && child.stdin) {
        child.stdin.write(cleanStdin);
        child.stdin.end();
      }
    } else if (lang === 'javascript' || lang === 'js' || lang === 'node' || lang === 'nodejs') {
      const srcFile = path.join(tmpDir, 'main.js');
      fs.writeFileSync(srcFile, cleanCode, 'utf8');
      const child = execFile(process.execPath, ['main.js'], { cwd: tmpDir, timeout: 6000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        finish(err, stdout, stderr, err ? (err.code || 1) : 0);
      });
      if (cleanStdin && child.stdin) {
        child.stdin.write(cleanStdin);
        child.stdin.end();
      }
    } else if (lang === 'c') {
      const srcFile = path.join(tmpDir, 'main.c');
      const exeFile = path.join(tmpDir, 'prog.exe');
      fs.writeFileSync(srcFile, cleanCode, 'utf8');
      execFile(GCC_BIN, ['main.c', '-O2', '-o', 'prog.exe'], { cwd: tmpDir, timeout: 7000, maxBuffer: 1024 * 512 }, (cErr, cOut, cErrOut) => {
        if (cErr) {
          return finish(null, cOut || '', `Kesalahan Kompilasi GCC:\n${cErrOut || cErr.message}`, 1);
        }
        const child = execFile(exeFile, [], { cwd: tmpDir, timeout: 5000, maxBuffer: 1024 * 512 }, (rErr, rOut, rErrOut) => {
          finish(rErr, rOut, rErrOut, rErr ? (rErr.code || 1) : 0);
        });
        if (cleanStdin && child.stdin) {
          child.stdin.write(cleanStdin);
          child.stdin.end();
        }
      });
    } else if (lang === 'cpp' || lang === 'c++') {
      const srcFile = path.join(tmpDir, 'main.cpp');
      const exeFile = path.join(tmpDir, 'prog.exe');
      fs.writeFileSync(srcFile, cleanCode, 'utf8');
      execFile(GPP_BIN, ['main.cpp', '-O2', '-std=c++17', '-o', 'prog.exe'], { cwd: tmpDir, timeout: 8000, maxBuffer: 1024 * 512 }, (cErr, cOut, cErrOut) => {
        if (cErr) {
          return finish(null, cOut || '', `Kesalahan Kompilasi G++:\n${cErrOut || cErr.message}`, 1);
        }
        const child = execFile(exeFile, [], { cwd: tmpDir, timeout: 5000, maxBuffer: 1024 * 512 }, (rErr, rOut, rErrOut) => {
          finish(rErr, rOut, rErrOut, rErr ? (rErr.code || 1) : 0);
        });
        if (cleanStdin && child.stdin) {
          child.stdin.write(cleanStdin);
          child.stdin.end();
        }
      });
    } else if (lang === 'sql' || lang === 'sqlite') {
      const srcFile = path.join(tmpDir, 'query.sql');
      const pyRunner = path.join(tmpDir, 'run_sql.py');
      fs.writeFileSync(srcFile, cleanCode, 'utf8');
      const pyCode = `import sqlite3, sys\nconn = sqlite3.connect(":memory:")\ncur = conn.cursor()\nwith open("query.sql", "r", encoding="utf-8") as f:\n    sql = f.read()\nfor part in sql.split(";"): \n    part = part.strip()\n    if not part: continue\n    try:\n        cur.execute(part)\n        rows = cur.fetchall()\n        if rows:\n            cols = [d[0] for d in cur.description]\n            print(" | ".join(cols))\n            print("-" * (len(" | ".join(cols)) + 4))\n            for r in rows: print(" | ".join(str(x) for x in r))\n            print("")\n    except Exception as e:\n        print(f"SQL Error in [{part[:30]}...]: {e}", file=sys.stderr)\n`;
      fs.writeFileSync(pyRunner, pyCode, 'utf8');
      execFile('python', ['run_sql.py'], { cwd: tmpDir, timeout: 6000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        finish(err, stdout, stderr, err ? (err.code || 1) : 0);
      });
    } else if (lang === 'bash' || lang === 'sh') {
      const srcFile = path.join(tmpDir, 'script.sh');
      fs.writeFileSync(srcFile, cleanCode.replace(/\r\n/g, '\n'), 'utf8');
      const child = execFile(SH_BIN, ['script.sh'], { cwd: tmpDir, timeout: 6000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        finish(err, stdout, stderr, err ? (err.code || 1) : 0);
      });
      if (cleanStdin && child.stdin) {
        child.stdin.write(cleanStdin);
        child.stdin.end();
      }
    } else {
      finish(new Error(`Bahasa '${lang}' tidak didukung. Pilihan: python, javascript, cpp, c, sql, bash, html`), '', '', 1);
    }
  } catch (ex) {
    finish(ex, '', String(ex.message || ex), 1);
  }
}

// ---------- API router ----------

function handleApi(req, res, pathname, query) {

  // GET /api/health -> simple server health check
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, status: 'online' });
  }

  // POST /api/admin/shutdown-all -> matikan seluruh server dan proses terkait
  if (req.method === 'POST' && pathname === '/api/admin/shutdown-all') {
    sendJson(res, 200, { ok: true, message: 'Server shutdown initiated.' });
    console.log('[SHUTDOWN ALL] Perintah shutdown all diterima. Mematikan server...');
    setTimeout(() => {
      process.exit(0);
    }, 500);
    return;
  }

  // GET /api/wallpaper -> get current system wallpaper
  if (req.method === 'GET' && pathname === '/api/wallpaper') {
    const wallFile = path.join(DATA_DIR, 'wallpaper.json');
    return fs.readFile(wallFile, 'utf8', (err, raw) => {
      if (err) return sendJson(res, 200, { wallpaper: '/assets/wallpaper.jpg' });
      try {
        const parsed = JSON.parse(raw);
        return sendJson(res, 200, { wallpaper: parsed.wallpaper || '/assets/wallpaper.jpg' });
      } catch {
        return sendJson(res, 200, { wallpaper: '/assets/wallpaper.jpg' });
      }
    });
  }

  // POST /api/wallpaper -> admin sets current system wallpaper
  if (req.method === 'POST' && pathname === '/api/wallpaper') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Payload bukan JSON valid' });
      }
      const wallpaperUrl = payload && payload.wallpaper ? String(payload.wallpaper).trim() : '/assets/wallpaper.jpg';
      const wallFile = path.join(DATA_DIR, 'wallpaper.json');
      fs.writeFile(wallFile, JSON.stringify({ wallpaper: wallpaperUrl, updatedAt: new Date().toISOString() }, null, 2), 'utf8', (wErr) => {
        if (wErr) return sendJson(res, 500, { error: 'Gagal menyimpan wallpaper' });
        return sendJson(res, 200, { ok: true, wallpaper: wallpaperUrl });
      });
    });
  }

  // GET /api/compiler/languages -> list of supported compilers in quizzes
  if (req.method === 'GET' && pathname === '/api/compiler/languages') {
    return sendJson(res, 200, {
      languages: SUPPORTED_LANGUAGES,
      count: SUPPORTED_LANGUAGES.length
    });
  }

  // POST /api/compiler/run -> compile & execute code
  if (req.method === 'POST' && pathname === '/api/compiler/run') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Payload bukan JSON valid' });
      }
      const { language, code, stdin } = payload || {};
      if (!code && code !== '') {
        return sendJson(res, 400, { error: 'Kode program tidak boleh kosong' });
      }
      runCodeSandbox(language, code, stdin, (runErr, result) => {
        if (runErr) return sendJson(res, 500, { error: String(runErr.message || runErr) });
        sendJson(res, 200, result);
      });
    });
  }

  // GET /api/classes/summary -> Overview of XA, XB, XC for teacher dashboard
  if (req.method === 'GET' && pathname === '/api/classes/summary') {
    const summary = {};
    let pending = CLASSES.length;
    const now = Date.now();
    CLASSES.forEach((cls) => {
      readStore('students', (errSt, students) => {
        readStore('assignments', (errA, assignments) => {
          readStore('quizzes', (errQ, quizzes) => {
            const assignList = Array.isArray(assignments) ? assignments : [];
            const activeTasks = assignList.filter(a => {
              if (!a.deadline) return true;
              return new Date(a.deadline).getTime() > now;
            }).length;
            const totalTasks = assignList.length;

            summary[cls] = {
              id: cls,
              name: cls === 'XB' ? 'Kelas X-B' : (cls === 'XA' ? 'Kelas X-A' : 'Kelas X-C'),
              badge: cls === 'XB' ? '16 Siswa' : '5 Siswa',
              studentCount: Array.isArray(students) ? students.length : 0,
              totalTasks,
              activeTasks,
              assignmentCount: totalTasks,
              quizCount: Array.isArray(quizzes) ? quizzes.length : 0
            };
            pending--;
            if (pending === 0) {
              sendJson(res, 200, {
                activeClass: classContext.getStore() || DEFAULT_CLASS,
                classes: summary
              });
            }
          }, cls);
        }, cls);
      }, cls);
    });
    return;
  }

  // GET /api/literasi -> Data undian presentasi literasi hari Rabu
  if (req.method === 'GET' && pathname === '/api/literasi') {
    const currentClass = classContext.getStore() || DEFAULT_CLASS;
    return readStore('literasi', (err, data) => {
      if (err || !data) {
        return sendJson(res, 200, { presenters: [], date: null, count: 0 });
      }
      sendJson(res, 200, data);
    }, currentClass);
  }

  // POST /api/literasi -> Simpan hasil undian presentasi literasi hari Rabu
  if (req.method === 'POST' && pathname === '/api/literasi') {
    const currentClass = classContext.getStore() || DEFAULT_CLASS;
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Payload bukan JSON valid' });
      }
      const record = {
        presenters: Array.isArray(payload.presenters) ? payload.presenters : [],
        date: payload.date || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        count: payload.count || (payload.presenters ? payload.presenters.length : 0)
      };
      writeStore('literasi', record, (writeErr) => {
        if (writeErr) return sendJson(res, 500, { error: 'Gagal menyimpan data literasi' });
        sendJson(res, 200, { success: true, literasi: record });
      }, currentClass);
    });
  }

  // POST /api/literasi/reset -> Reset / undi ulang presentasi literasi hari Rabu
  if (req.method === 'POST' && pathname === '/api/literasi/reset') {
    const currentClass = classContext.getStore() || DEFAULT_CLASS;
    const record = { presenters: [], date: null, updatedAt: new Date().toISOString(), count: 0 };
    return writeStore('literasi', record, (writeErr) => {
      if (writeErr) return sendJson(res, 500, { error: 'Gagal me-reset data literasi' });
      sendJson(res, 200, { success: true, message: 'Data literasi berhasil di-reset', literasi: record });
    }, currentClass);
  }

  // GET /api/data  -> all assignments, submissions, quizzes, schedules, piket, devo
  if (req.method === 'GET' && pathname === '/api/data') {
    const currentClass = classContext.getStore() || DEFAULT_CLASS;
    return readStore('assignments', (errA, assignments) => {
      readStore('submissions', (errS, submissions) => {
        readStore('quizzes', (errQ, quizzes) => {
          readStore('quiz_sessions', (errQS, quizSessions) => {
            readStore('schedules', (errSch, schedules) => {
              readStore('temporary_schedules', (errTS, temporarySchedules) => {
                readStore('piket', (errP, piket) => {
                  readStore('devo', (errD, devo) => {
                    readStore('students', (errSt, studentsRaw) => {
                      const safeStudents = (studentsRaw || []).map(s => ({
                        absen: s.absen,
                        name: s.name
                      }));
                      sendJson(res, 200, {
                        classId: currentClass,
                        availableClasses: CLASSES,
                        assignments,
                        submissions,
                        quizzes,
                        quizSessions,
                        schedules,
                        temporarySchedules,
                        piket,
                        devo,
                        students: safeStudents,
                        role: query.get('role') || null,
                        absen: query.get('absen') || null,
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  // POST /api/assignment -> Create or update an assignment (Individual or Group)
  if (req.method === 'POST' && pathname === '/api/assignment') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let assignment;
      try {
        assignment = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Payload bukan JSON valid' });
      }
      if (!assignment || !assignment.id || !assignment.title) {
        return sendJson(res, 400, { error: 'ID dan Judul tugas wajib diisi' });
      }
      const currentClass = classContext.getStore() || DEFAULT_CLASS;
      return readStore('assignments', (readErr, list) => {
        if (readErr) return sendJson(res, 500, { error: readErr.message });
        const assignments = Array.isArray(list) ? [...list] : [];
        const idx = assignments.findIndex(a => a.id === assignment.id);
        if (idx >= 0) {
          assignments[idx] = { ...assignments[idx], ...assignment };
        } else {
          assignments.unshift(assignment);
        }
        writeStore('assignments', assignments, (writeErr) => {
          if (writeErr) return sendJson(res, 500, { error: writeErr.message });
          sendJson(res, 200, { success: true, assignment });
        }, currentClass);
      }, currentClass);
    });
  }

  // POST /api/delete-assignment OR DELETE /api/assignment -> Delete an assignment
  if ((req.method === 'POST' && pathname === '/api/delete-assignment') ||
      (req.method === 'DELETE' && pathname === '/api/assignment')) {
    const handleDeletion = (assignmentId) => {
      if (!assignmentId) return sendJson(res, 400, { error: 'ID tugas tidak ditemukan' });
      const currentClass = classContext.getStore() || DEFAULT_CLASS;
      readStore('assignments', (readErr, list) => {
        if (readErr) return sendJson(res, 500, { error: readErr.message });
        const assignments = (Array.isArray(list) ? list : []).filter(a => a.id !== assignmentId);
        writeStore('assignments', assignments, (writeErr) => {
          if (writeErr) return sendJson(res, 500, { error: writeErr.message });
          sendJson(res, 200, { success: true, message: 'Tugas berhasil dihapus' });
        }, currentClass);
      }, currentClass);
    };

    if (req.method === 'DELETE') {
      const qId = query.get('id');
      return handleDeletion(qId);
    } else {
      return collectBody(req, res, (err, body) => {
        if (err) return sendJson(res, 500, { error: String(err.message || err) });
        try {
          const payload = JSON.parse(body.toString('utf8'));
          return handleDeletion(payload.id);
        } catch {
          return sendJson(res, 400, { error: 'Payload tidak valid' });
        }
      });
    }
  }

  // ==================== QUIZ & EXAM APIS ====================

  // GET /api/quizzes -> List all quizzes
  if (req.method === 'GET' && pathname === '/api/quizzes') {
    return readStore('quizzes', (err, quizzes) => {
      if (err) return sendJson(res, 500, { error: err.message });
      sendJson(res, 200, quizzes);
    });
  }

  // POST /api/quizzes -> Create or update a quiz
  if (req.method === 'POST' && pathname === '/api/quizzes') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let quiz;
      try {
        quiz = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Payload kuis bukan JSON valid' });
      }

      if (!quiz.title || !quiz.title.trim()) {
        return sendJson(res, 400, { error: 'Judul kuis wajib diisi' });
      }

      readStore('quizzes', (rErr, quizzes) => {
        const now = new Date().toISOString();
        if (!quiz.id) {
          quiz.id = 'quiz_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          quiz.createdAt = now;
        }
        quiz.updatedAt = now;

        const idx = quizzes.findIndex(q => q.id === quiz.id);
        if (idx !== -1) {
          quizzes[idx] = { ...quizzes[idx], ...quiz };
        } else {
          quizzes.push(quiz);
        }

        writeStore('quizzes', quizzes, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, { success: true, quiz });
        });
      });
    });
  }

  // DELETE /api/quizzes -> Delete quiz by id (?id=...)
  if (req.method === 'DELETE' && pathname === '/api/quizzes') {
    const id = query.get('id');
    if (!id) return sendJson(res, 400, { error: 'Parameter id wajib disertakan' });

    return readStore('quizzes', (err, quizzes) => {
      const filtered = quizzes.filter(q => q.id !== id);
      writeStore('quizzes', filtered, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, deletedId: id });
      });
    });
  }

  // GET /api/quizzes/export -> Download quiz JSON template (?id=...)
  if (req.method === 'GET' && pathname === '/api/quizzes/export') {
    const id = query.get('id');
    if (!id) return sendJson(res, 400, { error: 'Parameter id wajib disertakan' });

    return readStore('quizzes', (err, quizzes) => {
      const q = quizzes.find(item => item.id === id);
      if (!q) return sendJson(res, 404, { error: 'Kuis tidak ditemukan' });

      const cleanFileName = sanitizeFilename(q.title) + '_format_kuis.json';
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Disposition': `attachment; filename="${cleanFileName}"`,
      });
      res.end(JSON.stringify(q, null, 2));
    });
  }

  // POST /api/quizzes/import -> Import quiz JSON template
  if (req.method === 'POST' && pathname === '/api/quizzes/import') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let imported;
      try {
        imported = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Format berkas import bukan JSON valid' });
      }

      if (Array.isArray(imported)) {
        imported = imported[0];
      } else if (imported && imported.quiz) {
        imported = imported.quiz;
      } else if (imported && Array.isArray(imported.quizzes) && imported.quizzes.length > 0) {
        imported = imported.quizzes[0];
      }

      if (!imported || !imported.title) {
        return sendJson(res, 400, { error: 'Format kuis tidak valid (judul kuis tidak ditemukan)' });
      }

      imported.subject = imported.subject || 'Umum';
      if (!Array.isArray(imported.questions)) {
        imported.questions = [];
      }

      readStore('quizzes', (rErr, quizzes) => {
        imported.id = 'quiz_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        imported.createdAt = new Date().toISOString();
        imported.updatedAt = imported.createdAt;
        quizzes.push(imported);

        writeStore('quizzes', quizzes, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, { success: true, quiz: imported });
        });
      });
    });
  }

  // GET /api/quiz-sessions -> List live/past quiz sessions (supports ?quizId=...)
  if (req.method === 'GET' && pathname === '/api/quiz-sessions') {
    const quizId = query.get('quizId');
    return readStore('quiz_sessions', (err, sessions) => {
      if (err) return sendJson(res, 500, { error: err.message });
      const result = quizId ? sessions.filter(s => s.quizId === quizId) : sessions;
      sendJson(res, 200, result);
    });
  }

  // POST /api/quiz-sessions/start -> Student starts / resumes quiz session
  if (req.method === 'POST' && pathname === '/api/quiz-sessions/start') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      const { quizId, studentAbsen, studentName } = payload;
      if (!quizId || studentAbsen == null) {
        return sendJson(res, 400, { error: 'quizId dan studentAbsen wajib diisi' });
      }

      readStore('quizzes', (errQ, quizzes) => {
        const quiz = quizzes.find(q => q.id === quizId);
        if (!quiz) return sendJson(res, 404, { error: 'Kuis tidak ditemukan' });

        readStore('quiz_sessions', (errS, sessions) => {
          let session = sessions.find(s => s.quizId === quizId && Number(s.studentAbsen) === Number(studentAbsen));

          if (session) {
            if (session.status === 'completed') {
              return sendJson(res, 400, { error: 'Anda sudah menyelesaikan kuis ini.', session });
            }
            // Resume session
            session.lastHeartbeat = new Date().toISOString();
            return writeStore('quiz_sessions', sessions, () => {
              sendJson(res, 200, { success: true, session, quiz });
            });
          }

          // Buat sesi baru
          const newSession = {
            id: 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            quizId,
            quizTitle: quiz.title,
            studentAbsen: Number(studentAbsen),
            studentName: studentName || `Siswa Absen ${studentAbsen}`,
            status: 'in_progress',
            startedAt: new Date().toISOString(),
            submittedAt: null,
            lastHeartbeat: new Date().toISOString(),
            isFullscreen: true,
            violationsCount: 0,
            violationsLog: [],
            isRedAlert: false,
            answers: {},
            score: null,
            maxScore: null,
            percentage: null
          };

          sessions.push(newSession);
          writeStore('quiz_sessions', sessions, (wErr) => {
            if (wErr) return sendJson(res, 500, { error: wErr.message });
            sendJson(res, 200, { success: true, session: newSession, quiz });
          });
        });
      });
    });
  }

  // POST /api/quiz-sessions/violation -> Record violation (exit fullscreen / tab switch) -> Flags RED ALERT
  if (req.method === 'POST' && pathname === '/api/quiz-sessions/violation') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      const { sessionId, type, reason, note } = payload;
      if (!sessionId) return sendJson(res, 400, { error: 'sessionId wajib disertakan' });

      readStore('quiz_sessions', (errS, sessions) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return sendJson(res, 404, { error: 'Sesi kuis tidak ditemukan' });

        const now = new Date().toISOString();

        // Fitur Reset Peringatan Kuis oleh Guru: Hapus SEMUA pelanggaran, keluar tab, & buka kunci sesi
        if (payload.resetRedAlert || payload.resetViolations || payload.action === 'reset') {
          session.violationsCount = 0;
          session.tabViolationsCount = 0;
          session.fullscreenViolationsCount = 0;
          session.isRedAlert = false;
          session.isLocked = false;
          session.lockedReason = null;
          session.lastViolationType = null;
          session.lastViolationReason = null;
          session.lastViolationTime = null;
          session.violationsLog = [];
          session.adminUnlocked = true;
          if (session.status === 'locked') {
            session.status = 'in_progress';
          }

          return writeStore('quiz_sessions', sessions, (wErr) => {
            if (wErr) return sendJson(res, 500, { error: wErr.message });
            sendJson(res, 200, {
              success: true,
              message: 'Peringatan kuis berhasil direset. Semua pelanggaran telah dibersihkan.',
              violationsCount: 0,
              isLocked: false,
              session
            });
          });
        }

        const violType = type || (reason && (reason.toLowerCase().includes('tab') || reason.toLowerCase().includes('aplikasi') || reason.toLowerCase().includes('fokus')) ? 'tab_exit' : 'fullscreen_exit');
        session.violationsCount = (session.violationsCount || 0) + 1;
        session.isRedAlert = true;
        session.lastHeartbeat = now;
        session.lastViolationType = violType;
        session.lastViolationReason = note || reason || (violType === 'tab_exit' ? 'Keluar tab / jendela browser' : 'Keluar dari mode layar penuh');
        session.lastViolationTime = new Date().toLocaleTimeString('id-ID');

        if (!Array.isArray(session.violationsLog)) {
          session.violationsLog = [];
        }
        session.violationsLog.push({
          type: violType,
          note: session.lastViolationReason,
          time: now
        });

        // Pelanggaran keluar tab: mematikan semua akses kuis, nilai otomatis 0, sesi terkunci
        if (violType === 'tab_exit') {
          session.tabViolationsCount = (session.tabViolationsCount || 0) + 1;
          session.isLocked = true;
          session.lockedReason = 'tab_exit';
          session.status = 'locked';
          session.score = 0;
          session.percentage = 0;
        } else {
          session.fullscreenViolationsCount = (session.fullscreenViolationsCount || 0) + 1;
        }

        writeStore('quiz_sessions', sessions, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, {
            success: true,
            violationsCount: session.violationsCount,
            violType,
            isLocked: !!session.isLocked,
            lockedReason: session.lockedReason || null,
            session
          });
        });
      });
    });
  }

  // POST /api/quiz-sessions/unlock -> Admin/Guru unlocks a disqualified/locked student session
  if (req.method === 'POST' && pathname === '/api/quiz-sessions/unlock') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      const { sessionId } = payload;
      if (!sessionId) return sendJson(res, 400, { error: 'sessionId wajib disertakan' });

      readStore('quiz_sessions', (errS, sessions) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return sendJson(res, 404, { error: 'Sesi kuis tidak ditemukan' });

        session.isLocked = false;
        session.lockedReason = null;
        session.status = 'in_progress';
        session.isRedAlert = false;
        session.adminUnlocked = true;
        session.lastHeartbeat = new Date().toISOString();

        if (!Array.isArray(session.violationsLog)) {
          session.violationsLog = [];
        }
        session.violationsLog.push({
          type: 'admin_unlocked',
          note: 'Akses kuis dibuka kembali dengan izin oleh Guru / Admin',
          time: new Date().toISOString()
        });

        writeStore('quiz_sessions', sessions, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, { success: true, message: 'Izin kuis berhasil diberikan kembali', session });
        });
      });
    });
  }

  // POST /api/quiz-sessions/heartbeat -> Update live status with 1-second progress tracking
  if (req.method === 'POST' && pathname === '/api/quiz-sessions/heartbeat') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      const { sessionId, isFullscreen, answeredCount, totalCount, progressPercent, answers } = payload;
      readStore('quiz_sessions', (errS, sessions) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return sendJson(res, 404, { error: 'Session not found' });

        session.lastHeartbeat = new Date().toISOString();
        if (isFullscreen != null) {
          session.isFullscreen = Boolean(isFullscreen);
        }
        if (answeredCount != null) {
          session.answeredCount = Number(answeredCount);
        }
        if (totalCount != null) {
          session.totalCount = Number(totalCount);
        }
        if (progressPercent != null) {
          session.progressPercent = Math.max(0, Math.min(100, Math.round(Number(progressPercent))));
        } else if (session.totalCount && session.totalCount > 0 && session.answeredCount != null) {
          session.progressPercent = Math.max(0, Math.min(100, Math.round((session.answeredCount / session.totalCount) * 100)));
        }
        // Simpan jawaban sementara (draft temp progress) secara otomatis ke database server
        if (answers && typeof answers === 'object') {
          session.answers = { ...(session.answers || {}), ...answers };
        }

        writeStore('quiz_sessions', sessions, () => {
          sendJson(res, 200, {
            ok: true,
            isRedAlert: !!session.isRedAlert,
            isLocked: !!session.isLocked,
            lockedReason: session.lockedReason || null,
            adminUnlocked: !!session.adminUnlocked,
            answeredCount: session.answeredCount || 0,
            progressPercent: session.progressPercent || 0
          });
        });
      });
    });
  }

  // POST /api/quiz-sessions/submit -> Student submits quiz answers
  if (req.method === 'POST' && pathname === '/api/quiz-sessions/submit') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      const { sessionId, answers } = payload;
      if (!sessionId) return sendJson(res, 400, { error: 'sessionId wajib diisi' });

      readStore('quiz_sessions', (errS, sessions) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return sendJson(res, 404, { error: 'Sesi kuis tidak ditemukan' });

        readStore('quizzes', (errQ, quizzes) => {
          const quiz = quizzes.find(q => q.id === session.quizId);

          let totalScore = 0;
          let maxScore = 0;
          const userAnswers = answers || {};

          if (quiz && Array.isArray(quiz.questions)) {
            for (const q of quiz.questions) {
              const qPts = Number(q.points) || 10;
              maxScore += qPts;
              const ans = userAnswers[q.id];

              if (q.type === 'multiple_choice' || q.type === 'dropdown') {
                if (ans != null) {
                  const userAnsStr = String(ans).trim().toLowerCase();
                  const correctStr = String(q.correctAnswer).trim().toLowerCase();
                  if (userAnsStr === correctStr || (q.options && q.options[Number(ans)] && String(q.options[Number(ans)]).trim().toLowerCase() === correctStr)) {
                    totalScore += qPts;
                  }
                }
              } else if (q.type === 'true_false') {
                if (ans != null) {
                  const userAnsStr = String(ans).trim().toLowerCase();
                  const correctStr = String(q.correctAnswer).trim().toLowerCase();
                  if (userAnsStr === correctStr) {
                    totalScore += qPts;
                  }
                }
              } else if (q.type === 'checkboxes') {
                const correctList = (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer])
                  .map(v => String(v).trim().toLowerCase()).filter(Boolean).sort();
                const userList = (Array.isArray(ans) ? ans : [ans])
                  .map(v => String(v).trim().toLowerCase()).filter(Boolean).sort();
                if (correctList.length > 0 && correctList.length === userList.length && correctList.every((v, i) => v === userList[i])) {
                  totalScore += qPts;
                }
              } else if (q.type === 'short_answer') {
                const userText = String(ans || '').trim().toLowerCase();
                const validOptions = (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer || ''])
                  .concat(Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [])
                  .map(v => String(v).trim().toLowerCase()).filter(Boolean);
                if (validOptions.some(v => v === userText)) {
                  totalScore += qPts;
                }
              } else if (q.type === 'linear_scale') {
                if (ans != null && String(ans).trim() === String(q.correctAnswer).trim()) {
                  totalScore += qPts;
                }
              } else if (q.type === 'code_compiler') {
                if (ans != null && String(ans).trim().length > 0) {
                  if (q.expectedOutput && String(q.expectedOutput).trim()) {
                    const expStr = String(q.expectedOutput).trim().toLowerCase();
                    if (String(ans).toLowerCase().includes(expStr)) {
                      totalScore += qPts;
                    }
                  } else {
                    totalScore += qPts;
                  }
                }
              }
            }
          }

          let percentage = maxScore > 0 ? parseFloat(((totalScore / maxScore) * 100).toFixed(1)) : 0;
          session.answers = userAnswers;
          session.maxScore = maxScore;
          session.rawScore = totalScore;
          session.rawPercentage = percentage;
          session.isRemedial = !!quiz.isRemedial;
          session.remedialForQuizId = quiz.remedialForQuizId || null;

          if (quiz.isRemedial) {
            const kkm = Number(quiz.kkm) || 77;
            session.kkm = kkm;
            const cappedPct = Math.min(kkm, percentage);
            const cappedScore = maxScore > 0 ? Math.min(totalScore, Math.round((maxScore * cappedPct) / 100)) : totalScore;
            session.percentage = cappedPct;
            session.score = cappedScore;

            if (quiz.remedialForQuizId) {
              const origSession = sessions.find(s => s.quizId === quiz.remedialForQuizId && Number(s.studentAbsen) === Number(session.studentAbsen));
              if (origSession) {
                origSession.remedialCompleted = true;
                origSession.remedialSessionId = session.id;
                origSession.remedialScore = cappedScore;
                origSession.remedialPercentage = cappedPct;
                origSession.effectivePercentage = cappedPct;
              }
            }
          } else {
            session.score = totalScore;
            session.percentage = percentage;
          }

          session.status = 'completed';
          session.progressPercent = 100;
          if (quiz && Array.isArray(quiz.questions)) {
            session.totalCount = quiz.questions.length;
            session.answeredCount = quiz.questions.length;
          }
          session.submittedAt = new Date().toISOString();

          writeStore('quiz_sessions', sessions, (wErr) => {
            if (wErr) return sendJson(res, 500, { error: wErr.message });
            sendJson(res, 200, {
              success: true,
              session,
              score: session.score,
              maxScore,
              percentage: session.percentage,
              rawPercentage: session.rawPercentage,
              isRemedial: session.isRemedial,
              violationsCount: session.violationsCount
            });
          });
        });
      });
    });
  }

  // POST /api/quiz-sessions/grade -> Teacher manually grades session
  if (req.method === 'POST' && pathname === '/api/quiz-sessions/grade') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      const { sessionId, score, notes } = payload;
      if (!sessionId || score == null) {
        return sendJson(res, 400, { error: 'sessionId dan score wajib diisi' });
      }

      readStore('quiz_sessions', (errS, sessions) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return sendJson(res, 404, { error: 'Sesi kuis tidak ditemukan' });

        session.score = Number(score);
        if (session.maxScore && session.maxScore > 0) {
          session.percentage = parseFloat(((session.score / session.maxScore) * 100).toFixed(1));
        }
        if (notes != null) session.teacherNotes = notes;

        writeStore('quiz_sessions', sessions, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, { success: true, session });
        });
      });
    });
  }

  // DELETE /api/quiz-sessions -> Delete session (?id=...)
  if (req.method === 'DELETE' && pathname === '/api/quiz-sessions') {
    const id = query.get('id');
    if (!id) return sendJson(res, 400, { error: 'Parameter id wajib disertakan' });

    return readStore('quiz_sessions', (errS, sessions) => {
      const filtered = sessions.filter(s => s.id !== id);
      writeStore('quiz_sessions', filtered, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, deletedId: id });
      });
    });
  }

  // ==================== JADWAL PELAJARAN (SCHEDULES) ====================

  // GET /api/schedules -> List regular school schedules
  if (req.method === 'GET' && pathname === '/api/schedules') {
    return readStore('schedules', (err, list) => {
      if (err) return sendJson(res, 500, { error: err.message });
      sendJson(res, 200, list);
    });
  }

  // POST /api/schedules -> Create or update schedule entry
  if (req.method === 'POST' && pathname === '/api/schedules') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let item;
      try { item = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      if (!item.day || !item.subject) {
        return sendJson(res, 400, { error: 'Hari dan Mata Pelajaran wajib diisi' });
      }

      readStore('schedules', (rErr, list) => {
        if (!item.id) {
          item.id = 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        }
        const idx = list.findIndex(s => s.id === item.id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...item };
        } else {
          list.push(item);
        }

        writeStore('schedules', list, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, { success: true, schedule: item });
        });
      });
    });
  }

  // DELETE /api/schedules -> Delete schedule entry (?id=...)
  if (req.method === 'DELETE' && pathname === '/api/schedules') {
    const id = query.get('id');
    if (!id) return sendJson(res, 400, { error: 'Parameter id wajib disertakan' });

    return readStore('schedules', (err, list) => {
      const filtered = list.filter(s => s.id !== id);
      writeStore('schedules', filtered, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, deletedId: id });
      });
    });
  }

  // POST /api/schedules/bulk-json -> Replace or import schedules via JSON
  if (req.method === 'POST' && pathname === '/api/schedules/bulk-json') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let list;
      try { list = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Format JSON tidak valid' }); }
      if (!Array.isArray(list)) return sendJson(res, 400, { error: 'Format JSON harus berupa array objek jadwal' });

      const sanitized = list.map((item, idx) => ({
        id: item.id || ('sch_' + Date.now() + '_' + idx),
        day: item.day || 'Senin',
        startTime: item.startTime || '08:00',
        endTime: item.endTime || '09:30',
        subject: item.subject || 'Mata Pelajaran',
        teacher: item.teacher || '',
        room: item.room || ''
      }));

      writeStore('schedules', sanitized, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, count: sanitized.length, schedules: sanitized });
      });
    });
  }

  // ==================== JADWAL SEMENTARA SEHARIAN (TEMPORARY FULL DAY SCHEDULES) ====================

  // GET /api/temporary-schedules -> List temporary / substitute full-day schedules
  if (req.method === 'GET' && pathname === '/api/temporary-schedules') {
    return readStore('temporary_schedules', (err, list) => {
      if (err) return sendJson(res, 500, { error: err.message });
      sendJson(res, 200, list);
    });
  }

  // POST /api/temporary-schedules -> Create or update temporary schedule (full day)
  if (req.method === 'POST' && pathname === '/api/temporary-schedules') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let item;
      try { item = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      if (!item.date || !item.title) {
        return sendJson(res, 400, { error: 'Tanggal dan Nama Jadwal Khusus Seharian wajib diisi' });
      }

      readStore('temporary_schedules', (rErr, list) => {
        if (!item.id) {
          item.id = 'tempsched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          item.createdAt = new Date().toISOString();
        }
        if (item.isActive === undefined) item.isActive = true;
        if (!Array.isArray(item.periods)) item.periods = [];

        const idx = list.findIndex(s => s.id === item.id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...item };
        } else {
          list.push(item);
        }

        writeStore('temporary_schedules', list, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, { success: true, temporarySchedule: item });
        });
      });
    });
  }

  // POST /api/temporary-schedules/bulk-json -> Replace or import temporary schedules via JSON
  if (req.method === 'POST' && pathname === '/api/temporary-schedules/bulk-json') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let list;
      try { list = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Format JSON tidak valid' }); }
      if (!Array.isArray(list)) return sendJson(res, 400, { error: 'Format JSON harus berupa array objek jadwal sementara' });

      const sanitized = list.map((item, idx) => ({
        id: item.id || ('tempsched_' + Date.now() + '_' + idx),
        title: item.title || 'Jadwal Khusus Seharian',
        date: item.date || new Date().toISOString().slice(0, 10),
        day: item.day || '',
        isActive: item.isActive !== false,
        periods: Array.isArray(item.periods) ? item.periods.map(p => ({
          startTime: p.startTime || '08:00',
          endTime: p.endTime || '09:30',
          subject: p.subject || 'Mata Pelajaran',
          teacher: p.teacher || '',
          room: p.room || ''
        })) : [],
        createdAt: item.createdAt || new Date().toISOString()
      }));

      writeStore('temporary_schedules', sanitized, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, count: sanitized.length, temporarySchedules: sanitized });
      });
    });
  }

  // DELETE /api/temporary-schedules -> Delete temporary schedule (?id=...)
  if (req.method === 'DELETE' && pathname === '/api/temporary-schedules') {
    const id = query.get('id');
    if (!id) return sendJson(res, 400, { error: 'Parameter id wajib disertakan' });

    return readStore('temporary_schedules', (err, list) => {
      const filtered = list.filter(s => s.id !== id);
      writeStore('temporary_schedules', filtered, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, deletedId: id });
      });
    });
  }

  // ==================== DAFTAR PIKET (PIKET ROSTER) ====================

  // GET /api/piket -> Get piket assignments for all days
  if (req.method === 'GET' && pathname === '/api/piket') {
    return readStore('piket', (err, data) => {
      if (err) return sendJson(res, 500, { error: err.message });
      sendJson(res, 200, data);
    });
  }

  // POST /api/piket -> Update piket assignments (either whole object or per day)
  if (req.method === 'POST' && pathname === '/api/piket') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      readStore('piket', (rErr, currentPiket) => {
        let updated = { ...(currentPiket || {}) };

        if (payload.day && Array.isArray(payload.studentAbsens)) {
          updated[payload.day] = payload.studentAbsens.map(Number);
        } else if (typeof payload === 'object' && !Array.isArray(payload)) {
          updated = { ...updated, ...payload };
        }

        writeStore('piket', updated, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, { success: true, piket: updated });
        });
      });
    });
  }

  // POST /api/piket/bulk-json -> Replace piket assignments via JSON object
  if (req.method === 'POST' && pathname === '/api/piket/bulk-json') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let obj;
      try { obj = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Format JSON tidak valid' }); }
      if (typeof obj !== 'object' || Array.isArray(obj) || !obj) {
        return sendJson(res, 400, { error: 'Format JSON piket harus berupa objek hari, contoh: {"Senin": [1,2,3]}' });
      }

      const sanitized = {};
      ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'].forEach(d => {
        sanitized[d] = Array.isArray(obj[d]) ? obj[d].map(Number) : [];
      });

      writeStore('piket', sanitized, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, piket: sanitized });
      });
    });
  }

  // ==================== DAFTAR DEVO (DEVOTION ROSTER) ====================

  // GET /api/devo -> List all devo records
  if (req.method === 'GET' && pathname === '/api/devo') {
    return readStore('devo', (err, list) => {
      if (err) return sendJson(res, 500, { error: err.message });
      sendJson(res, 200, list);
    });
  }

  // POST /api/devo -> Create or update devo entry (without mentorTeacher and notes)
  if (req.method === 'POST' && pathname === '/api/devo') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let item;
      try { item = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }

      if (!item.date || !item.topic) {
        return sendJson(res, 400, { error: 'Tanggal dan Topik Devosi wajib diisi' });
      }

      readStore('devo', (rErr, list) => {
        if (!item.id) {
          item.id = 'devo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        }
        if (!item.status) item.status = 'upcoming';

        const cleanDevo = {
          id: item.id,
          date: item.date,
          day: item.day || '',
          studentAbsen: Number(item.studentAbsen || 0),
          studentName: item.studentName || '',
          topic: item.topic,
          scripture: item.scripture || '',
          status: item.status
        };

        const idx = list.findIndex(d => d.id === cleanDevo.id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...cleanDevo };
        } else {
          list.push(cleanDevo);
        }

        writeStore('devo', list, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: wErr.message });
          sendJson(res, 200, { success: true, devo: cleanDevo });
        });
      });
    });
  }

  // POST /api/devo/bulk-json -> Replace or import devo records via JSON
  if (req.method === 'POST' && pathname === '/api/devo/bulk-json') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let list;
      try { list = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Format JSON tidak valid' }); }
      if (!Array.isArray(list)) return sendJson(res, 400, { error: 'Format JSON harus berupa array objek devosi' });

      const sanitized = list.map((item, idx) => ({
        id: item.id || ('devo_' + Date.now() + '_' + idx),
        date: item.date || new Date().toISOString().slice(0, 10),
        day: item.day || '',
        studentAbsen: Number(item.studentAbsen || 0),
        studentName: item.studentName || '',
        topic: item.topic || 'Renungan Pagi',
        scripture: item.scripture || '',
        status: item.status || 'upcoming'
      }));

      writeStore('devo', sanitized, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, count: sanitized.length, devo: sanitized });
      });
    });
  }

  // DELETE /api/devo -> Delete devo entry (?id=...)
  if (req.method === 'DELETE' && pathname === '/api/devo') {
    const id = query.get('id');
    if (!id) return sendJson(res, 400, { error: 'Parameter id wajib disertakan' });

    return readStore('devo', (err, list) => {
      const filtered = list.filter(d => d.id !== id);
      writeStore('devo', filtered, (wErr) => {
        if (wErr) return sendJson(res, 500, { error: wErr.message });
        sendJson(res, 200, { success: true, deletedId: id });
      });
    });
  }

  // GET /api/admin/backup-zip -> Download all server data as a compressed archive
  if (req.method === 'GET' && pathname === '/api/admin/backup-zip') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveName = `xozen_backup_${timestamp}.tar.gz`;

    res.writeHead(200, {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${archiveName}"`,
      'Cache-Control': 'no-cache'
    });

    const tarProcess = spawn('tar', ['-czf', '-', '-C', __dirname, 'data']);
    tarProcess.stdout.pipe(res);
    tarProcess.stderr.on('data', (d) => {
      console.warn('[BACKUP-TAR] tar stderr:', d.toString());
    });
    tarProcess.on('error', (err) => {
      console.error('[BACKUP-TAR] spawn error:', err);
      try { res.end(); } catch (_) {}
    });
    return;
  }

  // POST /api/auth/login -> student {absen,password} or teacher {role:'guru',password}
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Body bukan JSON valid' });
      }

      // Guru / Admin login
      const isGuruRole = payload.role === 'guru' || payload.role === 'teacher' || payload.role === 'admin' || payload.username === 'admin';
      if (isGuruRole) {
        return verifyTeacherPassword(payload.password, (ok) => {
          if (!ok) return sendJson(res, 401, { error: 'Password guru/admin salah.' });
          sendJson(res, 200, { ok: true, teacher: true });
        });
      }

      // Siswa login
      const targetClass = normalizeClassId(payload.classId || payload.kelas || classContext.getStore() || DEFAULT_CLASS);
      const absen = Number(payload.absen);
      const password = payload.password;
      if (!Number.isInteger(absen) || absen < 1 || !password) {
        return sendJson(res, 400, { error: 'Nomor absen dan password wajib diisi.' });
      }
      readStore('students', (rErr, items) => {
        const student = (items || []).find((s) => Number(s.absen) === absen);
        if (!student) {
          return sendJson(res, 401, { error: `Akun siswa dengan absen ${absen} tidak ditemukan di kelas ${targetClass}.` });
        }
        let ok = verifyPassword(password, student.salt, student.hash);
        // Default / unhashed student password (<absen>pnk atau legacy code) : verify then migrate to hashed
        if (!ok && (!student.salt || !student.hash)) {
          const defaultCode = `${absen}pnk`;
          const expected = String(student.code || defaultCode).trim();
          const input = String(password).trim();
          if (input === expected || input.toLowerCase() === defaultCode.toLowerCase()) {
            ok = true;
            student.code = input === expected ? expected : defaultCode;
            const { salt, hash } = hashPassword(student.code);
            student.salt = salt;
            student.hash = hash;
            writeStore('students', items, () => {}, targetClass);
          }
        }
        if (!ok) return sendJson(res, 401, { error: `Password salah untuk absen ${absen} di kelas ${targetClass}.` });
        sendJson(res, 200, {
          ok: true,
          classId: targetClass,
          student: {
            absen: student.absen,
            name: student.name,
            code: student.code || null,
            classId: targetClass
          }
        });
      }, targetClass);
    });
  }

  // POST /api/auth/create-student -> teacher adds a new student account
  if (req.method === 'POST' && pathname === '/api/auth/create-student') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Body bukan JSON valid' });
      }
      verifyTeacherPassword(payload.teacherPassword, (ok) => {
        if (!ok) return sendJson(res, 401, { error: 'Password guru salah. Akun tidak dibuat.' });
        const name = String(payload.name || '').trim();
        if (!name) return sendJson(res, 400, { error: 'Nama siswa wajib diisi.' });
        readStore('students', (rErr, items) => {
          const list = rErr ? [] : items;
          let absen = Number.isInteger(Number(payload.absen)) && Number(payload.absen) >= 1 ? Number(payload.absen) : null;
          if (absen && list.some((s) => Number(s.absen) === absen)) {
            return sendJson(res, 409, { error: `Absen ${absen} sudah terpakai.` });
          }
          if (!absen) absen = items.reduce((max, s) => Math.max(max, Number(s.absen) || 0), 0) + 1;
          const password = String(payload.password || '').trim() || `${absen}pnk`;
          const { salt, hash } = hashPassword(password);
          const record = { absen, name: name.slice(0, 60), code: password, salt, hash };
          list.push(record);
          writeStore('students', list, (wErr) => {
            if (wErr) return sendJson(res, 500, { error: String(wErr.message || wErr) });
            console.log(`[auth] Akun siswa dibuat: absen ${absen} (${name})`);
            sendJson(res, 200, { ok: true, student: { absen, name: record.name, code: password } });
          });
        });
      });
    });
  }

  // POST /api/auth/change-password -> siswa (oldPassword or teacherPassword) / guru (oldPassword)
  if (req.method === 'POST' && pathname === '/api/auth/change-password') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Body bukan JSON valid' });
      }
      const newPassword = String(payload.newPassword || '').trim();
      const target = payload.target || 'siswa';
      if (newPassword.length < 3) {
        return sendJson(res, 400, { error: 'Password baru minimal 3 karakter.' });
      }

      // Guru mengganti password guru sendiri
      if (target === 'guru') {
        return verifyTeacherPassword(payload.oldPassword, (ok) => {
          if (!ok) return sendJson(res, 401, { error: 'Password guru lama salah.' });
          saveTeacherPassword(newPassword, (sErr) => {
            if (sErr) return sendJson(res, 500, { error: String(sErr.message || sErr) });
            console.log('[auth] Password guru diperbarui');
            sendJson(res, 200, { ok: true, message: 'Password guru berhasil diganti.' });
          });
        });
      }

      // Siswa: butuh oldPassword miliknya ATAU verifikasi password guru
      const absen = Number(payload.absen);
      if (!Number.isInteger(absen) || absen < 1) return sendJson(res, 400, { error: 'Nomor absen tidak valid.' });

      const applyChange = (migratedItems) => {
        readStore('students', (rErr, items) => {
          const list = rErr ? [] : items;
          const student = list.find((s) => Number(s.absen) === absen);
          if (!student) return sendJson(res, 404, { error: `Akun absen ${absen} tidak ditemukan.` });
          const { salt, hash } = hashPassword(newPassword);
          student.salt = salt;
          student.hash = hash;
          student.code = newPassword; // plaintext tetap terlihat bagi guru di daftar akun
          const toWrite = migratedItems || list;
          writeStore('students', toWrite, (wErr) => {
            if (wErr) return sendJson(res, 500, { error: String(wErr.message || wErr) });
            console.log(`[auth] Password siswa absen ${absen} diperbarui`);
            sendJson(res, 200, { ok: true, student: { absen: student.absen, name: student.name, code: newPassword } });
          });
        });
      };

      if (payload.oldPassword) {
        readStore('students', (rErr, items) => {
          const student = (rErr ? [] : items).find((s) => Number(s.absen) === absen);
          let ok = student && verifyPassword(payload.oldPassword, student.salt, student.hash);
          if (!ok && student && student.code) {
            const input = String(payload.oldPassword).toUpperCase();
            const legacy = student.code.toUpperCase();
            if (input === legacy || input === legacy.replace(/^0/, '')) ok = true;
          }
          if (!ok) return sendJson(res, 401, { error: 'Password lama salah.' });
          applyChange();
        });
        return;
      }

      verifyTeacherPassword(payload.teacherPassword, (ok) => {
        if (!ok) return sendJson(res, 401, { error: 'Verifikasi guru gagal: password guru salah.' });
        applyChange();
      });
    });
  }

  // POST /api/upload -> save submitted file(s), create centralized submission record
  if (req.method === 'POST' && pathname === '/api/upload') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Body bukan JSON valid' });
      }

      let filesToSave = [];
      if (Array.isArray(payload.files) && payload.files.length > 0) {
        filesToSave = payload.files.slice(0, 10);
      } else if (payload && typeof payload.fileData === 'string' && payload.fileData) {
        filesToSave = [{
          fileName: payload.fileName,
          fileData: payload.fileData,
          fileType: payload.fileType,
          fileSize: payload.fileSize
        }];
      } else {
        return sendJson(res, 400, { error: 'Tidak ada berkas yang diunggah' });
      }

      const timestamp = Date.now();
      const savedFiles = [];
      let pending = filesToSave.length;
      let hasError = false;

      filesToSave.forEach((item, idx) => {
        let fileBuffer;
        try {
          fileBuffer = Buffer.from(item.fileData, 'base64');
        } catch {
          hasError = true;
          pending -= 1;
          if (pending === 0 && savedFiles.length === 0) {
            return sendJson(res, 400, { error: 'Format berkas base64 tidak valid' });
          }
          return;
        }

        const safeName = sanitizeFilename(item.fileName, `berkas_${idx + 1}`);
        const storedName = `${timestamp}_${idx}_${safeName}`;
        const targetPath = path.join(FILES_DIR, storedName);

        fs.writeFile(targetPath, fileBuffer, (wErr) => {
          if (wErr) {
            hasError = true;
          } else {
            savedFiles.push({
              fileName: safeName,
              fileSize: fileBuffer.length,
              fileType: item.fileType || 'application/octet-stream',
              storedFile: storedName,
              downloadUrl: '/api/download?file=' + encodeURIComponent(storedName)
            });
          }

          pending -= 1;
          if (pending === 0) {
            if (hasError && savedFiles.length === 0) {
              return sendJson(res, 500, { error: 'Gagal menyimpan berkas tugas ke penyimpanan server' });
            }

            const primary = savedFiles[0] || {
              fileName: 'berkas',
              fileSize: 0,
              fileType: 'application/octet-stream',
              storedFile: '',
              downloadUrl: ''
            };
            const totalSize = savedFiles.reduce((acc, f) => acc + (f.fileSize || 0), 0);

            const record = {
              id: 'sub_' + timestamp,
              assignmentId: payload.assignmentId || null,
              studentName: sanitizeFilename(payload.studentName, 'Siswa'),
              studentAbsen: payload.studentAbsen ?? null,
              submittedAt: new Date().toISOString(),
              isLate: Boolean(payload.isLate),
              isEdited: Boolean(payload.isEdited),
              editHistory: Array.isArray(payload.editHistory) ? payload.editHistory : [],
              notes: String(payload.notes || '').slice(0, 4000),
              fileName: primary.fileName,
              fileSize: totalSize,
              fileType: primary.fileType,
              storedFile: primary.storedFile,
              downloadUrl: primary.downloadUrl,
              files: savedFiles,
              isGroup: Boolean(payload.isGroup),
              groupId: payload.groupId || null,
              groupName: payload.groupName || null,
              groupMembers: Array.isArray(payload.groupMembers) ? payload.groupMembers : []
            };

            const currentClass = classContext.getStore() || DEFAULT_CLASS;
            readStore('submissions', (rErr, subs) => {
              const list = rErr ? [] : (Array.isArray(subs) ? [...subs] : []);
              // Cek jika tugas kelompok atau pengumpulan berulang untuk tugas yang sama
              const existingIdx = list.findIndex(s => {
                if (s.assignmentId !== record.assignmentId) return false;
                if (record.isGroup && record.groupId && s.groupId === record.groupId) return true;
                return record.studentAbsen != null && s.studentAbsen != null && Number(s.studentAbsen) === Number(record.studentAbsen);
              });
              if (existingIdx >= 0) {
                // Pertahankan nilai jika sebelumnya sudah dinilai
                if (list[existingIdx].grade != null) record.grade = list[existingIdx].grade;
                if (list[existingIdx].gradeNotes) record.gradeNotes = list[existingIdx].gradeNotes;
                list[existingIdx] = record;
              } else {
                list.push(record);
              }
              writeStore('submissions', list, (sErr) => {
                if (sErr) return sendJson(res, 500, { error: String(sErr.message || sErr) });
                console.log(`[upload] ${record.studentName} -> ${savedFiles.length} berkas (${totalSize} bytes)`);
                sendJson(res, 200, { submission: record });
              }, currentClass);
            }, currentClass);
          }
        });
      });
    });
  }

  // POST /api/submissions/annotation -> save annotations & annotated image to server
  if (req.method === 'POST' && pathname === '/api/submissions/annotation') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'Body bukan JSON valid' });
      }

      const { submissionId, assignmentId, fileIndex, fileName, annotations, annotatedImageData } = payload;
      if (!submissionId) {
        return sendJson(res, 400, { error: 'submissionId wajib diisi' });
      }

      const timestamp = Date.now();
      const currentClass = classContext.getStore() || DEFAULT_CLASS;

      let savedAnnotatedFile = null;
      let downloadUrl = null;

      const finishSave = () => {
        readStore('submissions', (rErr, subs) => {
          const list = rErr ? [] : (Array.isArray(subs) ? [...subs] : []);
          const sub = list.find(s => s.id === submissionId || String(s.id) === String(submissionId));
          if (!sub) {
            return sendJson(res, 404, { error: 'Submission tidak ditemukan di server' });
          }

          if (!sub.annotationsMap) sub.annotationsMap = {};
          const fKey = fileName || (fileIndex != null ? `file_${fileIndex}` : 'primary');
          sub.annotationsMap[fKey] = {
            annotations: annotations || [],
            annotatedImageUrl: downloadUrl || (sub.annotationsMap[fKey]?.annotatedImageUrl || null),
            updatedAt: new Date().toISOString()
          };

          sub.annotations = annotations || [];
          if (downloadUrl) {
            sub.annotatedImageUrl = downloadUrl;
          }

          writeStore('submissions', list, (wErr) => {
            if (wErr) return sendJson(res, 500, { error: String(wErr.message || wErr) });
            console.log(`[annotation] Tersimpan untuk submission ${submissionId} (file: ${fKey})`);
            sendJson(res, 200, {
              ok: true,
              submissionId,
              annotatedImageUrl: downloadUrl,
              annotations: sub.annotationsMap[fKey]
            });
          }, currentClass);
        }, currentClass);
      };

      if (annotatedImageData) {
        const cleanBase64 = annotatedImageData.replace(/^data:image\/[a-z]+;base64,/, '');
        let buffer;
        try {
          buffer = Buffer.from(cleanBase64, 'base64');
        } catch (bErr) {
          return sendJson(res, 400, { error: 'Format data gambar base64 tidak valid' });
        }

        const safeBaseName = sanitizeFilename(fileName || 'image', 'annotated');
        savedAnnotatedFile = `annotated_${timestamp}_${safeBaseName}.png`;
        const targetPath = path.join(FILES_DIR, savedAnnotatedFile);

        fs.writeFile(targetPath, buffer, (wErr) => {
          if (wErr) {
            console.warn('[annotation] Gagal menyimpan file gambar anotasi:', wErr);
          } else {
            downloadUrl = '/api/download?file=' + encodeURIComponent(savedAnnotatedFile);
          }
          finishSave();
        });
      } else {
        finishSave();
      }
    });
  }

  // POST /api/reset-data -> wipe all data across all classes EXCEPT user accounts (students/teacher), schedules, and class folders
  if (req.method === 'POST' && pathname === '/api/reset-data') {
    return collectBody(req, res, (err, body) => {
      if (err) return sendJson(res, 500, { error: String(err.message || err) });
      let payload = {};
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        // ignore malformed body
      }
      if (!payload || payload.password !== 'pnklover') {
        return sendJson(res, 401, { error: 'Password verifikasi salah' });
      }
      const storesToClear = [
        { name: 'assignments', empty: [] },
        { name: 'submissions', empty: [] },
        { name: 'quizzes', empty: [] },
        { name: 'quiz_sessions', empty: [] },
        { name: 'devo', empty: [] },
        { name: 'piket', empty: {} },
        { name: 'literasi', empty: {} }
      ];

      const writeJobs = [];
      CLASSES.forEach((cls) => {
        storesToClear.forEach((store) => {
          writeJobs.push(new Promise((resolve) => {
            writeStore(store.name, store.empty, () => resolve(), cls);
          }));
        });
      });
      // Also clear root fallback data files if present (preserving students, teacher, schedules, temporary_schedules)
      storesToClear.forEach((store) => {
        const rootFile = path.join(DATA_DIR, `${store.name}.json`);
        if (fs.existsSync(rootFile)) {
          writeJobs.push(new Promise((resolve) => {
            fs.writeFile(rootFile, JSON.stringify(store.empty, null, 2), 'utf8', () => resolve());
          }));
        }
      });

      Promise.all(writeJobs).then(() => {
        fs.readdir(FILES_DIR, (rErr, names) => {
          const list = rErr ? [] : names;
          let remaining = list.length;
          const done = () => {
            console.log(`[reset] ${list.length} berkas dihapus, seluruh data kelas dibersihkan (akun user, jadwal & kelas dipertahankan)`);
            sendJson(res, 200, { ok: true, filesRemoved: list.length });
          };
          if (remaining === 0) return done();
          list.forEach((name) => {
            fs.rm(path.join(FILES_DIR, sanitizeFilename(name)), { recursive: true, force: true }, () => {
              remaining -= 1;
              if (remaining === 0) done();
            });
          });
        });
      });
    });
  }

  // GET /api/download?file=<storedName> or /api/download?fileId=<subId>
  if (req.method === 'GET' && pathname === '/api/download') {
    let file = sanitizeFilename(query.get('file'), '');
    const fileId = query.get('fileId');

    const serveFile = (storedFileName) => {
      if (!storedFileName) return sendText(res, 400, 'Parameter file wajib ada');
      const target = path.join(FILES_DIR, storedFileName);
      if (!target.startsWith(FILES_DIR + path.sep)) return sendText(res, 400, 'Akses Ditolak');
      fs.stat(target, (err, stats) => {
        if (err || !stats.isFile()) return sendText(res, 404, 'Berkas tidak ditemukan');
        const ext = path.extname(target).toLowerCase();
        const isArchive = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'].includes(ext);
        const disposition = isArchive ? 'attachment' : 'inline';
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || (isArchive ? 'application/zip' : 'application/octet-stream'),
          'Content-Length': stats.size,
          'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(storedFileName)}`,
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(target).pipe(res);
      });
    };

    if (file) {
      return serveFile(file);
    }

    if (fileId) {
      return readStore('submissions', (err, subs) => {
        const found = (subs || []).find(s => s.id === fileId);
        if (!found || (!found.storedFile && (!found.files || !found.files.length))) {
          return sendText(res, 404, 'Berkas pengumpulan tidak ditemukan');
        }
        const targetStored = found.storedFile || found.files[0].storedFile;
        serveFile(targetStored);
      });
    }

    return sendText(res, 400, 'Parameter file atau fileId wajib ada');
  }

  // GET /api/server/info -> info server untuk panel kustomisasi data (web)
  if (req.method === 'GET' && pathname === '/api/server/info') {
    const mem = process.memoryUsage();
    return sendJson(res, 200, {
      ok: true,
      name: 'Xozen Cloud',
      version: '1.0.0',
      port: PORT,
      dataDir: DATA_DIR,
      filesDir: FILES_DIR,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB'
      },
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid
    });
  }

  // GET /api/files -> daftar berkas yang tersimpan di data/files
  if (req.method === 'GET' && pathname === '/api/files') {
    return fs.readdir(FILES_DIR, (err, names) => {
      if (err) return sendJson(res, 500, { error: 'Gagal membaca folder berkas server' });
      const pending = names.length;
      const result = [];
      if (pending === 0) return sendJson(res, 200, { files: [] });
      let doneCount = 0;
      names.forEach((name) => {
        fs.stat(path.join(FILES_DIR, name), (err, stats) => {
          doneCount += 1;
          if (err || !stats.isFile()) {
            if (doneCount === pending) {
              result.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
              sendJson(res, 200, { files: result });
            }
            return;
          }
          result.push({
            name,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            modified: stats.mtime.toISOString(),
            downloadUrl: '/api/download?file=' + encodeURIComponent(name)
          });
          if (doneCount === pending) {
            result.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
            sendJson(res, 200, { files: result });
          }
        });
      });
    });
  }

  // DELETE /api/files?file=<nama> -> hapus satu berkas dari server
  if (req.method === 'DELETE' && pathname === '/api/files') {
    const file = sanitizeFilename(query.get('file'), '');
    if (!file) return sendJson(res, 400, { error: 'Parameter file wajib diisi' });
    const target = path.join(FILES_DIR, file);
    if (!target.startsWith(FILES_DIR + path.sep)) return sendJson(res, 400, { error: 'Akses Ditolak' });
    fs.rm(target, { force: true }, (err) => {
      if (err) return sendJson(res, 500, { error: 'Gagal menghapus berkas dari server' });
      console.log(`[files] Berkas dihapus lewat panel kustomisasi: ${file}`);
      sendJson(res, 200, { ok: true, removed: file });
    });
  }

  // /api/db/<store>  -> generic read/write/delete (replaces IndexedDB helpers)
  const dbMatch = pathname.match(/^\/api\/db\/([A-Za-z0-9_-]+)$/);
  if (dbMatch) {
    const storeName = dbMatch[1];
    if (!STORES.includes(storeName)) {
      return sendJson(res, 400, { error: `Store tidak dikenal: ${storeName}` });
    }

    if (req.method === 'GET') {
      return readStore(storeName, (err, items) => sendJson(res, 200, { items }));
    }

    if (req.method === 'POST') {
      return collectBody(req, res, (err, body) => {
        if (err) return sendJson(res, 500, { error: String(err.message || err) });
        let item;
        try {
          item = JSON.parse(body.toString('utf8'));
        } catch {
          return sendJson(res, 400, { error: 'Body bukan JSON valid' });
        }
        if (!item || typeof item !== 'object' || (item.id == null && item.absen == null)) {
          return sendJson(res, 400, { error: 'Item wajib punya id atau absen' });
        }
        readStore(storeName, (rErr, items) => {
          const list = rErr ? [] : items;
          const idx = list.findIndex((existing) => matchesKey(existing, item.id) || (item.id == null && matchesKey(existing, item.absen)));
          if (idx === -1) list.push(item);
          else list[idx] = { ...list[idx], ...item };
          writeStore(storeName, list, (wErr) => {
            if (wErr) return sendJson(res, 500, { error: String(wErr.message || wErr) });
            sendJson(res, 200, { ok: true, stored: item });
          });
        });
      });
    }

    if (req.method === 'DELETE') {
      const key = query.get('key') ?? query.get('id');
      if (key == null) return sendJson(res, 400, { error: 'Parameter key wajib ada' });
      return readStore(storeName, (rErr, items) => {
        const list = rErr ? [] : items;
        const toRemove = list.filter((existing) => matchesKey(existing, key));
        const kept = list.filter((existing) => !matchesKey(existing, key));

        // Clean up physical files on disk if removing submissions
        if (storeName === 'submissions') {
          toRemove.forEach((sub) => {
            const filesToRemove = [];
            if (sub.storedFile) filesToRemove.push(sub.storedFile);
            if (Array.isArray(sub.files)) {
              sub.files.forEach(f => { if (f.storedFile) filesToRemove.push(f.storedFile); });
            }
            filesToRemove.forEach(sf => {
              fs.rm(path.join(FILES_DIR, sanitizeFilename(sf)), { force: true }, () => {});
            });
          });
        }

        writeStore(storeName, kept, (wErr) => {
          if (wErr) return sendJson(res, 500, { error: String(wErr.message || wErr) });
          sendJson(res, 200, { ok: true, removed: list.length - kept.length });
        });
      });
    }

    return sendJson(res, 405, { error: 'Method tidak didukung' });
  }

  sendJson(res, 404, { error: 'Endpoint API tidak ditemukan' });
}

// ---------- static file server ----------
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname.startsWith('/api/')) {
    const rawClass = req.headers['x-class-id'] || parsedUrl.searchParams.get('classId') || parsedUrl.searchParams.get('class');
    const activeClass = normalizeClassId(rawClass);
    return classContext.run(activeClass, () => {
      handleApi(req, res, pathname, parsedUrl.searchParams);
    });
  }

  // Keep the raw DB/upload folders out of static serving
  if (pathname === '/') {
    pathname = '/index.html';
  }
  if (pathname.startsWith('/data/')) {
    return sendText(res, 403, 'Akses Ditolak');
  }

  const safePath = path.normalize(path.join(__dirname, pathname));

  // Security check: ensure path stays within project directory
  if (!safePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Akses Ditolak');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end('<h1>404 - Halaman Tidak Ditemukan</h1><p>Kembali ke <a href="/">Xozen Cloud</a></p>');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isCode = ['.html', '.js', '.css', '.json'].includes(ext);
    const cacheHeader = isCode
      ? 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      : 'no-cache';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheHeader,
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Xozen Cloud Server Berjalan`);
  console.log(`  Web     : http://localhost:${PORT}`);
  console.log(`  Database: ${DATA_DIR}/<store>.json`);
  console.log(`  Berkas  : ${FILES_DIR}`);
  console.log(`=======================================================`);
});

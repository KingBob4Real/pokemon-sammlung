// Person anlegen oder ihren Schlüssel neu setzen (gleiche ID = neuer Schlüssel, Daten bleiben):
//   npm run user:add -- "<Name>" [--id <id>] [--key-file <datei>] [--local]
// Erzeugt einen kurzen Schlüssel (oder übernimmt einen aus --key-file), legt ihn in .keys/<id>.txt
// im Projektordner ab (nicht in Git) und trägt nur seinen SHA-256-Hash in die Datenbank ein.
// Ohne --local: die echte Datenbank bei Cloudflare.
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashKey } from "../src/repositories/userRepository.js";

const KEY_CHARS = "ABCDEFGHJKMNPQRSTVWXYZ0123456789"; // ohne I, L, O, U – gut abtippbar
// 8 Zeichen = 40 Bit: leicht abzutippen; Raten scheitert schon am Tageslimit von 100.000 Anfragen
const KEY_LENGTH = 8;
const args = process.argv.slice(2);
const take = (flag, withValue = true) => {
  const i = args.indexOf(flag);
  if (i < 0) return withValue ? null : false;
  return withValue ? args.splice(i, 2)[1] : (args.splice(i, 1), true);
};
const local = take("--local", false);
const keyFile = take("--key-file");
const idArg = take("--id");
const displayName = args.join(" ").trim();
const id =
  idArg ||
  displayName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

if (!displayName || !/^[a-z0-9-]{1,40}$/.test(id)) {
  console.error('Aufruf: npm run user:add -- "<Name>" [--id <id>] [--key-file <datei>] [--local]');
  process.exit(1);
}

const key = keyFile
  ? fs.readFileSync(keyFile, "utf8").trim()
  : [...crypto.randomBytes(KEY_LENGTH)].map((b) => KEY_CHARS[b & 31]).join("").match(/.{4}/g).join("-");

const sql = `INSERT INTO users (id, name, key_hash, created) VALUES ('${id}', '${displayName.replace(/'/g, "''")}', '${await hashKey(key)}', ${Date.now()})
  ON CONFLICT (id) DO UPDATE SET name = excluded.name, key_hash = excluded.key_hash;`;
const sqlFile = path.join(os.tmpdir(), `pokemon-sammlung-user-${id}.sql`);
fs.writeFileSync(sqlFile, sql);
try {
  execSync(`npx wrangler d1 execute pokemon-sammlung ${local ? "--local" : "--remote"} --file "${sqlFile}"`, {
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
} finally {
  fs.rmSync(sqlFile, { force: true });
}

const keysDir = new URL("../../.keys/", import.meta.url);
fs.mkdirSync(keysDir, { recursive: true });
const file = `${id}${local ? ".local" : ""}.txt`;
fs.writeFileSync(new URL(file, keysDir), `${key}\n`);
console.log(`\nPerson „${displayName}“ (ID ${id}) gespeichert. Schlüssel: .keys/${file}`);

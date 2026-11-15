import type { E3Project } from './e3Types.ts';

/**
 * E3Flux (.e3flux) — собственный зашифрованный формат файлов проектов E3ProMax / Flux E3.
 *
 * Бинарная структура контейнера (.e3flux, v1):
 *   [0..5]   ASCII сигнатура "E3FLUX" (6 байт)
 *   [6..7]   uint16 LE: версия формата (1)
 *   [8..9]   uint16 LE: флаги (bit 0 = XOR-keystream v1, bit 1 = пользовательский пароль)
 *   [10..25] 16 байт: случайная соль (salt)
 *   [26..29] uint32 LE: контрольная сумма IEEE CRC32 открытого UTF-8 JSON payload
 *   [30..33] uint32 LE: длина открытого JSON-заголовка метаданных (metaLen)
 *   [34..34+metaLen-1]: UTF-8 JSON метаданных (без утечки схемы/цепей)
 *   [34+metaLen..end]: потоковый XOR-шифротекст UTF-8 JSON полезной нагрузки
 *
 * Текстовый конверт (для localStorage / автосохранения сессии):
 *   "E3FLUX1:<base64 от бинарного контейнера .e3flux>"
 */

export const E3FLUX_MAGIC = [0x45, 0x33, 0x46, 0x4c, 0x55, 0x58] as const; // "E3FLUX"
export const E3FLUX_FORMAT_VERSION = 1;
export const E3FLUX_ENVELOPE_PREFIX = 'E3FLUX1:';
export const E3FLUX_FILE_EXTENSION = '.e3flux';

const E3FLUX_FLAG_XOR_STREAM = 0x0001;
const E3FLUX_FLAG_PASSWORD_PROTECTED = 0x0002;
const E3FLUX_HEADER_FIXED_SIZE = 34; // 6 magic + 2 ver + 2 flags + 16 salt + 4 crc32 + 4 metaLen
const E3FLUX_APP_SECRET = 'E3ProMax::FluxECAD::E3FluxContainer::2026::GOST2.702';

export interface E3FluxMetadata {
  format: 'e3flux/v1';
  kind: 'project' | 'session' | 'recent-list';
  projectCode?: string;
  revision?: number;
  sheetsCount?: number;
  createdAt: string;
  cipher: 'xor-keystream-v1';
  passwordProtected: boolean;
}

export interface E3FluxEncodeOptions {
  password?: string;
  kind?: E3FluxMetadata['kind'];
  salt?: Uint8Array;
}

export interface E3FluxDecodeResult<T = E3Project> {
  data: T;
  metadata: E3FluxMetadata;
}

const CRC32_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[i] = c >>> 0;
  }
  return tbl;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function generateSalt16(overrideSalt?: Uint8Array): Uint8Array {
  if (overrideSalt && overrideSalt.length === 16) {
    return new Uint8Array(overrideSalt);
  }
  const salt = new Uint8Array(16);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(salt);
    return salt;
  }
  for (let i = 0; i < 16; i++) {
    salt[i] = Math.floor(Math.random() * 256) & 0xff;
  }
  return salt;
}

function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Генерирует 32-байтовый ключ потокового шифра на основе мастер-секрета E3Flux,
 * соли контейнера (16 байт) и опционального пользовательского пароля.
 */
function deriveKeyMaterial(salt: Uint8Array, password?: string): Uint32Array {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(E3FLUX_APP_SECRET);
  const pwdBytes = password ? enc.encode(password) : new Uint8Array(0);
  const combined = new Uint8Array(secretBytes.length + salt.length + pwdBytes.length + 4);
  combined.set(secretBytes, 0);
  combined.set(salt, secretBytes.length);
  combined.set(pwdBytes, secretBytes.length + salt.length);
  combined[combined.length - 4] = pwdBytes.length & 0xff;
  combined[combined.length - 3] = (pwdBytes.length >>> 8) & 0xff;
  combined[combined.length - 2] = 0x5a;
  combined[combined.length - 1] = 0xa5;

  const state = new Uint32Array(8);
  state[0] = 0x243f6a88;
  state[1] = 0x85a308d3;
  state[2] = 0x13198a2e;
  state[3] = 0x03707344;
  state[4] = 0xa4093822;
  state[5] = 0x299f31d0;
  state[6] = 0x082efa98;
  state[7] = 0xec4e6c89;

  const rounds = password ? 64 : 16;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < combined.length; i++) {
      const idx = i & 7;
      const prev = state[(idx + 7) & 7];
      state[idx] = mix32(state[idx] ^ ((combined[i] + r * 31 + i * 17) >>> 0) ^ ((prev << 5) | (prev >>> 27)));
    }
    for (let k = 0; k < 8; k++) {
      state[k] = mix32(state[k] + state[(k + 3) & 7] + ((r + 1) * 0x9e3779b9));
    }
  }
  return state;
}

/**
 * Потоковое XOR-шифрование / дешифрование с нелинейным ключевым потоком (256-битное состояние).
 */
export function xorKeystreamTransform(
  input: Uint8Array,
  salt: Uint8Array,
  password?: string
): Uint8Array {
  const keyState = deriveKeyMaterial(salt, password);
  const out = new Uint8Array(input.length);
  let blockIndex = 0;
  let blockWord0 = 0;
  let blockWord1 = 0;
  let blockWord2 = 0;
  let blockWord3 = 0;

  for (let i = 0; i < input.length; i++) {
    const posInBlock = i & 15;
    if (posInBlock === 0) {
      const ctr = blockIndex >>> 0;
      blockWord0 = mix32(keyState[0] ^ ctr ^ keyState[4]);
      blockWord1 = mix32(keyState[1] ^ Math.imul(ctr + 1, 0x9e3779b1) ^ keyState[5]);
      blockWord2 = mix32(keyState[2] ^ blockWord0 ^ keyState[6]);
      blockWord3 = mix32(keyState[3] ^ blockWord1 ^ keyState[7]);
      blockWord0 = mix32(blockWord0 + blockWord3);
      blockWord1 = mix32(blockWord1 ^ blockWord2);
      blockIndex++;
    }
    const word =
      posInBlock < 4
        ? blockWord0
        : posInBlock < 8
          ? blockWord1
          : posInBlock < 12
            ? blockWord2
            : blockWord3;
    const shift = (posInBlock & 3) * 8;
    const keyByte = (word >>> shift) & 0xff;
    out[i] = input[i] ^ keyByte;
  }

  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < len;
    const has2 = i + 2 < len;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out +=
      alphabet[(triplet >>> 18) & 0x3f] +
      alphabet[(triplet >>> 12) & 0x3f] +
      (has1 ? alphabet[(triplet >>> 6) & 0x3f] : '=') +
      (has2 ? alphabet[triplet & 0x3f] : '=');
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\r\n\s]/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Повреждённое Base64-представление контейнера E3Flux.');
  }
  const rev = new Int16Array(128).fill(-1);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < alphabet.length; i++) {
    rev[alphabet.charCodeAt(i)] = i;
  }
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = (clean.length / 4) * 3 - padding;
  const out = new Uint8Array(Math.max(0, outLen));
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = rev[clean.charCodeAt(i)] ?? -1;
    const c1 = rev[clean.charCodeAt(i + 1)] ?? -1;
    const c2 = clean[i + 2] === '=' ? 0 : (rev[clean.charCodeAt(i + 2)] ?? -1);
    const c3 = clean[i + 3] === '=' ? 0 : (rev[clean.charCodeAt(i + 3)] ?? -1);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new Error('Недопустимые символы в контейнере E3Flux.');
    }
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < out.length) out[outIdx++] = (triplet >>> 16) & 0xff;
    if (outIdx < out.length) out[outIdx++] = (triplet >>> 8) & 0xff;
    if (outIdx < out.length) out[outIdx++] = triplet & 0xff;
  }
  return out;
}

export function isE3FluxBytes(bytes: Uint8Array): boolean {
  if (bytes.length < E3FLUX_HEADER_FIXED_SIZE) return false;
  for (let i = 0; i < E3FLUX_MAGIC.length; i++) {
    if (bytes[i] !== E3FLUX_MAGIC[i]) return false;
  }
  return true;
}

export function isE3FluxEnvelope(text: string): boolean {
  return typeof text === 'string' && text.trimStart().startsWith(E3FLUX_ENVELOPE_PREFIX);
}

/**
 * Упаковывает произвольный сериализуемый объект (E3Project или ActiveSessionRecord)
 * в бинарный зашифрованный контейнер E3Flux (.e3flux).
 */
export function encodeE3FluxPayload<T>(
  payload: T,
  metaHints: Partial<Pick<E3FluxMetadata, 'projectCode' | 'revision' | 'sheetsCount'>> = {},
  options: E3FluxEncodeOptions = {}
): Uint8Array {
  const enc = new TextEncoder();
  const jsonText = JSON.stringify(payload);
  const plainBytes = enc.encode(jsonText);
  const crc = computeCrc32(plainBytes);
  const salt = generateSalt16(options.salt);
  const trimmedPassword = options.password?.trim() || undefined;

  const metadata: E3FluxMetadata = {
    format: 'e3flux/v1',
    kind: options.kind || 'project',
    projectCode: metaHints.projectCode,
    revision: metaHints.revision,
    sheetsCount: metaHints.sheetsCount,
    createdAt: new Date().toISOString(),
    cipher: 'xor-keystream-v1',
    passwordProtected: Boolean(trimmedPassword),
  };
  const metaBytes = enc.encode(JSON.stringify(metadata));
  const encryptedBytes = xorKeystreamTransform(plainBytes, salt, trimmedPassword);

  const totalLen = E3FLUX_HEADER_FIXED_SIZE + metaBytes.length + encryptedBytes.length;
  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer);

  for (let i = 0; i < E3FLUX_MAGIC.length; i++) {
    out[i] = E3FLUX_MAGIC[i];
  }
  view.setUint16(6, E3FLUX_FORMAT_VERSION, true);
  const flags = E3FLUX_FLAG_XOR_STREAM | (trimmedPassword ? E3FLUX_FLAG_PASSWORD_PROTECTED : 0);
  view.setUint16(8, flags, true);
  out.set(salt, 10);
  view.setUint32(26, crc, true);
  view.setUint32(30, metaBytes.length, true);
  out.set(metaBytes, E3FLUX_HEADER_FIXED_SIZE);
  out.set(encryptedBytes, E3FLUX_HEADER_FIXED_SIZE + metaBytes.length);

  return out;
}

/**
 * Расшифровывает бинарный контейнер E3Flux (.e3flux), проверяет сигнатуру и CRC32 целостность.
 */
export function decodeE3FluxPayload<T = unknown>(
  bytes: Uint8Array,
  password?: string
): E3FluxDecodeResult<T> {
  if (!isE3FluxBytes(bytes)) {
    throw new Error('Файл не является контейнером E3Flux (.e3flux).');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(6, true);
  if (version !== E3FLUX_FORMAT_VERSION) {
    throw new Error(`Неподдерживаемая версия формата E3Flux: v${version}.`);
  }
  const flags = view.getUint16(8, true);
  const passwordRequired = (flags & E3FLUX_FLAG_PASSWORD_PROTECTED) !== 0;
  const salt = bytes.subarray(10, 26);
  const expectedCrc = view.getUint32(26, true);
  const metaLen = view.getUint32(30, true);

  if (
    metaLen > 1024 * 1024 ||
    E3FLUX_HEADER_FIXED_SIZE + metaLen > bytes.length
  ) {
    throw new Error('Повреждён заголовок контейнера E3Flux.');
  }

  const dec = new TextDecoder('utf-8', { fatal: true });
  let metadata: E3FluxMetadata;
  try {
    const metaJson = dec.decode(bytes.subarray(E3FLUX_HEADER_FIXED_SIZE, E3FLUX_HEADER_FIXED_SIZE + metaLen));
    metadata = JSON.parse(metaJson) as E3FluxMetadata;
  } catch {
    throw new Error('Не удалось прочитать метаданные контейнера E3Flux.');
  }

  const trimmedPassword = password?.trim() || undefined;
  if (passwordRequired && !trimmedPassword) {
    throw new Error('Файл E3Flux защищён паролем. Укажите пароль для расшифровки.');
  }

  const cipherSlice = bytes.subarray(E3FLUX_HEADER_FIXED_SIZE + metaLen);
  const decryptedBytes = xorKeystreamTransform(cipherSlice, salt, trimmedPassword);
  const actualCrc = computeCrc32(decryptedBytes);
  if (actualCrc !== expectedCrc) {
    throw new Error(
      passwordRequired
        ? 'Неверный пароль или повреждена контрольная сумма файла E3Flux.'
        : 'Файл E3Flux повреждён (ошибка контрольной суммы целостности).'
    );
  }

  try {
    const jsonText = dec.decode(decryptedBytes);
    const data = JSON.parse(jsonText) as T;
    return { data, metadata };
  } catch {
    throw new Error('Ошибка разбора расшифрованных данных E3Flux.');
  }
}

/**
 * Сериализует E3Project в зашифрованный бинарный буфер .e3flux.
 */
export function serializeE3FluxProject(
  project: E3Project,
  options: Omit<E3FluxEncodeOptions, 'kind'> = {}
): Uint8Array {
  return encodeE3FluxPayload(
    project,
    {
      projectCode: project.projectCode,
      revision: project.revision,
      sheetsCount: project.sheets.length,
    },
    { ...options, kind: 'project' }
  );
}

/**
 * Дешифрует бинарный буфер .e3flux обратно в E3Project.
 */
export function parseE3FluxProjectBytes(
  bytes: Uint8Array,
  password?: string
): E3FluxDecodeResult<E3Project> {
  const res = decodeE3FluxPayload<E3Project>(bytes, password);
  if (
    !res.data ||
    typeof res.data !== 'object' ||
    typeof res.data.id !== 'string' ||
    !Array.isArray(res.data.sheets)
  ) {
    throw new Error('Контейнер E3Flux не содержит корректной модели проекта E3Project.');
  }
  return res;
}

/**
 * Упаковывает произвольный payload в строковый зашифрованный конверт E3FLUX1:... (для localStorage).
 */
export function serializeE3FluxEnvelope<T>(
  payload: T,
  metaHints: Partial<Pick<E3FluxMetadata, 'projectCode' | 'revision' | 'sheetsCount'>> = {},
  options: E3FluxEncodeOptions = {}
): string {
  const bytes = encodeE3FluxPayload(payload, metaHints, options);
  return `${E3FLUX_ENVELOPE_PREFIX}${bytesToBase64(bytes)}`;
}

/**
 * Расшифровывает строковый конверт E3FLUX1:... обратно в объект.
 */
export function parseE3FluxEnvelope<T = unknown>(
  envelope: string,
  password?: string
): E3FluxDecodeResult<T> {
  const trimmed = envelope.trim();
  if (!isE3FluxEnvelope(trimmed)) {
    throw new Error('Строка не является конвертом E3Flux.');
  }
  const b64 = trimmed.slice(E3FLUX_ENVELOPE_PREFIX.length);
  const bytes = base64ToBytes(b64);
  return decodeE3FluxPayload<T>(bytes, password);
}

/**
 * Формирует безопасное имя файла для сохранения проекта в формате .e3flux.
 */
export function buildE3FluxFilename(project: Pick<E3Project, 'projectCode' | 'revision'>): string {
  const rawCode = String(project.projectCode || 'E3ProMax-Project').trim();
  const safeCode = rawCode.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').replace(/^-+|-+$/g, '') || 'E3ProMax-Project';
  const rev = Number.isFinite(Number(project.revision)) && Number(project.revision) > 0 ? Number(project.revision) : 1;
  return `${safeCode}-rev${rev}${E3FLUX_FILE_EXTENSION}`;
}

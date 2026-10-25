// Cálculos da previdência. Usado pelo app (index.html) e pelo teste (calc.test.js).

// Partes da conta real (aba "Cargill Prev"): Part Básica = o participante; Part Cargill = a empresa
const PARTES = [['part', 'Participante'], ['cgl', 'Cargill']];

// Modalidades da própria previdência para a simulação: [chave, nome, abreviação] (as da aba "Cargill Prev % Acumulado")
const MODS = [['sc', 'Super Conservador', 'S.Con.'], ['con', 'Conservador', 'Con.'], ['mod', 'Moderado', 'Mod.'],
  ['arr', 'Arrojado', 'Arr.'], ['sar', 'Super Arrojado', 'S.Arr.']];

// Saldo do mês de uma parte como na planilha: anterior com o % do mês + contribuição do mês.
// O app sugere este valor; o saldo do extrato pode ser digitado por cima (o % do extrato vem arredondado).
const saldoPrevisto = (anterior, taxa, aporte) => anterior * (1 + taxa / 100) + aporte;

const temAporte = m => PARTES.some(([p]) => m[p]);

// ini: {part, cgl} = saldo de cada parte antes do 1º mês
// meses: [{ym:'2026-03', part:{saldo, aporte, taxa}, cgl:{saldo, aporte, taxa}, pct:{sc, con, mod, arr, sar}}]
//   (taxa e pct em %, ex.: 0.85)
// Devolve um item por mês, do mais antigo para o mais novo (mesmas contas da aba "Cargill Prev"):
//   por parte e no total: lucro = saldo - saldo anterior - aporte;  rent = lucro / saldo anterior
//   sim[k] = saldo total que teria na modalidade k = anterior × (1 + %) + aporte total (mesmo saldo inicial e mesmos aportes)
//   acum / acumSim[k] = rentabilidade acumulada como na planilha: soma simples dos % mensais (não juros compostos)
function calcular(ini, meses) {
  const ant = { ...ini };
  const total = o => PARTES.reduce((s, [p]) => s + (o[p] || 0), 0);
  let acum = 0;
  const sim = {}, acumSim = {};
  MODS.forEach(([k]) => { sim[k] = total(ini); acumSim[k] = 0; });
  // mês só com os % da simulação (aporte ainda não lançado) fica de fora até ser lançado na aba Aporte
  return meses.filter(temAporte).sort((a, b) => a.ym.localeCompare(b.ym)).map(m => {
    const antTotal = total(ant), partes = {};
    PARTES.forEach(([p]) => {
      const { saldo = 0, aporte = 0, taxa = null } = m[p] || {};
      const lucro = saldo - (ant[p] || 0) - aporte;
      partes[p] = { saldo, aporte, taxa, lucro, rent: ant[p] ? lucro / ant[p] : 0 };
      ant[p] = saldo;
    });
    const soma = c => PARTES.reduce((s, [p]) => s + partes[p][c], 0);
    const saldo = soma('saldo'), aporte = soma('aporte'), lucro = soma('lucro');
    const rent = antTotal ? lucro / antTotal : 0;
    acum += rent;
    MODS.forEach(([k]) => {
      const p = (m.pct?.[k] ?? 0) / 100; // mês sem % lançado conta como 0%
      sim[k] = sim[k] * (1 + p) + aporte;
      acumSim[k] += p;
    });
    return { ...m, partes, saldo, aporte, lucro, rent, sim: { ...sim }, acum, acumSim: { ...acumSim } };
  });
}

// Acumulado por ano (soma dos % dos meses do ano), como o quadro "Acumulado por Ano" da planilha.
// linhas = saída de calcular(). Devolve [{ano, real, sim:{k: %}}], do ano mais antigo para o mais novo.
function porAno(linhas) {
  const anos = {};
  linhas.forEach(l => {
    const a = anos[l.ym.slice(0, 4)] ||= { ano: l.ym.slice(0, 4), real: 0, sim: Object.fromEntries(MODS.map(([k]) => [k, 0])) };
    a.real += l.rent;
    MODS.forEach(([k]) => { a.sim[k] += (l.pct?.[k] ?? 0) / 100; });
  });
  return Object.values(anos);
}

// --- Aba Financeiro: outros investimentos (cadastro livre) ---
// lancs: [{id, data:'AAAA-MM-DD', inv:'Nome', tipo:'aporte'|'saque'|'inicial', valor, pct}]  (valor em R$, pct = % de juros do lançamento)
// 'inicial' = valor que o investimento já tinha ao começar a lançar: entra no saldo, mas não conta como aporte (como o saldo inicial da previdência).
// Para cada investimento, na ordem da data: juros = saldo anterior × %; saldo = anterior + juros + aporte (ou − saque).
// Como na previdência, o aporte do lançamento não rende no próprio lançamento. Só juros (valor 0) = atualização do saldo.
function financeiro(lancs) {
  const saldo = {};
  return [...lancs].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id).map(l => {
    const ant = saldo[l.inv] || 0, juros = ant * (l.pct || 0) / 100;
    const mov = l.tipo === 'saque' ? -l.valor : l.valor; // saque entra negativo
    const aporte = l.tipo === 'inicial' ? 0 : mov;          // aportes − saques (o valor inicial fica de fora)
    saldo[l.inv] = ant + juros + mov;
    return { ...l, ym: l.data.slice(0, 7), ant, juros, mov, aporte, variacao: juros + mov, saldo: saldo[l.inv] };
  });
}

// --- Senha do app (igual à Carteira BDR): guarda só o hash (PBKDF2), nunca a senha ---
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); }; // em pedaços: o backup cifrado pode ser grande
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const aleatorio = n => crypto.getRandomValues(new Uint8Array(n));
async function hashSenha(senha, sal) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deB64(sal), iterations: 150000 }, chave, 256);
  return b64(new Uint8Array(bits));
}
// cria {sal, hash} para guardar
async function protegerSenha(senha) { const sal = b64(aleatorio(16)); return { sal, hash: await hashSenha(senha, sal) }; }
async function confereSenha(senha, g) { return !!g && await hashSenha(senha, g.sal) === g.hash; }
// código de recuperação: 12 letras/números sem os que se confundem (0/O, 1/I/L), ex.: 7K3P-9QXM-2B4T
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const gerarCodigo = () => [...aleatorio(12)].map(x => LETRAS[x % LETRAS.length]).join('').replace(/(.{4})(?!$)/g, '$1-');
const limpaCodigo = c => c.toUpperCase().replace(/[^A-Z0-9]/g, ''); // aceita com ou sem traços/espaços

// --- Backup protegido com a senha do app (igual à Carteira BDR) ---
// A chave do backup é tirada da senha com o mesmo PBKDF2 (hashSenha), mas com um sal próprio, diferente do da entrada.
// O arquivo leva o sal (para tirar a chave de novo a partir da senha) e é cifrado com AES-GCM de 256 bits.
const chaveAes = (chave, uso) => crypto.subtle.importKey('raw', deB64(chave), 'AES-GCM', false, [uso]);
async function cifrar(texto, chave) {
  const iv = aleatorio(12);
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveAes(chave, 'encrypt'), new TextEncoder().encode(texto));
  return { iv: b64(iv), dados: b64(new Uint8Array(c)) };
}
async function decifrar({ iv, dados }, chave) { // chave errada → erro (o AES-GCM confere a integridade)
  const t = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await chaveAes(chave, 'decrypt'), deB64(dados));
  return new TextDecoder().decode(t);
}

if (typeof module !== 'undefined') module.exports = { PARTES, MODS, saldoPrevisto, temAporte, calcular, porAno, financeiro,
  protegerSenha, confereSenha, gerarCodigo, limpaCodigo, hashSenha, cifrar, decifrar, b64, aleatorio };

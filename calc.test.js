// Rodar com: node calc.test.js
const assert = require('assert');
const { calcular, porAno, financeiro, saldoPrevisto, protegerSenha, confereSenha, gerarCodigo, limpaCodigo, hashSenha, cifrar, decifrar, b64, aleatorio } = require('./calc.js');
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// dados fictícios; fora de ordem de propósito
const parte = (saldo, aporte, taxa) => ({ saldo, aporte, taxa });
const l = calcular({ part: 600, cgl: 400 }, [
  { ym: '2027-01', part: parte(560, 0, 0), cgl: parte(570, 0, 0), pct: { mod: -1 } },
  { ym: '2026-12', part: parte(560, 50, 0), cgl: parte(560, 50, 0), pct: { mod: 2 } },
  { ym: '2026-11', part: parte(606, 0, 1), cgl: parte(404, 0, 1), pct: { mod: 1 } },
]);
assert.strictEqual(l[0].ym, '2026-11');
perto(l[0].saldo, 1010);
perto(l[0].lucro, 10);
perto(l[0].rent, 0.01);                        // 10 / 1000
perto(l[0].partes.part.lucro, 6);
perto(l[0].partes.cgl.rent, 0.01);             // 4 / 400
perto(l[1].aporte, 100);
perto(l[1].lucro, 10);                         // 1120 - 1010 - 100
perto(l[1].partes.part.lucro, -96);            // 560 - 606 - 50
perto(l[1].partes.cgl.lucro, 106);             // 560 - 404 - 50
perto(l[1].rent, 10 / 1010);
perto(l[1].acum, 0.01 + 10 / 1010);            // soma simples, como na planilha
perto(l[1].sim.mod, 1000 * 1.01 * 1.02 + 100); // aporte entra no fim do mês (não rende no mês)
perto(l[1].acumSim.mod, 0.03);
perto(l[1].sim.arr, 1100);                     // sem % lançado = 0%

const anos = porAno(l);
assert.deepStrictEqual(anos.map(a => a.ano), ['2026', '2027']);
perto(anos[0].sim.mod, 0.03);
perto(anos[1].sim.mod, -0.01);
perto(anos[1].real, 10 / 1120);

perto(saldoPrevisto(1000, 1.5, 200), 1000 * 1.015 + 200);

// mês só com % da simulação (sem aporte lançado) não entra nas contas; entra quando o aporte é lançado
const so = calcular({ part: 600, cgl: 400 }, [{ ym: '2026-11', part: parte(606, 0, 1), cgl: parte(404, 0, 1) }, { ym: '2026-12', pct: { mod: 2 } }]);
assert.strictEqual(so.length, 1);
perto(so[0].saldo, 1010);

// Financeiro: por valor (o % é só informação) ou só pelo % (valor = total anterior × %, conta como aporte); saque diminui
const f = financeiro([
  { id: 3, data: '2026-03-10', inv: 'CDB', tipo: 'saque', valor: 100, pct: 0 },
  { id: 1, data: '2026-01-05', inv: 'CDB', tipo: 'aporte', valor: 1000, pct: 1 },
  { id: 2, data: '2026-02-05', inv: 'CDB', tipo: 'aporte', valor: 0, pct: 2 },
  { id: 4, data: '2026-02-01', inv: 'LCI', tipo: 'aporte', valor: 500, pct: 0 },
]);
assert.deepStrictEqual(f.map(l => l.id), [1, 4, 2, 3]);
perto(f[0].saldo, 1000); assert.strictEqual(f[0].cresc, null);   // 1º aporte: sem total anterior, sem %
perto(f[2].valorCalc, 20); perto(f[2].aporte, 20); perto(f[2].juros, 0); perto(f[2].saldo, 1020); perto(f[2].cresc, 2); // só o %
perto(f[3].mov, -100); perto(f[3].aporte, -100); perto(f[3].saldo, 920); perto(f[3].cresc, -100 / 1020 * 100); // saque
perto(f[1].saldo, 500); assert.strictEqual(f[1].ym, '2026-02');
// valor inicial: entra no saldo, não conta como aporte e não tem %; aporte por valor: % = valor ÷ total anterior
const fi = financeiro([{ id: 1, data: '2026-01-01', inv: 'X', tipo: 'inicial', valor: 2000, pct: 0 }, { id: 2, data: '2026-02-01', inv: 'X', tipo: 'aporte', valor: 100, pct: 0 }]);
perto(fi[0].aporte, 0); perto(fi[0].saldo, 2000); assert.strictEqual(fi[0].cresc, null); perto(fi[1].cresc, 5); perto(fi[1].saldo, 2100);

// saldo inicial zero: 1º mês sem base para %
perto(calcular({}, [{ ym: '2026-01', part: parte(500, 500, 0) }])[0].rent, 0);

// senha: só o hash é guardado; confere a certa, recusa a errada; código de recuperação com ou sem traços
(async () => {
  const g = await protegerSenha('1234');
  assert.ok(!JSON.stringify(g).includes('1234'));
  assert.ok(await confereSenha('1234', g));
  assert.ok(!await confereSenha('12345', g));
  assert.ok(!await confereSenha('1234', null));
  const c = gerarCodigo();
  assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const gc = await protegerSenha(limpaCodigo(c));
  assert.ok(await confereSenha(limpaCodigo(c.toLowerCase().replace(/-/g, ' ')), gc));
  // backup cifrado: abre com a chave da mesma senha e sal; com senha errada dá erro; texto grande e com acentos volta igual
  const sal = b64(aleatorio(16)), chave = await hashSenha('senha forte 123', sal);
  const texto = JSON.stringify({ meses: Array.from({ length: 3000 }, (_, i) => ({ ym: '2026-01', nome: 'Previdência ' + i })) });
  const cif = await cifrar(texto, chave);
  assert.ok(!cif.dados.includes('Previdência'));
  assert.strictEqual(await decifrar(cif, await hashSenha('senha forte 123', sal)), texto);
  await assert.rejects(decifrar(cif, await hashSenha('senha errada', sal)));
  console.log('ok');
})();

// Pix "copia e cola" estático (padrão BR Code do Banco Central, sobre EMV QR Code).
// Gerado no próprio aparelho: sem banco, sem API, sem custo. A conferência do pagamento é pelo extrato.

export type TipoChavePix = 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';

export interface DadosPix {
  chave: string;
  tipoChave?: TipoChavePix;
  nome: string; // nome do recebedor (até 25 caracteres)
  cidade: string; // cidade do recebedor (até 15 caracteres)
  valor?: number; // em reais; sem valor, o pagador digita
  txid?: string; // identificador (até 25 letras/números), aparece no extrato de muitos bancos
  descricao?: string; // mensagem opcional ao pagador
}

/** CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), como exige o BR Code. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(texto);
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Remove acentos e símbolos fora do padrão (o BR Code aceita só caracteres básicos). */
export function textoPix(s: string, max: number): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function normalizarChavePix(chave: string, tipo?: TipoChavePix): string {
  const c = chave.trim();
  switch (tipo) {
    case 'cpf':
    case 'cnpj':
      return c.replace(/\D/g, '');
    case 'telefone': {
      const d = c.replace(/\D/g, '');
      return `+${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`;
    }
    case 'email':
    case 'aleatoria':
      return c.toLowerCase();
    default:
      return c;
  }
}

function campo(id: string, valor: string): string {
  if (valor.length > 99) throw new Error(`Campo ${id} do Pix maior que 99 caracteres.`);
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

export function gerarPix(d: DadosPix): string {
  const chave = normalizarChavePix(d.chave, d.tipoChave);
  if (!chave) throw new Error('Chave Pix não configurada.');
  const nome = textoPix(d.nome, 25);
  const cidade = textoPix(d.cidade, 15);
  if (!nome || !cidade) throw new Error('Informe nome e cidade do recebedor do Pix.');
  const txid = (d.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  let conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const descricao = d.descricao ? textoPix(d.descricao, 72) : '';
  if (descricao && conta.length + 4 + descricao.length <= 99) conta += campo('02', descricao);

  let payload =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    (d.valor && d.valor > 0 ? campo('54', d.valor.toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', nome) +
    campo('60', cidade) +
    campo('62', campo('05', txid));
  payload += '6304';
  return payload + crc16(payload);
}

/** Lê os campos de um payload (usado nos testes e para conferência). */
export function lerPix(payload: string): Record<string, string> {
  const campos: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const tam = Number(payload.slice(i + 2, i + 4));
    campos[id] = payload.slice(i + 4, i + 4 + tam);
    i += 4 + tam;
  }
  return campos;
}

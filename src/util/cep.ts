// Busca de endereço pelo CEP (ViaCEP, gratuito). Só o CEP sai do aparelho.
export interface EnderecoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
  /** Código IBGE do município (7 dígitos), exigido pela NFS-e e pela NF-e. */
  codigoMunicipio: string;
}

export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const n = cep.replace(/\D/g, '');
  if (n.length !== 8) return null;
  const r = await fetch(`https://viacep.com.br/ws/${n}/json/`);
  if (!r.ok) throw new Error('Não foi possível consultar o CEP agora.');
  const j = (await r.json()) as Record<string, string | boolean>;
  if (j.erro) return null;
  return {
    cep: n,
    logradouro: String(j.logradouro ?? ''),
    bairro: String(j.bairro ?? ''),
    municipio: String(j.localidade ?? ''),
    uf: String(j.uf ?? ''),
    codigoMunicipio: String(j.ibge ?? ''),
  };
}

export function fmtCep(cep?: string | null): string {
  const n = (cep ?? '').replace(/\D/g, '');
  return n.length === 8 ? `${n.slice(0, 5)}-${n.slice(5)}` : cep ?? '';
}

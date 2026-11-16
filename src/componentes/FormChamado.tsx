// Formulário de abertura de chamado (portal do cliente e registro interno).
import { useState, type FormEvent } from 'react';
import type { Equipamento, OrigemChamado } from '../tipos';
import { descreverEquipamento, rotuloOrigem } from '../util/formato';
import { SeletorFotos } from './Fotos';
import { AreaTexto, Aviso, Botao, Campo, Cartao, Selecao, useOnline } from './ui';

export interface DadosFormChamado {
  equipamento: Equipamento | null;
  descricaoOutro: string;
  relato: string;
  parado: boolean;
  contato: string;
  origem: OrigemChamado;
  fotos: Uint8Array[];
}

export function FormChamado({
  equipamentos,
  equipamentoInicial,
  interno,
  aoEnviar,
}: {
  equipamentos: Equipamento[];
  equipamentoInicial?: string | null;
  interno?: boolean;
  aoEnviar: (d: DadosFormChamado) => Promise<void>;
}) {
  const online = useOnline();
  const inicialValido = equipamentoInicial && equipamentos.some((e) => e.id === equipamentoInicial) ? equipamentoInicial : '';
  const [equipamentoId, setEquipamentoId] = useState<string>(inicialValido);
  const [descricaoOutro, setDescricaoOutro] = useState('');
  const [relato, setRelato] = useState('');
  const [parado, setParado] = useState<boolean | null>(null);
  const [contato, setContato] = useState('');
  const [origem, setOrigem] = useState<OrigemChamado>(interno ? 'whatsapp' : 'portal');
  const [fotos, setFotos] = useState<Uint8Array[]>([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const qrDeOutro = !!equipamentoInicial && !inicialValido;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!equipamentoId) return setErro('Escolha o equipamento (ou "Outro equipamento").');
    if (equipamentoId === 'outro' && !descricaoOutro.trim()) return setErro('Descreva qual é o equipamento.');
    if (!relato.trim()) return setErro('Conte o que está acontecendo com o equipamento.');
    if (parado === null) return setErro('Informe se o equipamento está parado.');
    if (!navigator.onLine) return setErro('É preciso estar com internet para abrir o chamado.');
    setEnviando(true);
    try {
      await aoEnviar({
        equipamento: equipamentos.find((x) => x.id === equipamentoId) ?? null,
        descricaoOutro,
        relato,
        parado,
        contato,
        origem,
        fotos,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível abrir o chamado.');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      {qrDeOutro && <Aviso tom="alerta">O equipamento do QR code não está vinculado a esta conta. Escolha na lista abaixo.</Aviso>}
      {!online && <Aviso tom="alerta">Você está sem internet. O chamado só pode ser aberto com conexão.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Selecao rotulo="Equipamento" value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)}>
          <option value="">Escolha o equipamento…</option>
          {equipamentos.map((eq) => (
            <option key={eq.id} value={eq.id}>{descreverEquipamento(eq)}</option>
          ))}
          <option value="outro">Outro equipamento (não está na lista)</option>
        </Selecao>
        {equipamentoId === 'outro' && (
          <Campo rotulo="Qual equipamento?" value={descricaoOutro} onChange={(e) => setDescricaoOutro(e.target.value)} placeholder="Ex.: compressor da sala 3, marca Schulz" />
        )}
        <AreaTexto
          rotulo="O que está acontecendo?"
          rows={5}
          value={relato}
          onChange={(e) => setRelato(e.target.value)}
          placeholder="Ex.: a autoclave não termina o ciclo e mostra erro E3 no visor."
        />
        <div className="campo">
          <span className="campo-rotulo">O equipamento está parado?</span>
          <div className="escolha">
            <button type="button" className="escolha-perigo" aria-pressed={parado === true} onClick={() => setParado(true)}>
              Sim, parado
            </button>
            <button type="button" aria-pressed={parado === false} onClick={() => setParado(false)}>
              Não, funcionando
            </button>
          </div>
        </div>
        <div className="campo">
          <span className="campo-rotulo">Fotos (opcional, até 3)</span>
          <SeletorFotos fotos={fotos} aoMudar={setFotos} />
          <span className="campo-ajuda">Fotos do visor, da peça ou do erro ajudam o técnico a chegar com a peça certa. Vídeos, mande pelo WhatsApp.</span>
        </div>
        <Campo rotulo="Contato e melhor horário (opcional)" value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Ex.: falar com a Júlia, de manhã" />
        {interno && (
          <Selecao rotulo="Como o cliente pediu" value={origem} onChange={(e) => setOrigem(e.target.value as OrigemChamado)}>
            {(['whatsapp', 'telefone', 'presencial'] as OrigemChamado[]).map((o) => (
              <option key={o} value={o}>{rotuloOrigem[o]}</option>
            ))}
          </Selecao>
        )}
      </Cartao>
      <Botao type="submit" carregando={enviando} disabled={!online} bloco>
        {enviando ? 'Enviando…' : 'Abrir chamado'}
      </Botao>
    </form>
  );
}

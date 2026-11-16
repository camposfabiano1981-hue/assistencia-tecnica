// Alerta de chamado novo: som, vibração e notificação do sistema (com o app aberto).
let audio: AudioContext | null = null;

export function prepararAlertas(): Promise<NotificationPermission | 'indisponivel'> {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    /* sem áudio */
  }
  if (!('Notification' in window)) return Promise.resolve('indisponivel');
  return Notification.requestPermission();
}

export function alertasAtivos(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

export function tocarAlerta(): void {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const t0 = ctx.currentTime;
    [0, 0.32].forEach((d, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.28);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.3);
    });
  } catch {
    /* sem áudio */
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* sem vibração */
  }
}

export async function notificar(titulo: string, corpo: string, url: string): Promise<void> {
  if (!alertasAtivos()) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(titulo, { body: corpo, icon: '/pwa-192.png', badge: '/pwa-192.png', tag: url, data: { url } });
      return;
    }
  } catch {
    /* segue para a API simples */
  }
  try {
    new Notification(titulo, { body: corpo, icon: '/pwa-192.png' });
  } catch {
    /* Android sem service worker: só som e vibração */
  }
}

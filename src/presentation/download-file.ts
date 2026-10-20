'use client';

export async function downloadFile(blob: Blob, filename: string) {
  const bridge = (window as Window & { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView;
  if (!bridge) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  if (blob.size > 8 * 1024 * 1024) throw new Error('Para archivos de más de 8 MB, descarga el respaldo desde el navegador.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('No se pudo preparar el archivo.'));
    reader.readAsDataURL(blob);
  });
  const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('mi-balance-export-result', result); };
    const result = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.id !== id) return;
      cleanup();
      if (detail.error) reject(new Error(detail.error)); else resolve();
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('No se completó la exportación. Vuelve a intentarlo.')); }, 300000);
    window.addEventListener('mi-balance-export-result', result);
    bridge.postMessage(JSON.stringify({ type: 'mi-balance-export', id, filename, base64 }));
  });
}

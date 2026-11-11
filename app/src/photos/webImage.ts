// Web version only. Shrinks a picture to a JPEG using the browser's own canvas. Expo's image tool
// never finished in a browser when tested on 2026-11-11 (the app sat on "Reading your photo…"
// with no request ever sent), so the web version does this step itself.
export async function shrinkToJpegBase64(uri: string, targetWidth: number, quality: number): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Could not open that picture'));
    element.src = uri;
  });
  // Never enlarge a small picture.
  const scale = Math.min(1, targetWidth / (image.naturalWidth || targetWidth));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((image.naturalWidth || targetWidth) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || targetWidth) * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare pictures');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (!base64) throw new Error('Could not prepare the picture');
  return base64;
}

// Gives up on something that is taking too long, so a screen that says "reading…" can never be
// left that way for good.
export function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

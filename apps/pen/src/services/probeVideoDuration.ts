/** Load video metadata once (editor attach / timeline duration). */

export function probeVideoFileDurationSec(resolvedUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const finish = () => {
      const seconds = video.duration;
      video.removeAttribute('src');
      video.load();
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    };
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('error', () => resolve(null), { once: true });
    video.src = resolvedUrl;
  });
}

export type IosPushSnapshot = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
};

export function shouldShowIosHomeScreenGuide(nav: IosPushSnapshot): boolean {
  if (nav.standalone) return false;
  const ua = nav.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  if (!iOSDevice) return false;
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(ua);
  return safari;
}

export function readIosPushSnapshot(): IosPushSnapshot {
  if (typeof navigator === "undefined") {
    return { userAgent: "", platform: "", maxTouchPoints: 0, standalone: false };
  }
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone,
  };
}

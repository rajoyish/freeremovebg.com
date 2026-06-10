export const ADSENSE_CLIENT: string = (
  import.meta.env.PUBLIC_ADSENSE_CLIENT ?? ""
).trim();

export const ADSENSE_ENABLED: boolean = ADSENSE_CLIENT.startsWith("ca-pub-");

export const ADSENSE_LOADER_SRC: string = ADSENSE_ENABLED
  ? `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
  : "";

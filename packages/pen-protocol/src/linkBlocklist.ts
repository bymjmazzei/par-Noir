/**
 * Hosts a Pen button may never open. A host matches itself and every subdomain.
 * IP loggers leak the viewer's address on click; open tunnels front throwaway phishing kits.
 */
export const LINK_BLOCKLIST: readonly string[] = [
  'grabify.link',
  'iplogger.org',
  'iplogger.com',
  'iplogger.ru',
  'iplogger.info',
  '2no.co',
  'yip.su',
  'blasze.com',
  'ps3cfw.com',
  'ngrok.io',
  'ngrok-free.app',
  'ngrok.app',
  'trycloudflare.com',
  'loca.lt',
  'serveo.net',
  'localtunnel.me'
];

/** Link shorteners hide the real destination. */
export const LINK_SHORTENERS: readonly string[] = [
  'bit.ly',
  'bitly.com',
  't.co',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at',
  'rb.gy',
  't.ly',
  'tiny.cc',
  's.id'
];

export function hostMatches(host: string, list: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return list.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

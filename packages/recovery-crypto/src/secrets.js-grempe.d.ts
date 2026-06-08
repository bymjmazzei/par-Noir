declare module 'secrets.js-grempe' {
  const secrets: {
    init: (bits: number) => void;
    share: (secret: string, numShares: number, threshold: number) => string[];
    combine: (shares: string[]) => string;
  };
  export default secrets;
}

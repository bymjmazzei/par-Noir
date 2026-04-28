export const generateRandomNickname = (): string => {
  const randomArray = new Uint32Array(1);
  crypto.getRandomValues(randomArray);
  const randomNumbers = Math.floor((randomArray[0] / 0xFFFFFFFF) * 900000000) + 100000000;
  return `pN${randomNumbers}`;
};


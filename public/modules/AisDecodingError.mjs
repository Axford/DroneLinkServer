export default class DecodingError extends Error {
  constructor(message, sentence) {
    if (sentence) {
      super(`${message} (${sentence})`);
    } else {
      super(message);
    }
  }
}
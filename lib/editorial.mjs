export const briefLimits = { subject: 200, contribution: 400, approach: 600, objective: 300 };

export function validateBrief(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('La ficha editorial no es válida.');
  return Object.fromEntries(Object.entries(briefLimits).map(([key, max]) => {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new Error('La ficha editorial contiene un texto demasiado largo.');
    return [key, value.trim()];
  }));
}
// Suggestions can only be used with the exact editor state that requested them.
export function suggestionSession(read, apply) {
  let generation = 0, disposed = false, snapshot = '', result;
  return {
    async generate(request) {
      const token = ++generation;
      const input = read(), fingerprint = JSON.stringify(input);
      result = undefined;
      const value = await request(input);
      if (disposed || token !== generation) return false;
      if (JSON.stringify(read()) !== fingerprint) return false;
      snapshot = fingerprint; result = value;
      return value;
    },
    use(index) {
      if (disposed || !result?.options[index] || JSON.stringify(read()) !== snapshot) return false;
      apply(result.options[index]); result = undefined;
      return true;
    },
    dispose() { disposed = true; generation++; result = undefined; },
  };
}

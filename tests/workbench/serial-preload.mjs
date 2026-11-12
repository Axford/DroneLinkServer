import { registerHooks } from 'node:module';

const fixture = new URL('./serial-binding.mjs', import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'serialport' && context.parentURL?.endsWith('/SerialInterface.mjs')) {
      return { url: fixture.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

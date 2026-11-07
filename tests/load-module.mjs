import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Load the actual browser modules with controlled DOM/ML boundaries, without
// downloading models or adding a second test framework. `path` is relative to
// this directory; `mocks` replaces imports by specifier.
export async function loadModule(path, mocks = {}, globals = {}) {
  const context = vm.createContext({ Blob, File, URL, console, setTimeout, clearTimeout,
    navigator: { userAgent: 'iPhone', maxTouchPoints: 5 }, ...globals });
  const cache = new Map();
  async function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const source = await readFile(url, 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    } });
    const module = new vm.SourceTextModule(outputText, {
      context, identifier: url.href,
      initializeImportMeta: meta => { meta.url = url.href; },
      importModuleDynamically: async specifier => {
        const imported = await resolve(specifier, module);
        if (imported.status === 'unlinked') await imported.link(resolve);
        if (imported.status !== 'evaluated') await imported.evaluate();
        return imported;
      },
    });
    cache.set(url.href, module);
    // Not linked here: link() on the root walks the whole graph through
    // resolve(). Linking each module as it loads raced when two modules
    // imported the same dependency.
    return module;
  }
  async function resolve(specifier, parent) {
    if (specifier in mocks) {
      const exports = mocks[specifier];
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    }
    assert.ok(specifier.startsWith('.'), `Unexpected dependency: ${specifier}`);
    return load(new URL(`${specifier}.ts`, parent.identifier));
  }
  const module = await load(new URL(path, import.meta.url));
  await module.link(resolve);
  await module.evaluate();
  return module.namespace;
}

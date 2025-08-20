# Jopi Loader

## What is it?

It's a loader, which allows coustom imports for types for node.js and bun.js. His main goal is allowing doing React SSR (server side)
with a high libary compatibility.

* For Node.js and bun.js, it allows:
  * Importing css module `import style from "style.module.css`.
  * Importing scss module `import style from "style.module.scss`.

* For Node.js, it allows:
  * Importing CSS, images, font.
  * When imported the value returned is the full path to the resource.
  * Ex: `import cssFilePath from "my-style.css"`.

It's also export a module for EsBuild, in order to enable css-modules.

## How to use?

The loader need to be loader before others modules, it's why you need to use a special functionality.


Exemple for node.js:
```
node --import jopi-loader ./myScript.js
```

Exemple for bun.js:
```
bun --preload jopi-loader ./myScript.js
```

With bun, you can also use a `bunfig.toml` file.

```toml
preload = ["jopi-loader"]
```

See: https://bun.com/docs/runtime/plugins

## Typescript config

If you are using TypeScript, you need an extra entry in your `tsconfig.json` file.
This file allows Typescript to know how to handle this imports.

```json
{
  "compilerOptions": {
    "types": ["jopi-loader"]
  }
}
```


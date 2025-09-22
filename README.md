# Jopi Loader

## What is it?

It's a loader, which allows custom imports for types for node.js and bun.js. His main goal is allowing doing React SSR (server side)
with a high libary compatibility.

* For Node.js and bun.js, it allows:
  * Importing css module `import style from "style.module.css`.
  * Importing scss module `import style from "style.module.scss`.

* For Node.js, it allows:
  * Importing CSS, images, font.
  * When imported the value returned is the full path to the resource.
  * Ex: `import cssFilePath from "my-style.css"`.

It's also export a module for EsBuild, to enable css-modules.

## How to use?

See documentation for `jopin` tool, which automatic things [link](https://github.com/johanpiquet/jopin).
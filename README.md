# @gusok/rollup-create-dist-packagejson

**[日本語版READMEはこちら](./README-ja.md)**

`@gusok/rollup-create-dist-packagejson` is a Rollup plugin that edits the `package.json` during the build process and outputs it in the appropriate format in the output directory.  
It was created with the goal of outputting only the minimum required fields in the `package.json` for publishing to npm,  
as well as assisting in publishing the library with a flat directory structure.

## Installation

```sh
npm install @gusok/rollup-create-dist-packagejson --save-dev
```

## Usage

Configure it in `rollup.config.js` as follows:

```js
import createDistPackageJson from '@gusok/rollup-create-dist-packagejson';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    createDistPackageJson({
      content: {
        main: './index.js',
        types: './index.d.ts',
      },
    }),
  ],
};
```

## Options

### `content`

- `Partial<PackageJson>` or `(packageJson: PackageJson) => Partial<PackageJson>`
- Specifies the content of the generated `package.json`.

### `inheritProps`

- `string[]`
- Specifies properties to inherit from the original `package.json`.
- Default: `['name', 'version', 'description', 'repository', 'bugs', 'homepage', 'author', 'contributors', 'license', 'type', 'engines', 'keywords']`

### `inputDir`

- `string | undefined`
- Specifies the directory where the original `package.json` is located.
- Default: Current directory

### `packagesDir`

- `string | undefined`
- Specifies the path to the directory containing workspace packages.
- Default: `'..'`

### `outputDir`

- `string | undefined`
- Specifies the output directory for `package.json`.
- Default: Retrieved from Rollup's `output` settings

### `processor`

- `(packageJson: PackageJson) => PackageJson`
- Processes the final `package.json` before output.

## License

MIT License

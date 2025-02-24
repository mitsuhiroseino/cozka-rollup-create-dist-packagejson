# @gusok/rollup-create-dist-packagejson

**[English README is available here](./README.md)**

`@gusok/rollup-create-dist-packagejson` は、Rollup のビルドプロセス中に `package.json` を編集し、  
出力ディレクトリに適切な形式で生成するためのプラグインです。  
npmへ公開する`package.json`に最低限の項目のみで出力し、  
ライブラリのディレクトリ構成をフラットにしたい場合に利用する目的で作成しました。

## インストール

```sh
npm install @gusok/rollup-create-dist-packagejson --save-dev
```

## 使い方

`rollup.config.js` に以下のように設定します。

```js
import createDistPackageJson from '@gusok/rollup-create-dist-packagejson';
import { defineConfig } from 'rollup';

export default defineConfig({
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
});
```

## オプション

### `content`

- `Partial<PackageJson>` または `(packageJson: PackageJson) => Partial<PackageJson>`
- 生成する `package.json` の内容を指定できます。

### `inheritProps`

- `string[]`
- 元の `package.json` から継承するプロパティを指定します。
- デフォルト: `['name', 'version', 'author', 'license']`

### `inputDir`

- `string | undefined`
- 元の `package.json` のあるディレクトリを指定します。
- デフォルト: カレントディレクトリ

### `packagesDir`

- `string | undefined`
- ワークスペースのパッケージが格納されているディレクトリのパスを指定します。
- デフォルト: `'..'`

### `outputDir`

- `string | undefined`
- `package.json` の出力先ディレクトリを指定します。
- デフォルト: `rollup` の `output` 設定から取得

### `processor`

- `(packageJson: PackageJson) => PackageJson`
- 最終的に `package.json` を出力する前に加工処理を行います。

## ライセンス

MIT License

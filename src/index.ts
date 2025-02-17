import fs from 'fs-extra';
import path from 'path';
import { Options as ReadOptions, readPackageSync } from 'read-pkg';
import { NormalizedOutputOptions, OutputBundle, Plugin } from 'rollup';
import { writePackageSync } from 'write-pkg';
import sortPackageJson from 'sort-package-json';
import { PackageJson } from 'type-fest';

/**
 * オプション
 */
export type CreateDistPackageJsonOptions = {
  /**
   * コンテンツ
   */
  content?:
    | Partial<PackageJson>
    | ((packageJson: PackageJson) => Partial<PackageJson>);

  /**
   * 元のpackage.jsonから引き継ぐ項目
   * デフォルトは`['name', 'version', 'author', 'license']`
   */
  inheritProps?: string[];

  /**
   * 入力元ディレクトリ
   * 未指定の場合はカレントディレクトリ
   */
  inputDir?: string;

  /**
   * 出力先ディレクトリ
   * 未指定の場合はrollupのoutput設定から取得
   */
  outputDir?: string;

  /**
   * 出力前の仕上げ処理
   */
  finish?: (packageJson: PackageJson) => PackageJson;
};

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

const WORKSPACE_DEPS = /^(?:\*|workspace:.+|portal:.+)$/;
const INHERIT_PROPS = ['name', 'version', 'author', 'license'];

/**
 * package.jsonを編集しビルド結果のディレクトリに出力するプラグイン
 */
export default function createDistPackageJson(
  options: CreateDistPackageJsonOptions = {},
): Plugin {
  const {
    content = {},
    inheritProps = INHERIT_PROPS,
    inputDir,
    outputDir,
    finish = (packageJson) => packageJson,
  } = options;

  return {
    name: 'create-dist-packagejson',
    generateBundle: async (
      outputOptions: NormalizedOutputOptions,
      bundle: OutputBundle,
    ) => {
      // 開発時用のpackage.jsonを取得
      const options: Mutable<ReadOptions> = { normalize: false };
      if (inputDir) {
        options.cwd = inputDir;
      }
      const orgPackageJson = readPackageSync(options);
      // ビルドされたパッケージ用のpackage.jsonのベースを取得
      const packageJson =
        typeof content === 'function'
          ? content(orgPackageJson)
          : { ...content };

      // バンドルされるモジュール内でimportしているものを全て取得
      const imports = Object.values(bundle).reduce((result, chunk) => {
        if ('imports' in chunk) {
          chunk.imports.forEach((item) => {
            result.add(item);
          });
        }
        return result;
      }, new Set<string>());

      // 全てのimportの中から、開発時用のpackage.jsonのdependenciesに含まれる外部のパッケージを取得
      const orgDeps = orgPackageJson.dependencies || {};
      const dependencies: Record<string, string> = {};
      imports.forEach((item) => {
        if (!item.endsWith('.js')) {
          const tokens = item.split(/[/\\]/);
          for (let i = Math.min(tokens.length, 2); 0 < i; i--) {
            const pkg = tokens.slice(0, i).join('/');
            if (pkg in orgDeps) {
              dependencies[pkg] = orgDeps[pkg];
              break;
            }
          }
        }
      });

      if (packageJson.dependencies) {
        // baseのdependenciesとマージ
        Object.assign(dependencies, packageJson.dependencies);
      }

      // ワークスペース内のdependenciesは実際のバージョンに置き換え
      for (const pkg in dependencies) {
        if (WORKSPACE_DEPS.test(dependencies[pkg])) {
          const pkgJson = _getPckageJson(pkg);
          if (pkgJson) {
            dependencies[pkg] = pkgJson.version;
          }
        }
      }

      // dependenciesを出力に反映
      packageJson.dependencies = dependencies;

      // 主要なプロパティが未設定で、開発時用のpackage.jsonにあれば設定
      if (inheritProps) {
        for (const prop of inheritProps) {
          if (!packageJson[prop] && orgPackageJson[prop]) {
            packageJson[prop] = orgPackageJson[prop];
          }
        }
      }

      // ビルド先に出力
      const outputPath =
        outputDir || outputOptions.dir || path.dirname(outputOptions.file);
      writePackageSync(outputPath, sortPackageJson(finish(packageJson)), {
        indent: 2,
      });
    },
  };
}

function _getPckageJson(pkg: string) {
  const currentPath = path.resolve('.');
  const parentPath = path.dirname(currentPath);
  const pkgJsonPath = path.join(parentPath, pkg, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      return fs.readJsonSync(pkgJsonPath);
    } catch (e) {
      return;
    }
  } else {
    return;
  }
}

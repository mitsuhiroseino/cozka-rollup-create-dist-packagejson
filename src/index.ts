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
   * 入力元ディレクトリ
   * 未指定の場合はカレントディレクトリ
   */
  inputDir?: string;

  /**
   * 出力先ディレクトリ
   * 未指定の場合はrollupのoutput設定から取得
   */
  outputDir?: string;
};

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

const WORKSPACE_DEPS = /^(?:\*|workspace:.+|portal:.+)$/;
const MAIN_PROPS = ['name', 'version', 'author', 'license'];

/**
 * package.jsonを編集しビルド結果のディレクトリに出力するプラグイン
 */
export default function createDistPackageJson(
  options: CreateDistPackageJsonOptions = {},
): Plugin {
  const { content: base = {}, inputDir, outputDir } = options;

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
        typeof base === 'function' ? base(orgPackageJson) : { ...base };

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
      const tempDeps: Record<string, string> = {};
      imports.forEach((item) => {
        if (!item.endsWith('.js')) {
          const tokens = item.split(/[/\\]/);
          if (tokens.length === 1) {
            const pkg = tokens[0];
            if (pkg in orgDeps) {
              tempDeps[pkg] = orgDeps[pkg];
            }
          } else {
            const pkg = `${tokens[0]}/${tokens[1]}`;
            if (pkg in orgDeps) {
              tempDeps[pkg] = orgDeps[pkg];
            }
          }
        }
      });

      if (packageJson.dependencies) {
        // baseのdependenciesとマージ
        Object.assign(tempDeps, packageJson.dependencies);
      }

      // ワークスペース内のdependenciesは実際のバージョンに置き換え
      for (const pkg in tempDeps) {
        if (WORKSPACE_DEPS.test(tempDeps[pkg])) {
          const pkgJson = _getPckageJson(pkg);
          if (pkgJson) {
            tempDeps[pkg] = pkgJson.version;
          }
        }
      }

      // パッケージ名でソート
      const dependencies = {};
      Object.keys(tempDeps)
        .sort()
        .forEach((pkg) => {
          dependencies[pkg] = tempDeps[pkg];
        });

      // dependenciesを出力に反映
      packageJson.dependencies = dependencies;

      // 主要なプロパティが未設定で、開発時用のpackage.jsonにあれば設定
      for (const prop of MAIN_PROPS) {
        if (!packageJson[prop] && orgPackageJson[prop]) {
          packageJson[prop] = orgPackageJson[prop];
        }
      }

      // ビルド先に出力
      const outputPath =
        outputDir || outputOptions.dir || path.dirname(outputOptions.file);
      writePackageSync(outputPath, sortPackageJson(packageJson), { indent: 2 });
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
